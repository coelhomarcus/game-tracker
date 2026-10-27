import { parseUserSummary, type UserSummary } from '@/features/games/types';

export type { DmPolicy } from '@/features/auth';

/** One person's emoji on a message; a person may use up to 5 different ones per message. */
export type Reaction = { emoji: string; userId: string };

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: Date;
  /** Absent on messages written by clients that predate idempotent sends. */
  clientMessageId: string | null;
  sender: UserSummary;
  /** Oldest first. */
  reactions: Reaction[];
};

export type Conversation = {
  id: string;
  otherUser: UserSummary | null;
  lastMessage: Message | null;
  unread: boolean;
  /** Muted: its messages send no push to me; it still shows as unread. */
  muted: boolean;
};

/** Newest first; `nextCursor` points at the older messages. */
export type MessagePage = {
  items: Message[];
  nextCursor: string | null;
};

// The API payloads are trusted for required fields; optional ones are read defensively.
type Json = Record<string, any>;

function isReaction(value: unknown): value is Reaction {
  const item = value as Partial<Reaction> | null;
  return typeof item?.emoji === 'string' && typeof item.userId === 'string';
}

/** Reactions from a payload; anything malformed is left out. */
export function parseReactions(value: unknown): Reaction[] {
  return Array.isArray(value)
    ? value.filter(isReaction).map(({ emoji, userId }) => ({ emoji, userId }))
    : [];
}

/**
 * `fallbackSender` stands in for a payload without `sender`: the conversation list sends the bare
 * last message row. Only the fields of the sender that the row itself carries are known then.
 */
export function parseMessage(json: Json, fallbackSender?: UserSummary | null): Message {
  const senderId: string = json.senderId;
  const sender: UserSummary =
    json.sender != null
      ? parseUserSummary(json.sender)
      : fallbackSender != null && fallbackSender.id === senderId
        ? fallbackSender
        : { id: senderId, username: '', name: null, avatarUrl: null };
  return {
    id: json.id,
    conversationId: json.conversationId,
    senderId,
    content: json.content,
    createdAt: new Date(json.createdAt),
    clientMessageId: typeof json.clientMessageId === 'string' ? json.clientMessageId : null,
    sender,
    reactions: parseReactions(json.reactions),
  };
}

export function parseConversation(json: Json): Conversation {
  const otherUser = json.otherUser == null ? null : parseUserSummary(json.otherUser);
  return {
    id: json.id,
    otherUser,
    lastMessage: json.lastMessage == null ? null : parseMessage(json.lastMessage, otherUser),
    unread: json.unread === true,
    muted: json.muted === true,
  };
}

export function parseMessagePage(json: Json): MessagePage {
  return {
    items: (json.items as Json[]).map((item) => parseMessage(item)),
    nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
  };
}
