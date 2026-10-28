import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession, type User } from '@/features/auth';
import { feedApi } from '@/features/feed/api';
import { useTogglePostLike, usePostSearch } from '@/features/feed/queries';
import type { Post, PostPage } from '@/features/feed/types';
import { gamesApi } from '@/features/games/api';
import { useTrendingGames } from '@/features/games/queries';
import { profilesApi } from '@/features/profiles/api';
import { useFollowSuggestions, useSetModeration, useToggleFollow } from '@/features/profiles/queries';
import type { SuggestedPerson } from '@/features/profiles/types';
import { socialDefaults } from '@/test-utils/postDefaults';

import { useRecentSearches } from '../recentSearches';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

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

function suggested(id: string, overrides: Partial<SuggestedPerson> = {}): SuggestedPerson {
  return {
    id,
    username: `user-${id}`,
    name: null,
    avatarUrl: null,
    bio: null,
    isFollowedByMe: false,
    followsMe: false,
    followedByCount: 0,
    ...overrides,
  };
}

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    author: { id: 'u9', username: 'caio', name: null, avatarUrl: null },
    content: 'Zerei Hades',
    type: 'status',
    activityStatus: null,
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  useSession.setState({ status: 'signedIn', user: me });
  useRecentSearches.setState({ recents: {} });
});

afterEach(() => {
  client.clear();
  jest.restoreAllMocks();
  jest.useRealTimers();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('discovery queries', () => {
  it('useTrendingGames asks for ten trending games', async () => {
    const trending = jest.spyOn(gamesApi, 'trending').mockResolvedValue([]);
    const { result } = await renderHook(() => useTrendingGames(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(trending).toHaveBeenCalledWith(10);
  });

  it('useFollowSuggestions asks for ten people', async () => {
    const suggestions = jest.spyOn(profilesApi, 'suggestions').mockResolvedValue([suggested('u1')]);
    const { result } = await renderHook(() => useFollowSuggestions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([suggested('u1')]));
    expect(suggestions).toHaveBeenCalledWith(10);
  });
});

describe('discovery stays cached while the search is open', () => {
  it('trending games are not asked for again when the module remounts (Cancelar)', async () => {
    const trending = jest.spyOn(gamesApi, 'trending').mockResolvedValue([]);
    const first = await renderHook(() => useTrendingGames(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await first.unmount();

    const second = await renderHook(() => useTrendingGames(), { wrapper });
    expect(second.result.current.isSuccess).toBe(true);
    expect(trending).toHaveBeenCalledTimes(1);
  });

  it('suggestions are not asked for again when the module remounts (Cancelar)', async () => {
    const suggestions = jest.spyOn(profilesApi, 'suggestions').mockResolvedValue([suggested('u1')]);
    const first = await renderHook(() => useFollowSuggestions(), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    await first.unmount();

    const second = await renderHook(() => useFollowSuggestions(), { wrapper });
    expect(second.result.current.isSuccess).toBe(true);
    expect(suggestions).toHaveBeenCalledTimes(1);
  });
});

describe('usePostSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['clearTimeout', 'nextTick', 'queueMicrotask'] });
  });

  it('waits 300 ms after the last keystroke and ignores terms under 2 characters', async () => {
    const search = jest.spyOn(feedApi, 'searchPosts').mockResolvedValue({ items: [], nextCursor: null });
    const { rerender } = await renderHook((props: { term: string }) => usePostSearch(props.term), {
      wrapper,
      initialProps: { term: ' a ' },
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(search).not.toHaveBeenCalled();

    await rerender({ term: ' ha ' });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(299);
    });
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(search).toHaveBeenCalledWith('ha', undefined);
  });

  it('pages through the results with the cursor', async () => {
    const search = jest
      .spyOn(feedApi, 'searchPosts')
      .mockResolvedValueOnce({ items: [post('p1')], nextCursor: 'c1' })
      .mockResolvedValueOnce({ items: [post('p2')], nextCursor: null });
    const { result } = await renderHook(() => usePostSearch('hades'), { wrapper });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(search).toHaveBeenLastCalledWith('hades', 'c1');
    await waitFor(() =>
      expect(result.current.data?.pages.flatMap((page) => page.items.map((p) => p.id))).toEqual([
        'p1',
        'p2',
      ]),
    );
    expect(result.current.hasNextPage).toBe(false);
  });
});

describe('search results in the shared caches', () => {
  it('a like reaches the post in the search results', async () => {
    jest.spyOn(feedApi, 'setLike').mockResolvedValue(undefined);
    client.setQueryData<InfiniteData<PostPage, string | undefined>>(['postSearch', 'hades'], {
      pages: [{ items: [post('p1')], nextCursor: null }],
      pageParams: [undefined],
    });
    const { result } = await renderHook(() => useTogglePostLike(), { wrapper });

    await act(async () => {
      result.current.mutate(post('p1'));
    });

    const cached = client.getQueryData<InfiniteData<PostPage>>(['postSearch', 'hades']);
    expect(cached?.pages[0].items[0]).toMatchObject({ likedByMe: true, likeCount: 1 });
  });

  it('a follow marks the suggestion at once and rolls it back when it fails', async () => {
    let fail!: (error: Error) => void;
    jest.spyOn(profilesApi, 'setFollow').mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    client.setQueryData(['suggestions'], [suggested('u1'), suggested('u2')]);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });
    expect(client.getQueryData(['suggestions'])).toEqual([
      suggested('u1', { isFollowedByMe: true }),
      suggested('u2'),
    ]);

    await act(async () => {
      fail(new Error('boom'));
    });
    await waitFor(() =>
      expect(client.getQueryData(['suggestions'])).toEqual([suggested('u1'), suggested('u2')]),
    );
  });

  it('a mute takes their posts out of the search results and the person out of the suggestions', async () => {
    jest.spyOn(profilesApi, 'setMute').mockResolvedValue(undefined);
    const muted = { id: 'u9', username: 'caio', name: null, avatarUrl: null };
    client.setQueryData<InfiniteData<PostPage, string | undefined>>(['postSearch', 'hades'], {
      pages: [
        {
          items: [post('p1'), post('p2', { author: { id: 'u5', username: 'edu', name: null, avatarUrl: null } })],
          nextCursor: null,
        },
      ],
      pageParams: [undefined],
    });
    const suggestions = jest
      .spyOn(profilesApi, 'suggestions')
      .mockResolvedValueOnce([suggested('u9'), suggested('u2')])
      .mockResolvedValue([suggested('u2')]);
    const list = await renderHook(() => useFollowSuggestions(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(2));
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => {
      result.current.mutate({ person: muted, on: true });
    });

    const cached = client.getQueryData<InfiniteData<PostPage>>(['postSearch', 'hades']);
    expect(cached?.pages[0].items.map((p) => p.id)).toEqual(['p2']);
    // The mounted suggestions are read again, so a muted person is not suggested on return.
    await waitFor(() => expect(list.result.current.data?.map((p) => p.id)).toEqual(['u2']));
    expect(suggestions).toHaveBeenCalledTimes(2);
  });

  it('a block takes the person out of the recent searches once the server has it', async () => {
    jest.spyOn(profilesApi, 'setBlock').mockResolvedValue(undefined);
    const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };
    useRecentSearches.getState().addPerson('me', bia);
    useRecentSearches.getState().addPerson('me', { ...bia, id: 'u3', username: 'caio' });
    useRecentSearches.getState().addPerson('other', bia);
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => {
      result.current.mutate({ person: bia, on: true });
    });

    await waitFor(() =>
      expect(useRecentSearches.getState().recents.me.people.map((p) => p.id)).toEqual(['u3']),
    );
    // Another account's recents are not this account's to change.
    expect(useRecentSearches.getState().recents.other.people.map((p) => p.id)).toEqual(['u2']);
  });

  it('a failed block keeps the person in the recent searches', async () => {
    jest.spyOn(profilesApi, 'setBlock').mockRejectedValue(new Error('boom'));
    const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };
    useRecentSearches.getState().addPerson('me', bia);
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => {
      result.current.mutate({ person: bia, on: true });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(useRecentSearches.getState().recents.me.people.map((p) => p.id)).toEqual(['u2']);
  });
});
