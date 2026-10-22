import { parseUserSummary, type UserSummary } from '@/features/games/types';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'reply'
  | 'mention'
  | 'repost'
  | 'quote';

export type AppNotification = {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  /** For a quote, the new quote post; for the others, the post the notification is about. */
  postId: string | null;
  /** The comment behind a comment, reply or mention. */
  commentId: string | null;
  /** The start of the comment or post text; null for a follow. */
  excerpt: string | null;
  read: boolean;
  createdAt: Date;
};

export type NotificationsData = {
  items: AppNotification[];
  unreadCount: number;
};

// The API payloads are trusted for required fields; optional ones are read defensively.
type Json = Record<string, any>;

const TYPES: readonly string[] = [
  'like',
  'comment',
  'follow',
  'reply',
  'mention',
  'repost',
  'quote',
];

function parseNotification(json: Json): AppNotification | null {
  if (!TYPES.includes(json.type) || json.actor == null) return null;
  return {
    id: json.id,
    type: json.type,
    actor: parseUserSummary(json.actor),
    postId: typeof json.postId === 'string' ? json.postId : null,
    commentId: typeof json.commentId === 'string' ? json.commentId : null,
    excerpt: typeof json.excerpt === 'string' ? json.excerpt : null,
    read: json.read === true,
    createdAt: new Date(json.createdAt),
  };
}

/** Items of a kind this client does not know, or without an actor, are dropped. */
export function parseNotificationsData(json: Json): NotificationsData {
  const items: AppNotification[] = [];
  for (const raw of json.items as Json[]) {
    const item = parseNotification(raw);
    if (item !== null) items.push(item);
  }
  return { items, unreadCount: typeof json.unreadCount === 'number' ? json.unreadCount : 0 };
}
