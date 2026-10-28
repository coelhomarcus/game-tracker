import { and, asc, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { notifications, notificationTypeEnum, postImages, users } from '../db/schema';
import { decodeTimelineCursor, encodeTimelineCursor } from '../lib/cursor';
import { AppError } from '../lib/errors';
import { extractMentions } from '../lib/mentions';
import { sendPushToUser } from '../push/pushService';
import { hiddenAuthorsSql, suppressesNotification } from './moderation.service';

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

const PUSH_MESSAGES: Record<NotificationType, (actor: string) => { title: string; body: string }> = {
  like: (actor) => ({ title: 'Nova curtida', body: `${actor} curtiu seu post` }),
  comment: (actor) => ({ title: 'Novo comentário', body: `${actor} comentou no seu post` }),
  follow: (actor) => ({ title: 'Novo seguidor', body: `${actor} começou a seguir você` }),
  reply: (actor) => ({ title: 'Nova resposta', body: `${actor} respondeu seu comentário` }),
  mention: (actor) => ({ title: 'Nova menção', body: `${actor} mencionou você` }),
  repost: (actor) => ({ title: 'Novo repost', body: `${actor} repostou seu post` }),
  quote: (actor) => ({ title: 'Nova citação', body: `${actor} citou seu post` }),
};

interface NotifyInput {
  userId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
  /** Só nas notificações que nascem de um comentário (comment, reply e mention). */
  commentId?: string;
}

/**
 * Cria a notificação in-app e dispara o push (best-effort). Nunca notifica o próprio autor da ação,
 * nem quem tem bloqueio (em qualquer sentido) com quem agiu, nem quem silenciou quem agiu.
 */
export async function notify({ userId, actorId, type, postId, commentId }: NotifyInput) {
  if (userId === actorId) return;
  if (await suppressesNotification(userId, actorId)) return;

  const [[notification], actor] = await Promise.all([
    db.insert(notifications).values({ userId, actorId, type, postId, commentId }).returning(),
    db.query.users.findFirst({ where: eq(users.id, actorId), columns: { username: true } }),
  ]);

  if (actor && notification) {
    const { title, body } = PUSH_MESSAGES[type](actor.username);
    // O destino é montado no app só a partir de ids (nunca de um caminho vindo no push).
    void sendPushToUser(userId, {
      title,
      body,
      data: {
        type,
        recipientId: userId,
        notificationId: notification.id,
        actorId,
        ...(postId ? { postId } : {}),
        ...(commentId ? { commentId } : {}),
      },
    });
  }

  return notification;
}

/**
 * Notifica os usuários mencionados (`@usuario`) no texto de um post ou comentário. Nomes que não
 * existem são ignorados, e o autor nunca é notificado. `skip` são os ids que já recebem outra
 * notificação por este mesmo texto (comment ou reply), para ninguém ser avisado duas vezes.
 */
export async function notifyMentions({
  text,
  actorId,
  postId,
  commentId,
  skip = [],
}: {
  text: string;
  actorId: string;
  postId: string;
  commentId?: string;
  skip?: Iterable<string>;
}) {
  const names = extractMentions(text);
  if (names.length === 0) return;
  const skipped = new Set(skip);
  const mentioned = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(sql`lower(${users.username})`, names));
  // Em sequência de propósito: o stand-in de teste (PGlite) mistura consultas simultâneas.
  for (const { id } of mentioned) {
    if (id === actorId || skipped.has(id)) continue;
    await notify({ userId: id, actorId, type: 'mention', postId, commentId });
  }
}

const EXCERPT_MAX = 120;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Trecho curto do texto para a prévia: espaços e quebras de linha viram um espaço; até 120 grafemas. */
export function excerptOf(text: string | null | undefined): string | null {
  const flat = text?.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  // Corta por grafemas (o que o usuário enxerga), nunca no meio de um emoji de vários pontos de código.
  const graphemes = Array.from(segmenter.segment(flat), (part) => part.segment);
  return graphemes.length <= EXCERPT_MAX ? flat : `${graphemes.slice(0, EXCERPT_MAX - 1).join('').trimEnd()}…`;
}

/** Os tipos de cada filtro da tela de notificações; `all` não filtra. */
export const NOTIFICATION_FILTERS = {
  all: null,
  replies: ['comment', 'reply'],
  mentions: ['mention', 'quote'],
  follows: ['follow'],
} as const satisfies Record<string, readonly NotificationType[] | null>;

export type NotificationFilter = keyof typeof NOTIFICATION_FILTERS;

/**
 * As notificações que `userId` enxerga. As que vieram de alguém com bloqueio (em qualquer sentido)
 * ou silenciado — criadas antes do bloqueio/silêncio — ficam de fora, também da contagem de não lidas.
 */
function visibleTo(userId: string) {
  return and(eq(notifications.userId, userId), notInArray(notifications.actorId, hiddenAuthorsSql(userId, true)));
}

/** Quantas notificações visíveis ainda não foram lidas, de todos os tipos. */
export async function unreadCount(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(visibleTo(userId), eq(notifications.read, false)));
  return rows[0]!.value;
}

interface ListOptions {
  cursor?: string;
  filter?: NotificationFilter;
  limit?: number;
}

/**
 * Uma página das notificações, a mais recente primeiro. Paginação keyset por (created_at, id), com
 * microssegundos como nas linhas do tempo. `filter` restringe os tipos; `unreadCount` conta todos.
 * Cada item leva o trecho do texto e `postImageUrl`, a primeira imagem do post relacionado.
 */
export async function list(userId: string, { cursor, filter = 'all', limit = 30 }: ListOptions = {}) {
  const decoded = cursor === undefined ? null : decodeTimelineCursor(cursor);
  if (cursor !== undefined && !decoded) throw new AppError(400, 'validation_error', 'Cursor inválido');

  const types = NOTIFICATION_FILTERS[filter];
  const where = and(
    visibleTo(userId),
    types === null ? undefined : inArray(notifications.type, [...types]),
    decoded
      ? sql`(${notifications.createdAt}, ${notifications.id}) < (${decoded.at}::timestamptz, ${decoded.id}::uuid)`
      : undefined,
  );

  // Em sequência de propósito: o stand-in de teste (PGlite) mistura consultas simultâneas.
  const rows = await db.query.notifications.findMany({
    where,
    orderBy: [desc(notifications.createdAt), desc(notifications.id)],
    limit: limit + 1,
    extras: {
      // A hora com microssegundos (a precisão do Postgres), para o cursor não pular itens.
      atText: sql<string>`to_char(${notifications.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'at_text',
      ),
    },
    with: {
      actor: { columns: { id: true, username: true, name: true, avatarUrl: true } },
      // Só para montar o trecho e a miniatura; não vão na resposta.
      post: {
        columns: { content: true, imageUrl: true },
        with: { images: { columns: { url: true }, orderBy: [asc(postImages.position)], limit: 1 } },
      },
      comment: { columns: { content: true } },
    },
  });
  const unread = await unreadCount(userId);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? encodeTimelineCursor({ at: last.atText, id: last.id, kind: 'post' }) : null;

  return {
    items: page.map(({ post, comment, atText: _atText, ...notification }) => ({
      ...notification,
      // O comentário, quando a notificação nasce de um; senão o texto do post.
      excerpt: excerptOf(comment ? comment.content : post?.content),
      // A primeira imagem do post; um post antigo só tem a coluna legada `image_url`.
      postImageUrl: post ? (post.images[0]?.url ?? post.imageUrl ?? null) : null,
    })),
    unreadCount: unread,
    nextCursor,
  };
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}
