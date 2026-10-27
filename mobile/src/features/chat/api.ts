import { api } from '@/features/auth';

import {
  parseConversation,
  parseMessagePage,
  type Conversation,
  type DmPolicy,
  type MessagePage,
} from './types';

const PAGE_SIZE = 30;

const conversationPath = (conversationId: string) =>
  `/conversations/${encodeURIComponent(conversationId)}`;
const messagePath = (conversationId: string, messageId: string) =>
  `${conversationPath(conversationId)}/messages/${encodeURIComponent(messageId)}`;

export const chatApi = {
  /** The caller's conversations, newest activity first. */
  async list(): Promise<Conversation[]> {
    const json = await api.get<Record<string, unknown>[]>('/conversations');
    return json.map(parseConversation);
  },

  /** Finds or creates the 1:1 conversation with `userId` and returns its id. */
  async create(userId: string): Promise<string> {
    const json = await api.post<{ id: string }>('/conversations', { userId });
    return json.id;
  },

  /** History, newest first. Pass the previous page's `nextCursor` to load older messages. */
  async messages(conversationId: string, cursor?: string): Promise<MessagePage> {
    return parseMessagePage(
      await api.get<Record<string, unknown>>(`${conversationPath(conversationId)}/messages`, {
        query: { limit: PAGE_SIZE, cursor },
      }),
    );
  },

  async markRead(conversationId: string): Promise<void> {
    await api.post<void>(`${conversationPath(conversationId)}/read`);
  },

  /** Marks every conversation read, muted ones included. */
  async markAllRead(): Promise<void> {
    await api.post<void>('/conversations/read-all');
  },

  /** Muting is idempotent (204 both ways); a muted conversation sends no push. */
  async setMuted(conversationId: string, muted: boolean): Promise<void> {
    if (muted) await api.post<void>(`${conversationPath(conversationId)}/mute`);
    else await api.delete<void>(`${conversationPath(conversationId)}/mute`);
  },

  /**
   * Leaves the conversation: it disappears for me with its history, until a new message brings
   * it back with only the messages from then on. The other person keeps everything.
   */
  async leave(conversationId: string): Promise<void> {
    await api.delete<void>(conversationPath(conversationId));
  },

  /** Deletes a message for me only; the other person still sees it. Idempotent. */
  async hideMessage(conversationId: string, messageId: string): Promise<void> {
    await api.delete<void>(messagePath(conversationId, messageId));
  },

  /** Idempotent. 409 `reaction_limit` past 5 emojis; 403 `blocked` / `dm_not_allowed`. */
  async addReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    await api.post<void>(`${messagePath(conversationId, messageId)}/reactions`, { emoji });
  },

  /** Idempotent; always allowed, since it undoes something of mine. */
  async removeReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    await api.delete<void>(
      `${messagePath(conversationId, messageId)}/reactions/${encodeURIComponent(emoji)}`,
    );
  },

  /** Who may message the signed-in user. */
  async setDmPolicy(dmPolicy: DmPolicy): Promise<void> {
    await api.patch<void>('/users/me', { dmPolicy });
  },
};
