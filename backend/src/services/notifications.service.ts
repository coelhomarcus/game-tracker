import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { notifications, notificationTypeEnum, users } from '../db/schema';
import { extractMentions } from '../lib/mentions';
import { sendPushToUser } from '../push/pushService';

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

/** Cria a notificação in-app e dispara o push (best-effort). Nunca notifica o próprio autor da ação. */
export async function notify({ userId, actorId, type, postId, commentId }: NotifyInput) {
  if (userId === actorId) return;

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

export async function list(userId: string) {
  const [items, unreadCountRows] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: desc(notifications.createdAt),
      limit: 50,
      with: {
        actor: { columns: { id: true, username: true, name: true, avatarUrl: true } },
        // Só para montar o trecho da prévia; não vão na resposta.
        post: { columns: { content: true } },
        comment: { columns: { content: true } },
      },
    }),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
  ]);

  return {
    items: items.map(({ post, comment, ...notification }) => ({
      ...notification,
      // O comentário, quando a notificação nasce de um; senão o texto do post.
      excerpt: excerptOf(comment ? comment.content : post?.content),
    })),
    unreadCount: unreadCountRows[0]!.value,
  };
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}
