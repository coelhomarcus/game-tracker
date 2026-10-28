import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useSession, type User } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { notificationsApi } from '../api';
import {
  notificationsKey,
  unreadCountKey,
  useMarkAllRead,
  useNotifications,
  useUnreadCount,
  type NotificationsPages,
} from '../queries';
import type { AppNotification, NotificationsPage } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/notifications/api', () => ({
  notificationsApi: { list: jest.fn(), unreadCount: jest.fn(), markAllRead: jest.fn() },
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
  dmPolicy: 'everyone',
};

function notification(id: string, read = false): AppNotification {
  return {
    id,
    type: 'follow',
    actor: { id: 'u1', username: 'ana', name: null, avatarUrl: null },
    postId: null,
    commentId: null,
    excerpt: null,
    postImageUrl: null,
    read,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

const firstPage: NotificationsPage = {
  items: [notification('n1'), notification('n2')],
  unreadCount: 3,
  nextCursor: 'c1',
};
const secondPage: NotificationsPage = {
  items: [notification('n3'), notification('n4', true)],
  unreadCount: 3,
  nextCursor: null,
};

function pages(...list: NotificationsPage[]): NotificationsPages {
  return { pages: list, pageParams: list.map((_, index) => (index === 0 ? undefined : `c${index}`)) };
}

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

describe('useUnreadCount', () => {
  it('fetches the count while signed in', async () => {
    mocked.unreadCount.mockResolvedValue(2);
    const client = freshClient();
    const { result } = await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current).toBe(2));
    expect(client.getQueryData(unreadCountKey)).toBe(2);
    // The bell never loads the list itself.
    expect(mocked.list).not.toHaveBeenCalled();
  });

  it('does not fetch while signed out, and counts 0 without data', async () => {
    useSession.setState({ status: 'signedOut', user: null });
    const { result } = await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(freshClient()) });
    expect(result.current).toBe(0);
    expect(mocked.unreadCount).not.toHaveBeenCalled();
  });

  it('starts fetching once the session signs in', async () => {
    useSession.setState({ status: 'restoring', user: null });
    mocked.unreadCount.mockResolvedValue(4);
    const { result } = await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(freshClient()) });
    expect(mocked.unreadCount).not.toHaveBeenCalled();

    await act(async () => {
      useSession.setState({ status: 'signedIn', user: me });
    });

    await waitFor(() => expect(result.current).toBe(4));
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['clearTimeout', 'nextTick', 'queueMicrotask'] });
    });

    it('refetches every 30 s while the app is active and pauses while it is not', async () => {
      mocked.unreadCount.mockResolvedValue(1);
      await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        await jest.advanceTimersByTimeAsync(29_000);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1_000);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(2);

      await act(async () => {
        notifyAppState('background');
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(2);

      await act(async () => {
        notifyAppState('active');
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(mocked.unreadCount.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('stops fetching once the session signs out', async () => {
      mocked.unreadCount.mockResolvedValue(1);
      await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(1);

      await act(async () => {
        useSession.setState({ status: 'signedOut', user: null });
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });

      expect(mocked.unreadCount).toHaveBeenCalledTimes(1);
    });

    it('does not poll when it starts in the background', async () => {
      setAppState('background');
      mocked.unreadCount.mockResolvedValue(1);
      await renderHook(() => useUnreadCount(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      expect(mocked.unreadCount).toHaveBeenCalledTimes(1);
    });

    it('the list itself is not polled', async () => {
      mocked.list.mockResolvedValue(secondPage);
      await renderHook(() => useNotifications(), { wrapper: wrapperFor(freshClient()) });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(180_000);
      });
      expect(mocked.list).toHaveBeenCalledTimes(1);
    });
  });
});

describe('useNotifications', () => {
  it('loads the first page of a filter, then the next one by its cursor', async () => {
    mocked.list.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
    const client = freshClient();
    const { result } = await renderHook(() => useNotifications('replies'), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data?.pages).toEqual([firstPage]));
    expect(mocked.list).toHaveBeenLastCalledWith({ cursor: undefined, filter: 'replies' });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(mocked.list).toHaveBeenLastCalledWith({ cursor: 'c1', filter: 'replies' });
    await waitFor(() => expect(result.current.data?.pages).toEqual([firstPage, secondPage]));
    expect(result.current.hasNextPage).toBe(false);
    expect(client.getQueryData(notificationsKey('replies'))).toBeDefined();
  });

  it('defaults to every type, and each filter has its own cache', async () => {
    mocked.list.mockImplementation(async ({ filter } = {}) => ({
      ...secondPage,
      items: [notification(`only-${filter}`)],
    }));
    const client = freshClient();
    const { result } = await renderHook(
      () => ({ all: useNotifications(), follows: useNotifications('follows') }),
      { wrapper: wrapperFor(client) },
    );

    await waitFor(() => expect(result.current.follows.data).toBeDefined());
    await waitFor(() => expect(result.current.all.data).toBeDefined());
    expect(result.current.all.data?.pages[0]?.items[0]?.id).toBe('only-all');
    expect(result.current.follows.data?.pages[0]?.items[0]?.id).toBe('only-follows');
    expect(client.getQueryData(['notifications', 'list', 'all'])).toBeDefined();
  });

  it('does not fetch while signed out', async () => {
    useSession.setState({ status: 'signedOut', user: null });
    const { result } = await renderHook(() => useNotifications(), { wrapper: wrapperFor(freshClient()) });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.list).not.toHaveBeenCalled();
  });
});

describe('useMarkAllRead', () => {
  /** A client with two loaded filters and the count. */
  function seeded() {
    const client = freshClient();
    client.setQueryData(notificationsKey('all'), pages(firstPage, secondPage));
    client.setQueryData(notificationsKey('follows'), pages(firstPage));
    client.setQueryData(unreadCountKey, 3);
    return client;
  }

  it('marks every loaded filter and the count read right away and keeps it on success', async () => {
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    mocked.list.mockResolvedValue(secondPage);
    mocked.unreadCount.mockResolvedValue(0);
    const client = seeded();
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate();
    });

    for (const filter of ['all', 'follows'] as const) {
      const optimistic = client.getQueryData<NotificationsPages>(notificationsKey(filter))!;
      const items = optimistic.pages.flatMap((page) => page.items);
      expect(items.every((item) => item.read)).toBe(true);
      expect(optimistic.pages.every((page) => page.unreadCount === 0)).toBe(true);
    }
    expect(
      client
        .getQueryData<NotificationsPages>(notificationsKey('all'))!
        .pages.flatMap((page) => page.items.map((item) => item.id)),
    ).toEqual(['n1', 'n2', 'n3', 'n4']);
    expect(client.getQueryData(unreadCountKey)).toBe(0);

    await act(async () => {
      request.resolve();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(unreadCountKey)).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refetches the count once the request settles so a racing poll cannot revive the badge', async () => {
    mocked.unreadCount.mockResolvedValueOnce(3);
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    const client = freshClient();
    const { result } = await renderHook(
      () => ({ unread: useUnreadCount(), mark: useMarkAllRead() }),
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.unread).toBe(3));
    await act(async () => {
      result.current.mark.mutate();
    });
    await waitFor(() => expect(result.current.unread).toBe(0));
    mocked.unreadCount.mockResolvedValue(0);

    await act(async () => {
      request.resolve();
    });

    await waitFor(() => expect(mocked.unreadCount).toHaveBeenCalledTimes(2));
    expect(result.current.unread).toBe(0);
  });

  it('invalidates every notifications query after a failed request too', async () => {
    mocked.markAllRead.mockRejectedValue(new Error('boom'));
    const client = seeded();
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['notifications'] }));
    expect(client.getQueryState(notificationsKey('follows'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(unreadCountKey)?.isInvalidated).toBe(true);
  });

  it('restores the previous data and shows a toast when the request fails', async () => {
    const request = deferred();
    mocked.markAllRead.mockReturnValue(request.promise);
    const client = seeded();
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate();
    });
    expect(client.getQueryData(unreadCountKey)).toBe(0);

    await act(async () => {
      request.reject(new Error('boom'));
    });

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(client.getQueryData(notificationsKey('all'))).toEqual(pages(firstPage, secondPage));
    expect(client.getQueryData(notificationsKey('follows'))).toEqual(pages(firstPage));
    expect(client.getQueryData(unreadCountKey)).toBe(3);
  });

  it('works without cached data', async () => {
    mocked.markAllRead.mockResolvedValue(undefined);
    const client = freshClient();
    const { result } = await renderHook(() => useMarkAllRead(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(client.getQueryData(unreadCountKey)).toBeUndefined();
    expect(client.getQueryData(notificationsKey('all'))).toBeUndefined();
    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);
  });
});
