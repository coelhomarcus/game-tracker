import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { notifications, notificationTypeEnum, users } from '../db/schema';
import { sendPushToUser } from '../push/pushService';

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

const PUSH_MESSAGES: Record<NotificationType, (actor: string) => { title: string; body: string }> = {
  like: (actor) => ({ title: 'Nova curtida', body: `${actor} curtiu seu post` }),
  comment: (actor) => ({ title: 'Novo comentário', body: `${actor} comentou no seu post` }),
  follow: (actor) => ({ title: 'Novo seguidor', body: `${actor} começou a seguir você` }),
  reply: (actor) => ({ title: 'Nova resposta', body: `${actor} respondeu ao seu comentário` }),
  mention: (actor) => ({ title: 'Nova menção', body: `${actor} mencionou você` }),
  repost: (actor) => ({ title: 'Novo repost', body: `${actor} repostou seu post` }),
  quote: (actor) => ({ title: 'Nova citação', body: `${actor} citou seu post` }),
};

interface NotifyInput {
  userId: string;
  actorId: string;
  type: NotificationType;
  postId?: string;
}

/** Cria a notificação in-app e dispara o push (best-effort). Nunca notifica o próprio autor da ação. */
export async function notify({ userId, actorId, type, postId }: NotifyInput) {
  if (userId === actorId) return;

  const [[notification], actor] = await Promise.all([
    db.insert(notifications).values({ userId, actorId, type, postId }).returning(),
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
      },
    });
  }

  return notification;
}

export async function list(userId: string) {
  const [items, unreadCountRows] = await Promise.all([
    db.query.notifications.findMany({
      where: eq(notifications.userId, userId),
      orderBy: desc(notifications.createdAt),
      limit: 50,
      with: { actor: { columns: { id: true, username: true, name: true, avatarUrl: true } } },
    }),
    db
      .select({ value: count() })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
  ]);

  return { items, unreadCount: unreadCountRows[0]!.value };
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
}
