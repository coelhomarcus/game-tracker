import { and, count, eq, ilike, inArray, ne, notExists, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { type DmPolicy, conversationParticipants, conversations, follows, gameEntries, posts, users } from '../db/schema';
import { decodeTimelineCursor, encodeTimelineCursor } from '../lib/cursor';
import { AppError } from '../lib/errors';
import { getPublicBaseUrl } from '../lib/publicUrl';
import { isUuid } from '../lib/uuid';
import { deleteAvatarIfLocal, deleteBannerIfLocal, saveAvatar, saveBanner } from '../lib/uploads';
import { disconnectUser } from '../socket/realtime';
import * as authService from './auth.service';
import * as conversationsService from './conversations.service';
import * as moderationService from './moderation.service';
import * as notificationsService from './notifications.service';
import * as postsService from './posts.service';

/**
 * Pessoas pelo username ou nome. Quem tem bloqueio com quem busca (em qualquer sentido) não aparece.
 * `canMessage` diz, na mesma consulta, se quem busca pode mandar mensagem para cada pessoa agora.
 */
export async function search(viewerId: string, term: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isFollowedByMe: sql<boolean>`${follows.id} is not null`,
      canMessage: conversationsService.canMessageSql(viewerId),
    })
    .from(users)
    .leftJoin(follows, and(eq(follows.followerId, viewerId), eq(follows.followingId, users.id)))
    .where(
      and(
        or(ilike(users.username, `%${term}%`), ilike(users.name, `%${term}%`)),
        ne(users.id, viewerId),
        notInArray(users.id, moderationService.blockedEitherWaySql(viewerId)),
      ),
    )
    .limit(20);
}

export async function getPublicProfile(viewerId: string, targetId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, targetId),
    columns: { id: true, username: true, name: true, avatarUrl: true, bannerUrl: true, bio: true, createdAt: true },
  });
  if (!user) throw new AppError(404, 'not_found', 'Usuário não encontrado');

  const [followerCountRows, followingCountRows, gameEntryCountRows, followRow, followsMeRow] = await Promise.all([
    db.select({ value: count() }).from(follows).where(eq(follows.followingId, targetId)),
    db.select({ value: count() }).from(follows).where(eq(follows.followerId, targetId)),
    db.select({ value: count() }).from(gameEntries).where(eq(gameEntries.userId, targetId)),
    viewerId === targetId
      ? null
      : db.query.follows.findFirst({
          where: and(eq(follows.followerId, viewerId), eq(follows.followingId, targetId)),
        }),
    // `followsMe`: a pessoa do perfil segue quem está vendo.
    viewerId === targetId
      ? null
      : db.query.follows.findFirst({
          where: and(eq(follows.followerId, targetId), eq(follows.followingId, viewerId)),
        }),
  ]);
  // Com bloqueio o perfil continua abrindo (nome, bio e contagens), mas as abas vêm vazias.
  const [flags, canMessage] = await Promise.all([
    moderationService.relationFlags(viewerId, targetId),
    // Se quem vê pode mandar mensagem para a pessoa agora (bloqueio e política dela). Falso no próprio perfil.
    conversationsService.canMessage(viewerId, targetId),
  ]);

  return {
    ...user,
    followerCount: followerCountRows[0]!.value,
    followingCount: followingCountRows[0]!.value,
    gameEntryCount: gameEntryCountRows[0]!.value,
    isFollowedByMe: followRow != null,
    followsMe: followsMeRow != null,
    ...flags,
    canMessage,
  };
}

interface FollowListRow extends Record<string, unknown> {
  follow_id: string;
  at_text: string;
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_followed_by_me: boolean;
  follows_me: boolean;
}

/**
 * Quem segue (`followers`) ou é seguido por (`following`) um usuário, o follow mais recente
 * primeiro. Paginação keyset por (follows.created_at, follows.id), com microssegundos como nas
 * linhas do tempo. Cada item leva o resumo da pessoa e a relação dela com quem está vendo.
 */
export async function listFollows(
  viewerId: string,
  targetId: string,
  direction: 'followers' | 'following',
  cursor: string | undefined,
  limit: number,
) {
  const decoded = cursor === undefined ? null : decodeTimelineCursor(cursor);
  if (cursor !== undefined && !decoded) throw new AppError(400, 'validation_error', 'Cursor inválido');
  if (!isUuid(targetId) || !(await db.query.users.findFirst({ where: eq(users.id, targetId), columns: { id: true } }))) {
    throw new AppError(404, 'not_found', 'Usuário não encontrado');
  }
  // Com bloqueio entre quem vê e o dono da lista, a lista vem vazia.
  if (await moderationService.isBlockedEitherWay(viewerId, targetId)) return { items: [], nextCursor: null };

  // Seguidores: a pessoa listada é quem segue (follower_id). Seguindo: é quem é seguido (following_id).
  const [ownSide, personSide] =
    direction === 'followers' ? [follows.followingId, follows.followerId] : [follows.followerId, follows.followingId];
  const cut = decoded
    ? sql`and (${follows.createdAt}, ${follows.id}) < (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
    : sql``;

  const result = await db.execute<FollowListRow>(sql`
    select ${follows.id} as follow_id,
      to_char(${follows.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text,
      u.id, u.username, u.name, u.avatar_url, u.bio,
      exists(select 1 from ${follows} mine where mine.follower_id = ${viewerId} and mine.following_id = u.id) as is_followed_by_me,
      exists(select 1 from ${follows} theirs where theirs.follower_id = u.id and theirs.following_id = ${viewerId}) as follows_me
    from ${follows}
    join ${users} u on u.id = ${personSide}
    where ${ownSide} = ${targetId} ${cut}
      and u.id not in ${moderationService.blockedEitherWaySql(viewerId)}
    order by ${follows.createdAt} desc, ${follows.id} desc
    limit ${limit + 1}
  `);

  const rows = result.rows;
  const page = rows.slice(0, limit);
  const items = page.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isFollowedByMe: row.is_followed_by_me === true,
    followsMe: row.follows_me === true,
  }));
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeTimelineCursor({ at: last.at_text, id: last.follow_id, kind: 'post' }) : null;
  return { items, nextCursor };
}

interface SuggestionRow extends Record<string, unknown> {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  followed_by_count: number;
  follows_me: boolean;
}

/**
 * "Sugestões para seguir": quem é seguido por quem eu sigo, primeiro quem mais dos meus seguidos
 * segue (`followedByCount`), depois quem tem mais seguidores. Faltando gente para `limit`, o resto
 * vem dos mais seguidos em geral (a mesma ordem, com `followedByCount` 0). Nunca traz a mim, quem eu
 * já sigo, quem tem bloqueio comigo (em qualquer sentido) nem quem eu silenciei.
 */
export async function suggestions(viewerId: string, limit: number) {
  const result = await db.execute<SuggestionRow>(sql`
    with mine as (
      select f.following_id as id from ${follows} f where f.follower_id = ${viewerId}
    ),
    follower_counts as (
      select fc.following_id as id, count(*)::int as n from ${follows} fc group by fc.following_id
    ),
    followed_by_mine as (
      select fm.following_id as id, count(*)::int as n
      from ${follows} fm
      join mine on mine.id = fm.follower_id
      group by fm.following_id
    )
    select u.id, u.username, u.name, u.avatar_url, u.bio,
      coalesce(fbm.n, 0) as followed_by_count,
      exists(select 1 from ${follows} theirs where theirs.follower_id = u.id and theirs.following_id = ${viewerId}) as follows_me
    from ${users} u
    left join followed_by_mine fbm on fbm.id = u.id
    left join follower_counts fc on fc.id = u.id
    where u.id <> ${viewerId}
      and u.id not in (select id from mine)
      and u.id not in ${moderationService.hiddenAuthorsSql(viewerId, true)}
    order by coalesce(fbm.n, 0) desc, coalesce(fc.n, 0) desc, u.created_at desc, u.id
    limit ${limit}
  `);

  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    name: row.name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    isFollowedByMe: false as const,
    followsMe: row.follows_me === true,
    followedByCount: Number(row.followed_by_count),
  }));
}

export async function follow(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new AppError(400, 'invalid_operation', 'Não é possível seguir a si mesmo');
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, followingId) });
  if (!target) throw new AppError(404, 'not_found', 'Usuário não encontrado');

  // Uma instrução só: o follow entra apenas se não houver bloqueio entre os dois, sem a janela
  // entre "checar" e "inserir" de duas consultas separadas.
  const inserted = await db.execute<{ id: string }>(sql`
    insert into ${follows} (follower_id, following_id)
    select ${followerId}::uuid, ${followingId}::uuid
    where ${followingId}::uuid not in ${moderationService.blockedEitherWaySql(followerId)}
    on conflict (follower_id, following_id) do nothing
    returning id
  `);

  if (inserted.rows.length === 0) {
    // Nada entrou: ou há bloqueio (403) ou já seguia (seguir de novo é idempotente).
    if (await moderationService.isBlockedEitherWay(followerId, followingId)) {
      throw new AppError(403, 'blocked', 'Não é possível seguir: há um bloqueio entre vocês');
    }
    return;
  }
  // Só notifica quando a relação foi realmente criada.
  await notificationsService.notify({ userId: followingId, actorId: followerId, type: 'follow' });
}

export async function unfollow(followerId: string, followingId: string) {
  await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
}

export async function updateProfile(
  userId: string,
  input: { username?: string; name?: string; bio?: string; dmPolicy?: DmPolicy },
) {
  if (input.username) {
    const existing = await db.query.users.findFirst({ where: eq(users.username, input.username) });
    if (existing && existing.id !== userId) {
      throw new AppError(409, 'conflict', 'Username já está em uso');
    }
  }

  // Corpo vazio é válido (nada a alterar); o Drizzle rejeitaria um SET sem colunas.
  if (Object.keys(input).length === 0) return;

  try {
    await db.update(users).set(input).where(eq(users.id, userId));
  } catch (err) {
    // Duas trocas simultâneas para o mesmo username passam pela checagem acima; quem perde
    // a corrida bate na restrição de unicidade do banco (23505).
    if ((err as { code?: string; cause?: { code?: string } }).code === '23505' || (err as { cause?: { code?: string } }).cause?.code === '23505') {
      throw new AppError(409, 'conflict', 'Username já está em uso');
    }
    throw err;
  }
}

/**
 * Apaga a conta de quem está logado, depois de conferir a senha. O banco leva junto, em cascata,
 * sessões, posts (com likes, comentários, imagens e notificações), reposts, salvos, follows,
 * bloqueios, silenciados, registros de jogos, favoritos, instalações de push, participações em
 * conversas e as mensagens, reações e ocultações dessa pessoa. As conversas continuam para a outra
 * pessoa, sem o par. As citações dos posts apagados ficam, marcadas como removidas, como em
 * `deletePost`. Depois os sockets caem e os arquivos (avatar, capa, imagens de posts) saem do disco,
 * sem que uma falha ali desfaça a exclusão.
 */
export async function deleteAccount(userId: string, password: string) {
  await authService.assertPassword(userId, password);

  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { avatarUrl: true, bannerUrl: true },
  });
  const postImageUrls = await postsService.postImageUrlsOf(userId);

  await db.transaction(async (tx) => {
    const ownPosts = tx.select({ id: posts.id }).from(posts).where(eq(posts.userId, userId));
    // Marca as citações antes: apagar zera `quoted_post_id` pela FK, e a marca é o que sobra.
    await tx.update(posts).set({ quotedPostRemoved: true }).where(inArray(posts.quotedPostId, ownPosts));
    // Conversas em que a pessoa estava: se a outra já tinha saído, sobrariam sem participantes.
    const memberOf = await tx
      .select({ id: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .where(eq(conversationParticipants.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
    const conversationIds = memberOf.map((row) => row.id);
    if (conversationIds.length > 0) {
      await tx
        .delete(conversations)
        .where(
          and(
            inArray(conversations.id, conversationIds),
            notExists(
              tx
                .select({ id: conversationParticipants.id })
                .from(conversationParticipants)
                .where(eq(conversationParticipants.conversationId, conversations.id)),
            ),
          ),
        );
    }
  });

  // Quem ainda tem um token de acesso válido (até 15 min) não reabre a conexão: o handshake confere a conta.
  disconnectUser(userId);

  // Os arquivos saem em segundo plano: uma conta com milhares de imagens não atrasa a resposta, e
  // uma falha aqui nunca desfaz a exclusão.
  void Promise.allSettled([
    deleteAvatarIfLocal(current?.avatarUrl ?? null),
    deleteBannerIfLocal(current?.bannerUrl ?? null),
    postsService.removeUnusedPostImageFiles(postImageUrls),
  ]).catch((err) => console.error('[users] não foi possível limpar os arquivos da conta excluída:', err));
}

export async function updateAvatar(userId: string, buffer: Buffer) {
  const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true } });

  const relativePath = await saveAvatar(buffer);
  const avatarUrl = `${getPublicBaseUrl()}${relativePath}`;

  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  void deleteAvatarIfLocal(current?.avatarUrl ?? null);

  return avatarUrl;
}

export async function updateBanner(userId: string, buffer: Buffer) {
  const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { bannerUrl: true } });

  const relativePath = await saveBanner(buffer);
  const bannerUrl = `${getPublicBaseUrl()}${relativePath}`;

  await db.update(users).set({ bannerUrl }).where(eq(users.id, userId));
  void deleteBannerIfLocal(current?.bannerUrl ?? null);

  return bannerUrl;
}

export async function removeAvatar(userId: string) {
  const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { avatarUrl: true } });
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
  void deleteAvatarIfLocal(current?.avatarUrl ?? null);
}

export async function removeBanner(userId: string) {
  const current = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { bannerUrl: true } });
  await db.update(users).set({ bannerUrl: null }).where(eq(users.id, userId));
  void deleteBannerIfLocal(current?.bannerUrl ?? null);
}
