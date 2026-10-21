import { focusManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { authErrorMessage, useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { notificationsApi } from './api';
import type { NotificationsData } from './types';

const POLL_INTERVAL_MS = 60_000;
const KEY = ['notifications'];

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

/** Polled while the app is in the foreground; returning to it refreshes at once. */
export function useNotifications() {
  const signedIn = useSession((state) => state.status === 'signedIn');
  const active = useAppActive();
  return useQuery({
    queryKey: KEY,
    queryFn: () => notificationsApi.list(),
    enabled: signedIn,
    refetchInterval: active ? POLL_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadCount(): number {
  return useNotifications().data?.unreadCount ?? 0;
}

/** Marks everything read right away and restores the previous list if the request fails. */
export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation<void, Error, void, { previous: NotificationsData | undefined }>({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: KEY });
      const previous = client.getQueryData<NotificationsData>(KEY);
      client.setQueryData<NotificationsData>(KEY, (data) =>
        data
          ? { items: data.items.map((item) => ({ ...item, read: true })), unreadCount: 0 }
          : data,
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(KEY, context.previous);
      showToast(authErrorMessage(error));
    },
  });
}
