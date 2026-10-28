import {
  focusManager,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { authErrorMessage, useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { notificationsApi } from './api';
import type { NotificationFilter, NotificationsPage } from './types';

export const POLL_INTERVAL_MS = 30_000;

/** Every notifications query sits under this prefix (moderation and avatar changes invalidate it). */
const ROOT: QueryKey = ['notifications'];
/** Every filter's list (the "Atualizar" pill refetches them all). */
export const notificationListsKey: QueryKey = ['notifications', 'list'];
export const unreadCountKey: QueryKey = ['notifications', 'unreadCount'];
export const notificationsKey = (filter: NotificationFilter): QueryKey => ['notifications', 'list', filter];

export type NotificationsPages = InfiniteData<NotificationsPage, string | undefined>;

/** Whether the app is in the foreground; a change re-evaluates the polling interval. */
function useAppActive(): boolean {
  const [active, setActive] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      focusManager.setFocused(next === 'active');
      setActive(next === 'active');
    });
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * The unread count over every type, polled every 30 s while the app is in the foreground;
 * returning to it refreshes at once. The bell and the screen share it.
 */
export function useUnreadCountQuery() {
  const signedIn = useSession((state) => state.status === 'signedIn');
  const active = useAppActive();
  return useQuery({
    queryKey: unreadCountKey,
    queryFn: () => notificationsApi.unreadCount(),
    enabled: signedIn,
    refetchInterval: active ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(): number {
  return useUnreadCountQuery().data ?? 0;
}

/** The notifications of one filter, newest first, a page at a time. Each filter pages on its own. */
export function useNotifications(filter: NotificationFilter = 'all') {
  const signedIn = useSession((state) => state.status === 'signedIn');
  return useInfiniteQuery({
    queryKey: notificationsKey(filter),
    queryFn: ({ pageParam }) => notificationsApi.list({ cursor: pageParam, filter }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: signedIn,
  });
}

type MarkAllReadContext = {
  lists: [QueryKey, NotificationsPages | undefined][];
  count: number | undefined;
};

function allRead(data: NotificationsPages | undefined): NotificationsPages | undefined {
  if (data === undefined) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      unreadCount: 0,
      items: page.items.map((item) => ({ ...item, read: true })),
    })),
  };
}

/** Marks everything read right away (every filter and the count) and restores it if the request fails. */
export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation<void, Error, void, MarkAllReadContext>({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ROOT });
      const lists = client.getQueriesData<NotificationsPages>({ queryKey: notificationListsKey });
      const count = client.getQueryData<number>(unreadCountKey);
      client.setQueriesData<NotificationsPages>({ queryKey: notificationListsKey }, allRead);
      if (count !== undefined) client.setQueryData<number>(unreadCountKey, 0);
      return { lists, count };
    },
    onError: (error, _variables, context) => {
      if (context) {
        for (const [key, data] of context.lists) client.setQueryData(key, data);
        if (context.count !== undefined) client.setQueryData(unreadCountKey, context.count);
      }
      showToast(authErrorMessage(error));
    },
    // A poll that raced the request may have brought the badge back; the server is the truth.
    onSettled: () => client.invalidateQueries({ queryKey: ROOT }),
  });
}
