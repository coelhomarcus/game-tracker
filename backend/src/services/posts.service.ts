import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../db';
import {
  bookmarks,
  commentLikes,
  comments,
  follows,
  gameEntries,
  gameEntryStatusEnum,
  games,
  likes,
  postImages,
  postTypeEnum,
  posts,
  reposts,
  users,
} from '../db/schema';
import { AppError } from '../lib/errors';
import { getPublicBaseUrl } from '../lib/publicUrl';
import { deletePostImageIfLocal, inspectIssuedPostImage, savePostImage } from '../lib/uploads';
import { decodeCursor, decodeTimelineCursor, encodeCursor, encodeTimelineCursor, type TimelineKind } from '../lib/cursor';
import * as notificationsService from './notifications.service';

type PostType = (typeof postTypeEnum.enumValues)[number];
type GameEntryStatus = (typeof gameEntryStatusEnum.enumValues)[number];

const userColumns = { id: true, username: true, name: true, avatarUrl: true } as const;

export interface UserSummary {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Largura/altura nulas só na imagem legada (`posts.image_url`), que nunca teve as medidas salvas. */
export interface PostImage {
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
}

interface ImageRow {
  url: string;
  width: number;
  height: number;
  alt: string | null;
}

/** As imagens da tabela, em ordem; sem nenhuma, a `imageUrl` legada vira a única imagem. */
function imagesOf(rows: ImageRow[], legacyImageUrl: string | null): PostImage[] {
  if (rows.length > 0) return rows.map(({ url, width, height, alt }) => ({ url, width, height, alt }));
  return legacyImageUrl ? [{ url: legacyImageUrl, width: null, height: null, alt: null }] : [];
}

/**
 * Os posts com autor, jogo, imagens e o resumo do post citado — uma consulta só (o relational
 * query do Drizzle junta as relações com subconsultas laterais). O resumo citado tem um nível:
 * não traz a citação dele.
 */
async function loadPostRows(ids: string[]) {
  const imageColumns = { url: true, width: true, height: true, alt: true } as const;
  return db.query.posts.findMany({
    where: inArray(posts.id, ids),
    with: {
      user: { columns: userColumns },
      gameEntry: { with: { game: true } },
      game: true,
      images: { columns: imageColumns, orderBy: [asc(postImages.position)] },
      quotedPost: {
        columns: { id: true, content: true, type: true, activityStatus: true, imageUrl: true, createdAt: true },
        with: {
          user: { columns: userColumns },
          game: true,
          images: { columns: imageColumns, orderBy: [asc(postImages.position)] },
        },
      },
    },
  });
}

/**
 * Contadores e o estado de quem vê, uma linha por post. Cada valor é uma subconsulta pelo índice
 * da tabela (unique post_id+user_id, comments.post_id, posts.quoted_post_id), então uma página
 * custa uma consulta, sem carregar as linhas de likes/comentários pra contar.
 */
async function loadPostStats(ids: string[], viewerId: string) {
  const countOf = (query: SQL) => sql<number>`(${query})`.mapWith(Number);
  const existsIn = (query: SQL) => sql<boolean>`exists(${query})`.mapWith((value) => value === true || value === 't');
  return db
    .select({
      id: posts.id,
      likeCount: countOf(sql`select count(*) from ${likes} where ${likes.postId} = ${posts.id}`),
      commentCount: countOf(sql`select count(*) from ${comments} where ${comments.postId} = ${posts.id}`),
      repostCount: countOf(sql`select count(*) from ${reposts} where ${reposts.postId} = ${posts.id}`),
      // Alias na tabela de dentro: sem ele, "posts"."id" apontaria para a própria citação.
      quoteCount: countOf(sql`select count(*) from ${posts} quotes where quotes.quoted_post_id = ${posts.id}`),
      bookmarkCount: countOf(sql`select count(*) from ${bookmarks} where ${bookmarks.postId} = ${posts.id}`),
      likedByMe: existsIn(sql`select 1 from ${likes} where ${likes.postId} = ${posts.id} and ${likes.userId} = ${viewerId}`),
      repostedByMe: existsIn(
        sql`select 1 from ${reposts} where ${reposts.postId} = ${posts.id} and ${reposts.userId} = ${viewerId}`,
      ),
      bookmarkedByMe: existsIn(
        sql`select 1 from ${bookmarks} where ${bookmarks.postId} = ${posts.id} and ${bookmarks.userId} = ${viewerId}`,
      ),
    })
    .from(posts)
    .where(inArray(posts.id, ids));
}

type PostRow = Awaited<ReturnType<typeof loadPostRows>>[number];
type PostStats = Omit<Awaited<ReturnType<typeof loadPostStats>>[number], 'id'>;

function mapPost(row: PostRow, stats: PostStats) {
  const { images: imageRows, quotedPost, ...rest } = row;
  const images = imagesOf(imageRows, row.imageUrl);
  return {
    ...rest,
    // Compatibilidade: `imageUrl` continua sendo a primeira imagem.
    imageUrl: images[0]?.url ?? null,
    images,
    quotedPost: quotedPost
      ? {
          id: quotedPost.id,
          user: quotedPost.user,
          content: quotedPost.content,
          type: quotedPost.type,
          activityStatus: quotedPost.activityStatus,
          images: imagesOf(quotedPost.images, quotedPost.imageUrl),
          game: quotedPost.game,
          createdAt: quotedPost.createdAt,
        }
      : null,
    ...stats,
  };
}

export type PostView = ReturnType<typeof mapPost>;

/** Posts completos por id (três consultas no total, qualquer que seja o tamanho da lista). */
async function hydratePosts(ids: string[], viewerId: string): Promise<Map<string, PostView>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  // Em sequência de propósito: o stand-in de teste (PGlite) mistura consultas simultâneas.
  const rows = await loadPostRows(unique);
  const stats = new Map((await loadPostStats(unique, viewerId)).map(({ id, ...s }) => [id, s]));
  const result = new Map<string, PostView>();
  for (const row of rows) {
    const rowStats = stats.get(row.id);
    if (rowStats) result.set(row.id, mapPost(row, rowStats));
  }
  return result;
}

async function getPostById(id: string, viewerId: string) {
  return (await hydratePosts([id], viewerId)).get(id);
}

export async function getById(id: string, viewerId: string) {
  const post = await getPostById(id, viewerId);
  if (!post) throw new AppError(404, 'not_found', 'Post não encontrado');
  return post;
}

interface CreatePostInput {
  content: string;
  gameEntryId?: string;
  gameId?: string;
  /**
   * Só setado internamente por `createActivityPost` (gameEntries.service.ts)
   * — nunca fica exposto no schema público de criação de post, senão um
   * cliente poderia forjar o ícone de qualquer post comum.
   */
  activityStatus?: GameEntryStatus;
  type: PostType;
  /** Legado: equivale a `images: [{ url }]`. */
  imageUrl?: string;
  /** Imagens já enviadas por `POST /posts/images`, na ordem de exibição (no máximo 4). */
  images?: { url: string; width: number; height: number; alt?: string }[];
  quotedPostId?: string;
}

/** Salva uma imagem de post e devolve a URL pública dela com o tamanho final. */
export async function uploadImage(buffer: Buffer) {
  const saved = await savePostImage(buffer);
  return { url: `${getPublicBaseUrl()}${saved.path}`, width: saved.width, height: saved.height };
}

/**
 * Só vale uma imagem que esta API emitiu e que ainda existe. O tamanho gravado é o do arquivo, não
 * o que o cliente mandou (a proporção desenha o layout de quem vê o post).
 */
async function resolveImages(images: NonNullable<CreatePostInput['images']>) {
  const sizes = await Promise.all(images.map((image) => inspectIssuedPostImage(image.url)));
  return images.map((image, position) => {
    const size = sizes[position];
    if (!size) throw new AppError(400, 'validation_error', 'Imagem não reconhecida: envie por POST /posts/images');
    return { url: image.url, width: size.width, height: size.height, alt: image.alt || null, position };
  });
}

export async function create(userId: string, input: CreatePostInput) {
  // gameId é a verdade única de "sobre qual jogo é este post": deriva do
  // gameEntryId quando existe (o playthrough já sabe o jogo), senão usa o
  // gameId manual — que só precisa existir no catálogo, sem exigir posse
  // (diferente de gameEntryId, que continua exigindo dono).
  let resolvedGameId: string | undefined = input.gameId;

  if (input.gameEntryId) {
    const entry = await db.query.gameEntries.findFirst({ where: eq(gameEntries.id, input.gameEntryId) });
    if (!entry || entry.userId !== userId) {
      throw new AppError(404, 'not_found', 'Registro de jogo não encontrado');
    }
    resolvedGameId = entry.gameId;
  } else if (input.gameId) {
    const game = await db.query.games.findFirst({ where: eq(games.id, input.gameId) });
    if (!game) throw new AppError(404, 'not_found', 'Jogo não encontrado');
  }

  const quoted = input.quotedPostId ? await getPostOrThrow(input.quotedPostId) : null;
  // O `imageUrl` legado é a primeira imagem: passa pela mesma validação e ganha sua linha em
  // `post_images` (o tamanho enviado aqui é só um espaço reservado; vale o do arquivo).
  const requested = input.images?.length ? input.images : input.imageUrl ? [{ url: input.imageUrl, width: 1, height: 1 }] : [];
  const images = await resolveImages(requested);

  const values = {
    userId,
    content: input.content,
    gameEntryId: input.gameEntryId,
    gameId: resolvedGameId,
    activityStatus: input.activityStatus,
    type: input.type,
    // `imageUrl` segue sendo a primeira imagem (compatibilidade com quem lê só ele).
    imageUrl: images[0]?.url,
    quotedPostId: quoted?.id,
  };
  // Com imagens são duas escritas (o post e as linhas das imagens): ou entram as duas ou nenhuma.
  // Sem imagens é uma escrita só, que dispensa a transação.
  const created =
    images.length === 0
      ? (await db.insert(posts).values(values).returning())[0]!
      : await db.transaction(async (tx) => {
          const [row] = await tx.insert(posts).values(values).returning();
          await tx.insert(postImages).values(images.map((image) => ({ ...image, postId: row!.id })));
          return row!;
        });

  // A notificação abre a citação (o post novo), não o original que o autor já conhece.
  if (quoted) {
    await notificationsService.notify({ userId: quoted.userId, actorId: userId, type: 'quote', postId: created.id });
  }
  // Quem já recebeu a notificação de citação não recebe também a de menção.
  await notificationsService.notifyMentions({
    text: input.content,
    actorId: userId,
    postId: created.id,
    skip: quoted ? [quoted.userId] : [],
  });

  return getPostById(created.id, userId);
}

/**
 * De onde vêm os itens de uma linha do tempo: o filtro dos posts originais e o dos reposts
 * (`null` = sem reposts). Os dois filtros são escritos sobre `posts` e `reposts` sem alias.
 */
interface TimelineSource {
  posts: SQL;
  reposts: SQL | null;
}

interface TimelineRow extends Record<string, unknown> {
  kind: TimelineKind;
  item_id: string;
  at_text: string;
  post_id: string;
  reposter_id: string | null;
  reposter_username: string | null;
  reposter_name: string | null;
  reposter_avatar_url: string | null;
}

export type RepostReason = { type: 'repost'; by: UserSummary; at: Date };

/**
 * Linha do tempo de posts originais e reposts, pela hora da atividade (`posts.created_at` ou
 * `reposts.created_at`) desc, depois id desc e tipo desc — ordem total, então a paginação keyset
 * não repete nem pula itens. O mesmo original pode aparecer de novo pelo repost de outra pessoa,
 * mas nunca duas vezes pelo mesmo repostador (unique post_id+user_id em `reposts`).
 *
 * Cada ramo já corta pelo cursor (com `<=`, que usa o índice (created_at, id)) e pelo limite;
 * o corte exato, que inclui o tipo, é feito depois da união. Três consultas por página: a união,
 * os posts e os contadores.
 */
async function timeline(viewerId: string, source: TimelineSource, cursor: string | undefined, limit: number) {
  const decoded = cursor === undefined ? null : decodeTimelineCursor(cursor);
  if (cursor !== undefined && !decoded) throw new AppError(400, 'validation_error', 'Cursor inválido');

  const branchLimit = limit + 2;
  const postsCut = decoded
    ? sql`and (${posts.createdAt}, ${posts.id}) <= (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
    : sql``;
  const postsBranch = sql`(
    select 'post'::text as kind, ${posts.id} as item_id, ${posts.createdAt} as at, ${posts.id} as post_id,
      null::uuid as reposter_id
    from ${posts}
    where ${source.posts} ${postsCut}
    order by ${posts.createdAt} desc, ${posts.id} desc
    limit ${branchLimit}
  )`;

  let repostsBranch = sql``;
  if (source.reposts) {
    const repostsCut = decoded
      ? sql`and (${reposts.createdAt}, ${reposts.id}) <= (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
      : sql``;
    repostsBranch = sql`union all (
      select 'repost'::text as kind, ${reposts.id} as item_id, ${reposts.createdAt} as at,
        ${reposts.postId} as post_id, ${reposts.userId} as reposter_id
      from ${reposts}
      where ${source.reposts} ${repostsCut}
      order by ${reposts.createdAt} desc, ${reposts.id} desc
      limit ${branchLimit}
    )`;
  }

  const exactCut = decoded
    ? sql`where (f.at, f.item_id, f.kind) < (${decoded.at}::timestamptz, ${decoded.id}::uuid, ${decoded.kind}::text)`
    : sql``;

  const result = await db.execute<TimelineRow>(sql`
    select f.kind, f.item_id, f.post_id, f.reposter_id,
      to_char(f.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text,
      u.username as reposter_username, u.name as reposter_name, u.avatar_url as reposter_avatar_url
    from (${postsBranch} ${repostsBranch}) f
    left join ${users} u on u.id = f.reposter_id
    ${exactCut}
    order by f.at desc, f.item_id desc, f.kind desc
    limit ${limit + 1}
  `);

  const rows = result.rows;
  const page = rows.slice(0, limit);
  const postsById = await hydratePosts(
    page.map((r) => r.post_id),
    viewerId,
  );

  const items: (PostView & { reason: RepostReason | null })[] = [];
  for (const row of page) {
    // Um post apagado entre a união e a hidratação some da página; o cursor continua valendo.
    const post = postsById.get(row.post_id);
    if (!post) continue;
    const reason: RepostReason | null =
      row.kind === 'repost' && row.reposter_id && row.reposter_username !== null
        ? {
            type: 'repost',
            by: {
              id: row.reposter_id,
              username: row.reposter_username,
              name: row.reposter_name,
              avatarUrl: row.reposter_avatar_url,
            },
            at: new Date(row.at_text),
          }
        : null;
    items.push({ ...post, reason });
  }

  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeTimelineCursor({ at: last.at_text, id: last.item_id, kind: last.kind }) : null;

  return { items, nextCursor };
}

export async function getFeed(
  userId: string,
  cursor: string | undefined,
  limit: number,
  scope: 'following' | 'general' = 'following',
) {
  if (scope === 'general') {
    return timeline(userId, { posts: sql`true`, reposts: sql`true` }, cursor, limit);
  }
  // Seguindo: posts e reposts de quem o usuário segue, mais os dele mesmo.
  const followed = (column: typeof posts.userId | typeof reposts.userId) =>
    sql`(${column} = ${userId} or ${column} in (select ${follows.followingId} from ${follows} where ${follows.followerId} = ${userId}))`;
  return timeline(userId, { posts: followed(posts.userId), reposts: followed(reposts.userId) }, cursor, limit);
}

/**
 * Posts de um perfil. Os reposts do usuário entram junto (com `reason`), exceto na aba de
 * atividade (`type: 'activity'`), que mostra só as atividades dele.
 */
export async function getUserPosts(
  viewerId: string,
  targetUserId: string,
  cursor: string | undefined,
  limit: number,
  type?: 'activity' | 'post',
) {
  const typeFilter = type === 'activity' ? eq(posts.type, 'activity') : type === 'post' ? ne(posts.type, 'activity') : undefined;
  const postsFilter = typeFilter ? and(eq(posts.userId, targetUserId), typeFilter)! : eq(posts.userId, targetUserId);
  const repostsFilter = type === 'activity' ? null : eq(reposts.userId, targetUserId);
  return timeline(viewerId, { posts: postsFilter, reposts: repostsFilter }, cursor, limit);
}

/**
 * Busca posts pelo texto (ILIKE '%termo%', sem diferenciar maiúsculas), do mais novo ao mais antigo,
 * na mesma linha do tempo paginada dos demais (cursor keyset com microssegundos). Só posts
 * originais; `%`, `_` e `\` do termo valem como caracteres comuns. Ainda sem filtro de moderação.
 */
export async function searchPosts(viewerId: string, term: string, cursor: string | undefined, limit: number) {
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
  return timeline(viewerId, { posts: sql`${posts.content} ilike ${pattern}`, reposts: null }, cursor, limit);
}

/** Posts sobre um jogo: só os originais. */
export async function getGamePosts(gameId: string, viewerId: string, cursor: string | undefined, limit: number) {
  return timeline(viewerId, { posts: eq(posts.gameId, gameId), reposts: null }, cursor, limit);
}

export async function getUserComments(targetUserId: string, cursor: string | undefined, limit: number) {
  const cursorFilter = cursor
    ? (() => {
        const decoded = decodeCursor(cursor);
        return sql`(${comments.createdAt}, ${comments.id}) < (${decoded.createdAt.toISOString()}, ${decoded.id})`;
      })()
    : undefined;

  const whereFilter = eq(comments.userId, targetUserId);

  const results = await db.query.comments.findMany({
    where: cursorFilter ? and(whereFilter, cursorFilter) : whereFilter,
    orderBy: [desc(comments.createdAt), desc(comments.id)],
    limit: limit + 1,
    with: { post: { with: { user: { columns: userColumns } } } },
  });

  const hasMore = results.length > limit;
  const items = results.slice(0, limit);
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { items, nextCursor };
}

async function getPostOrThrow(postId: string) {
  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) throw new AppError(404, 'not_found', 'Post não encontrado');
  return post;
}

export async function like(userId: string, postId: string) {
  const post = await getPostOrThrow(postId);

  // `returning` vem vazio quando o like já existia (conflito ignorado): curtir de novo é
  // idempotente e não pode gerar outra notificação nem outro push.
  const inserted = await db
    .insert(likes)
    .values({ postId, userId })
    .onConflictDoNothing({ target: [likes.postId, likes.userId] })
    .returning({ id: likes.id });

  if (inserted.length > 0) {
    await notificationsService.notify({ userId: post.userId, actorId: userId, type: 'like', postId });
  }
}

export async function unlike(userId: string, postId: string) {
  await getPostOrThrow(postId);
  await db.delete(likes).where(and(eq(likes.postId, postId), eq(likes.userId, userId)));
}

/** Repostar de novo é idempotente: só o primeiro repost notifica. Repostar o próprio post vale, sem notificar. */
export async function repost(userId: string, postId: string) {
  const post = await getPostOrThrow(postId);
  const inserted = await db
    .insert(reposts)
    .values({ postId, userId })
    .onConflictDoNothing({ target: [reposts.postId, reposts.userId] })
    .returning({ id: reposts.id });

  if (inserted.length > 0) {
    await notificationsService.notify({ userId: post.userId, actorId: userId, type: 'repost', postId });
  }
}

export async function unrepost(userId: string, postId: string) {
  await getPostOrThrow(postId);
  await db.delete(reposts).where(and(eq(reposts.postId, postId), eq(reposts.userId, userId)));
}

/** Salvos são privados e não geram notificação. */
export async function bookmark(userId: string, postId: string) {
  await getPostOrThrow(postId);
  await db
    .insert(bookmarks)
    .values({ postId, userId })
    .onConflictDoNothing({ target: [bookmarks.postId, bookmarks.userId] });
}

export async function unbookmark(userId: string, postId: string) {
  await getPostOrThrow(postId);
  await db.delete(bookmarks).where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, userId)));
}

interface BookmarkRow extends Record<string, unknown> {
  id: string;
  post_id: string;
  at_text: string;
}

/**
 * Os posts que o usuário salvou, o salvo mais recente primeiro. Paginação keyset por
 * (bookmarks.created_at, bookmarks.id), com microssegundos como na linha do tempo, pelo índice
 * (user_id, created_at). Os itens têm `reason: null`, o mesmo formato dos itens do feed.
 */
export async function getBookmarks(userId: string, cursor: string | undefined, limit: number) {
  const decoded = cursor === undefined ? null : decodeTimelineCursor(cursor);
  if (cursor !== undefined && !decoded) throw new AppError(400, 'validation_error', 'Cursor inválido');
  const cut = decoded
    ? sql`and (${bookmarks.createdAt}, ${bookmarks.id}) < (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
    : sql``;

  const result = await db.execute<BookmarkRow>(sql`
    select ${bookmarks.id} as id, ${bookmarks.postId} as post_id,
      to_char(${bookmarks.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at_text
    from ${bookmarks}
    where ${bookmarks.userId} = ${userId} ${cut}
    order by ${bookmarks.createdAt} desc, ${bookmarks.id} desc
    limit ${limit + 1}
  `);

  const rows = result.rows;
  const page = rows.slice(0, limit);
  const postsById = await hydratePosts(
    page.map((r) => r.post_id),
    userId,
  );
  const items = page.flatMap((row) => {
    const post = postsById.get(row.post_id);
    return post ? [{ ...post, reason: null }] : [];
  });

  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeTimelineCursor({ at: last.at_text, id: last.id, kind: 'post' }) : null;
  return { items, nextCursor };
}

/**
 * Só o autor apaga. Likes, comentários (com as respostas), reposts, salvos, imagens e notificações
 * saem em cascata pelo banco; as citações ficam, com `quotedPost: null`. Os arquivos das imagens
 * saem do disco, menos os que outro post ainda usa.
 */
export async function deletePost(userId: string, postId: string) {
  const post = await getPostOrThrow(postId);
  if (post.userId !== userId) throw new AppError(403, 'forbidden', 'Só o autor pode apagar este post');

  const images = await db.select({ url: postImages.url }).from(postImages).where(eq(postImages.postId, postId));
  await db.delete(posts).where(eq(posts.id, postId));

  for (const { url } of images) {
    const stillUsed = await db.select({ id: postImages.id }).from(postImages).where(eq(postImages.url, url)).limit(1);
    if (stillUsed.length === 0) await deletePostImageIfLocal(url);
  }
}

async function getCommentOrThrow(commentId: string) {
  const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
  if (!comment) throw new AppError(404, 'not_found', 'Comentário não encontrado');
  return comment;
}

export async function addComment(userId: string, postId: string, content: string, parentCommentId?: string) {
  const post = await getPostOrThrow(postId);

  let parent: Awaited<ReturnType<typeof getCommentOrThrow>> | null = null;
  if (parentCommentId) {
    parent = await getCommentOrThrow(parentCommentId);
    if (parent.postId !== postId) throw new AppError(400, 'invalid_operation', 'Comentário pai não pertence a esse post');
  }

  const [created] = await db.insert(comments).values({ postId, userId, content, parentCommentId }).returning();
  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, created!.id),
    with: { user: { columns: userColumns } },
  });

  const commentId = created!.id;
  // O autor do comentário respondido recebe "reply". O dono do post recebe "comment", exceto quando
  // ele mesmo é o autor do comentário respondido: aí só o "reply" (nunca os dois pelo mesmo comentário).
  if (parent) {
    await notificationsService.notify({ userId: parent.userId, actorId: userId, type: 'reply', postId, commentId });
  }
  if (!parent || parent.userId !== post.userId) {
    await notificationsService.notify({ userId: post.userId, actorId: userId, type: 'comment', postId, commentId });
  }
  // Quem já recebeu comment ou reply por este comentário não recebe também a menção.
  await notificationsService.notifyMentions({
    text: content,
    actorId: userId,
    postId,
    commentId,
    skip: parent ? [post.userId, parent.userId] : [post.userId],
  });

  return comment;
}

interface FlatComment {
  id: string;
  parentCommentId: string | null;
  createdAt: Date;
  likes: { userId: string }[];
  [key: string]: unknown;
}

export type CommentSort = 'top' | 'oldest' | 'newest';

function buildCommentTree(flat: FlatComment[], viewerId: string, sort: CommentSort) {
  const mapped = flat.map((c) => {
    const { likes: commentLikeRows, parentCommentId, ...rest } = c;
    return {
      ...rest,
      parentCommentId,
      likeCount: commentLikeRows.length,
      likedByMe: commentLikeRows.some((l) => l.userId === viewerId),
      replies: [] as unknown[],
    };
  });

  const byId = new Map(mapped.map((c) => [c.id, c]));
  const roots: (typeof mapped)[number][] = [];

  for (const c of mapped) {
    if (c.parentCommentId) {
      const parent = byId.get(c.parentCommentId);
      if (parent) {
        parent.replies.push(c);
        continue;
      }
    }
    roots.push(c);
  }

  // `flat` já vem do mais antigo ao mais novo, então cada grupo de irmãos também. A ordenação vale
  // dentro de cada grupo: "newest" inverte, "top" ordena por curtidas e o desempate mantém o mais antigo
  // primeiro (a ordenação do JS é estável).
  const arrange = (group: (typeof mapped)[number][]) => {
    if (sort === 'newest') group.reverse();
    else if (sort === 'top') group.sort((x, y) => y.likeCount - x.likeCount);
    for (const node of group) arrange(node.replies as (typeof mapped)[number][]);
  };
  arrange(roots);

  return roots;
}

export async function listComments(postId: string, viewerId: string, sort: CommentSort = 'oldest') {
  await getPostOrThrow(postId);
  const flat = await db.query.comments.findMany({
    where: eq(comments.postId, postId),
    orderBy: [asc(comments.createdAt), asc(comments.id)],
    with: { user: { columns: userColumns }, likes: { columns: { userId: true } } },
  });
  return buildCommentTree(flat, viewerId, sort);
}

/** Só o autor do comentário apaga (nem o autor do post). As respostas saem junto, em cascata. */
export async function deleteComment(userId: string, commentId: string) {
  const comment = await getCommentOrThrow(commentId);
  if (comment.userId !== userId) throw new AppError(403, 'forbidden', 'Só o autor pode apagar este comentário');
  await db.delete(comments).where(eq(comments.id, commentId));
}

export async function likeComment(userId: string, commentId: string) {
  await getCommentOrThrow(commentId);

  await db
    .insert(commentLikes)
    .values({ commentId, userId })
    .onConflictDoNothing({ target: [commentLikes.commentId, commentLikes.userId] });
}

export async function unlikeComment(userId: string, commentId: string) {
  await getCommentOrThrow(commentId);
  await db.delete(commentLikes).where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId)));
}
