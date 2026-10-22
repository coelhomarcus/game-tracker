import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useSession, type User } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { notificationsApi } from '../api';
import { useMarkAllRead, useNotifications, useUnreadCount } from '../queries';
import type { AppNotification, NotificationsData } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/notifications/api', () => ({
  notificationsApi: { list: jest.fn(), markAllRead: jest.fn() },
}));

const mocked = jest.mocked(notificationsApi);

const me: User = {
  id: 'me',
  username: 'eu',
  name: 'Eu',
  email: 'eu@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
};

function notification(id: string, read = false): AppNotification {
  return {
    id,
    type: 'follow',
    actor: { id: 'u1', username: 'ana', name: null, avatarUrl: null },
    postId: null,
    commentId: null,
    excerpt: null,
    read,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const data: NotificationsData = {
  items: [notification('n1'), notification('n2'), notification('n3', true)],
  unreadCount: 2,
};

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A promise settled by hand, so a test can look at the state before the response arrives. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const realAppState = AppState.currentState as AppStateStatus;

/** `currentState` is a plain property, so the test assigns it. */
function setAppState(next: AppStateStatus) {
  (AppState as { currentState: AppStateStatus }).currentState = next;
}

let notifyAppState: (next: AppStateStatus) => void;

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', user: me });
  setAppState('active');
  const listeners = new Set<(next: AppStateStatus) => void>();
  notifyAppState = (next) => {
    setAppState(next);
    listeners.forEach((listener) => listener(next));
  };
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (next: AppStateStatus) => void,
  ) => {
    listeners.add(listener);
    return { remove: () => listeners.delete(listener) };
  }) as typeof AppState.addEventListener);
});

afterEach(() => {
  setAppState(realAppState);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('useNotifications', () => {
  it('fetches while signed in and exposes the unread count', async () => {
    mocked.list.mockResolvedValue(data);
    const client = freshClient();
    const { result } = await renderHook(
      () => ({ query: useNotifications(), unread: useUnreadCount() }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.query.data).toEqual(data));
    expect(result.current.unread).toBe(2);
    expect(client.getQueryData(['notifications'])).toEqual(data);
  });

  it('does not fetch while signed out, and counts 0 without data', async () => {
    useSession.setState({ status: 'signedOut', user: null });
    const { result } = await renderHook(
      () => ({ query: useNotifications(), unread: useUnreadCount() }),
      { wrapper: wrapperFor(freshClient()) },
    );
    expect(result.current.query.fetchStatus).toBe('idle');
    expect(result.current.unread).toBe(0);
    expect(mocked.list).not.toHaveBeenCalled();
  });

  it('starts fetching once the session signs in', async () => {
    useSession.setState({ status: 'restoring', user: null });
    mocked.list.mockResolvedValue(data);
    const { result } = await renderHook(() => useNotifications(), {
      wrapper: wrapperFor(freshClient()),
    });
    expect(mocked.list).not.toHaveBeenCalled();

    await act(async () => {
      useSession.setState({ status: 'signedIn', user: me });
    });

    await waitFor(() => expect(result.current.data).toEqual(data));
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['clearTimeout', 'nextTick', 'queueMicrotask'] });
    });

    it('refetches every 60 s while the app is active and pauses while it is not', async () => {
      mocked.list.mockResolvedValue(data);
      await renderHook(() => useNotifications(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mocked.list).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(mocked.list).toHaveBeenCalledTimes(2);

      await act(async () => {
        notifyAppState('background');
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      expect(mocked.list).toHaveBeenCalledTimes(2);

      await act(async () => {
        notifyAppState('active');
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });
      expect(mocked.list.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('stops fetching once the session signs out', async () => {
      mocked.list.mockResolvedValue(data);
      await renderHook(() => useNotifications(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mocked.list).toHaveBeenCalledTimes(1);

      await act(async () => {
        useSession.setState({ status: 'signedOut', user: null });
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });

      expect(mocked.list).toHaveBeenCalledTimes(1);
    });

    it('does not poll when it starts in the background', async () => {
      setAppState('background');
      mocked.list.mockResolvedValue(data);
      await renderHook(() => useNotifications(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      expect(mocked.list).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useMarkAllRead', () => {
  it('marks everything read right away and keeps it when the request succeeds', async () => {
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['notifications'], data);
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate();
    });

    const optimistic = client.getQueryData<NotificationsData>(['notifications'])!;
    expect(optimistic.unreadCount).toBe(0);
    expect(optimistic.items.every((item) => item.read)).toBe(true);
    expect(optimistic.items.map((item) => item.id)).toEqual(['n1', 'n2', 'n3']);

    await act(async () => {
      request.resolve();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<NotificationsData>(['notifications'])?.unreadCount).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refetches the list once the request settles so a racing poll cannot revive the badge', async () => {
    mocked.list.mockResolvedValueOnce(data);
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    const client = freshClient();
    const { result } = await renderHook(
      () => ({ query: useNotifications(), mark: useMarkAllRead() }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.query.data).toEqual(data));
    await act(async () => {
      result.current.mark.mutate();
    });
    const allRead: NotificationsData = {
      items: data.items.map((item) => ({ ...item, read: true })),
      unreadCount: 0,
    };
    mocked.list.mockResolvedValue(allRead);

    await act(async () => {
      request.resolve();
    });

    await waitFor(() => expect(mocked.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.query.data).toEqual(allRead));
  });

  it('refetches the list after a failed request too', async () => {
    mocked.markAllRead.mockRejectedValue(new Error('boom'));
    const client = freshClient();
    client.setQueryData(['notifications'], data);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] }));
  });

  it('restores the previous data and shows a toast when the request fails', async () => {
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['notifications'], data);
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate();
    });
    expect(client.getQueryData<NotificationsData>(['notifications'])?.unreadCount).toBe(0);

    await act(async () => {
      request.reject(new Error('boom'));
    });

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(['notifications'])).toEqual(data);
  });

  it('works without cached data', async () => {
    mocked.markAllRead.mockResolvedValue(undefined);
    const client = freshClient();
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(client.getQueryData(['notifications'])).toBeUndefined();
    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);
  });
});
