import { api } from '@/features/auth';

import { parseNotificationsData, type NotificationsData } from './types';

export const notificationsApi = {
  /** The latest 50 notifications and the total unread count. */
  async list(): Promise<NotificationsData> {
    return parseNotificationsData(await api.get<Record<string, unknown>>('/notifications'));
  },

  async markAllRead(): Promise<void> {
    await api.post<void>('/notifications/read-all');
  },
};
