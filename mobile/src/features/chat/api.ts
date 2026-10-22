import { api } from '@/features/auth';

import {
  parseConversation,
  parseMessagePage,
  type Conversation,
  type MessagePage,
} from './types';

const PAGE_SIZE = 30;

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
      await api.get<Record<string, unknown>>(
        `/conversations/${encodeURIComponent(conversationId)}/messages`,
        { query: { limit: PAGE_SIZE, cursor } },
      ),
    );
  },

  async markRead(conversationId: string): Promise<void> {
    await api.post<void>(`/conversations/${encodeURIComponent(conversationId)}/read`);
  },
};
