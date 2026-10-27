import { and, count, eq, ilike, ne, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { follows, gameEntries, users } from '../db/schema';
import { decodeTimelineCursor, encodeTimelineCursor } from '../lib/cursor';
import { AppError } from '../lib/errors';
import { getPublicBaseUrl } from '../lib/publicUrl';
import { isUuid } from '../lib/uuid';
import { deleteAvatarIfLocal, deleteBannerIfLocal, saveAvatar, saveBanner } from '../lib/uploads';
import * as moderationService from './moderation.service';
import * as notificationsService from './notifications.service';

/** Pessoas pelo username ou nome. Quem tem bloqueio com quem busca (em qualquer sentido) não aparece. */
export async function search(viewerId: string, term: string) {
  return db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isFollowedByMe: sql<boolean>`${follows.id} is not null`,
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
  const flags = await moderationService.relationFlags(viewerId, targetId);

  return {
    ...user,
    followerCount: followerCountRows[0]!.value,
    followingCount: followingCountRows[0]!.value,
    gameEntryCount: gameEntryCountRows[0]!.value,
    isFollowedByMe: followRow != null,
    followsMe: followsMeRow != null,
    ...flags,
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

export async function follow(followerId: string, followingId: string) {
  if (followerId === followingId) {
    throw new AppError(400, 'invalid_operation', 'Não é possível seguir a si mesmo');
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, followingId) });
  if (!target) throw new AppError(404, 'not_found', 'Usuário não encontrado');
  if (await moderationService.isBlockedEitherWay(followerId, followingId)) {
    throw new AppError(403, 'blocked', 'Não é possível seguir: há um bloqueio entre vocês');
  }

  // Só notifica quando a relação foi realmente criada; seguir de novo é idempotente.
  const inserted = await db
    .insert(follows)
    .values({ followerId, followingId })
    .onConflictDoNothing({ target: [follows.followerId, follows.followingId] })
    .returning({ id: follows.id });

  if (inserted.length > 0) {
    await notificationsService.notify({ userId: followingId, actorId: followerId, type: 'follow' });
  }
}

export async function unfollow(followerId: string, followingId: string) {
  await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
}

export async function updateProfile(userId: string, input: { username?: string; name?: string; bio?: string }) {
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
