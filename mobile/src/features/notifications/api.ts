import { api } from '@/features/auth';

import {
  parseNotificationsPage,
  parseUnreadCount,
  type NotificationFilter,
  type NotificationsPage,
} from './types';

/** The server takes up to 50; 30 is its default too. */
export const NOTIFICATIONS_PAGE_SIZE = 30;

export type NotificationsListOptions = {
  /** The `nextCursor` of the previous page; omitted for the first page. */
  cursor?: string;
  filter?: NotificationFilter;
};

export const notificationsApi = {
  /** One page, newest first, plus the unread count over every type. */
  async list({ cursor, filter = 'all' }: NotificationsListOptions = {}): Promise<NotificationsPage> {
    const query: Record<string, string | number> = { filter, limit: NOTIFICATIONS_PAGE_SIZE };
    if (cursor !== undefined) query.cursor = cursor;
    return parseNotificationsPage(await api.get<Record<string, unknown>>('/notifications', { query }));
  },

  /** Only the unread count: cheap enough to poll. */
  async unreadCount(): Promise<number> {
    return parseUnreadCount(await api.get<Record<string, unknown>>('/notifications/unread-count'));
  },

  async markAllRead(): Promise<void> {
    await api.post<void>('/notifications/read-all');
  },
};
