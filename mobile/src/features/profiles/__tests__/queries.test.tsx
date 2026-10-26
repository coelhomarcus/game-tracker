import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession, type User } from '@/features/auth';
import { feedApi } from '@/features/feed/api';
import { showToast } from '@/lib/toast';

import { profilesApi } from '../api';
import {
  useFollowList,
  usePeopleSearch,
  useProfile,
  useToggleFollow,
  useUpdateProfile,
  useUploadImage,
  useUserEntries,
  useUserFavorites,
  useUserPosts,
  useUserReplies,
} from '../queries';
import type {
  FollowListPage,
  FollowListPerson,
  PersonResult,
  PickedImage,
  UserProfile,
} from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/profiles/api', () => ({
  profilesApi: {
    get: jest.fn(),
    search: jest.fn(),
    posts: jest.fn(),
    userPosts: jest.fn(),
    replies: jest.fn(),
    followers: jest.fn(),
    following: jest.fn(),
    entries: jest.fn(),
    favorites: jest.fn(),
    setFollow: jest.fn(),
    update: jest.fn(),
    upload: jest.fn(),
  },
}));

jest.mock('@/features/feed/api', () => ({ feedApi: { myLikes: jest.fn() } }));

const mocked = jest.mocked(profilesApi);
const mockedFeed = jest.mocked(feedApi);

const me: User = {
  id: 'me',
  username: 'eu',
  name: 'Eu',
  email: 'eu@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
};

function profile(id: string, overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id,
    username: `user-${id}`,
    name: null,
    avatarUrl: null,
    bannerUrl: null,
    bio: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    followerCount: 5,
    followingCount: 2,
    entryCount: 1,
    isFollowedByMe: false,
    followsMe: false,
    ...overrides,
  };
}

function person(id: string, overrides: Partial<PersonResult> = {}): PersonResult {
  return {
    id,
    username: `user-${id}`,
    name: null,
    avatarUrl: null,
    bio: null,
    isFollowedByMe: false,
    ...overrides,
  };
}

const image: PickedImage = {
  uri: 'file:///a.png',
  mimeType: 'image/png',
  fileName: 'a.png',
  size: 10,
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

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', user: me });
});

describe('profile reads', () => {
  it('useProfile fetches the profile and stays idle without an id', async () => {
    mocked.get.mockResolvedValue(profile('u1'));
    const client = freshClient();
    const { result } = await renderHook(() => useProfile('u1'), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.id).toBe('u1'));
    expect(client.getQueryData(['profile', 'u1'])).toBeDefined();

    const idle = await renderHook(() => useProfile(undefined), { wrapper: wrapperFor(client) });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(mocked.get).toHaveBeenCalledTimes(1);
  });

  it('useUserEntries and useUserFavorites fetch by user id and stay idle without one', async () => {
    mocked.entries.mockResolvedValue([]);
    mocked.favorites.mockResolvedValue([]);
    const client = freshClient();
    const entries = await renderHook(() => useUserEntries('u1'), { wrapper: wrapperFor(client) });
    const favorites = await renderHook(() => useUserFavorites('u1'), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(entries.result.current.data).toEqual([]));
    await waitFor(() => expect(favorites.result.current.data).toEqual([]));
    expect(mocked.entries).toHaveBeenCalledWith('u1');
    expect(mocked.favorites).toHaveBeenCalledWith('u1');

    const idle = await renderHook(() => useUserEntries(undefined), {
      wrapper: wrapperFor(client),
    });
    const idleFavorites = await renderHook(() => useUserFavorites(undefined), {
      wrapper: wrapperFor(client),
    });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(idleFavorites.result.current.fetchStatus).toBe('idle');
  });

  it('useUserPosts chains pages through nextCursor and stays idle without an id', async () => {
    mocked.userPosts.mockResolvedValueOnce({ items: [], nextCursor: 'c1' });
    mocked.userPosts.mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = freshClient();
    const { result } = await renderHook(() => useUserPosts('u1', 'posts'), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(mocked.userPosts).toHaveBeenLastCalledWith('u1', { cursor: undefined });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocked.userPosts).toHaveBeenLastCalledWith('u1', { cursor: 'c1' });
    expect(result.current.hasNextPage).toBe(false);
    expect(client.getQueryData(['userPosts', 'u1', 'posts'])).toBeDefined();

    const idle = await renderHook(() => useUserPosts(undefined, 'posts'), {
      wrapper: wrapperFor(client),
    });
    expect(idle.result.current.fetchStatus).toBe('idle');
    expect(mocked.userPosts).toHaveBeenCalledTimes(2);
  });

  it('useUserPosts asks for the media filter on Mídia and for the own likes on Curtidas', async () => {
    mocked.userPosts.mockResolvedValue({ items: [], nextCursor: null });
    mockedFeed.myLikes.mockResolvedValue({ items: [], nextCursor: null });
    const client = freshClient();
    const media = await renderHook(() => useUserPosts('u1', 'media'), { wrapper: wrapperFor(client) });
    const likes = await renderHook(() => useUserPosts('me', 'likes'), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(media.result.current.data).toBeDefined());
    await waitFor(() => expect(likes.result.current.data).toBeDefined());
    expect(mocked.userPosts).toHaveBeenCalledWith('u1', { filter: 'media', cursor: undefined });
    expect(mockedFeed.myLikes).toHaveBeenCalledWith(undefined);
    // Under the profile's post lists, where post toggles and the own-profile refreshes reach them.
    expect(client.getQueryData(['userPosts', 'u1', 'media'])).toBeDefined();
    expect(client.getQueryData(['userPosts', 'me', 'likes'])).toBeDefined();
  });

  it('useUserReplies pages through the comments of a user', async () => {
    mocked.replies.mockResolvedValueOnce({ items: [], nextCursor: 'c1' });
    mocked.replies.mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = freshClient();
    const { result } = await renderHook(() => useUserReplies('u1'), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(mocked.replies).toHaveBeenLastCalledWith('u1', undefined);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocked.replies).toHaveBeenLastCalledWith('u1', 'c1');
    expect(result.current.hasNextPage).toBe(false);

    const idle = await renderHook(() => useUserReplies(undefined), { wrapper: wrapperFor(client) });
    expect(idle.result.current.fetchStatus).toBe('idle');
  });

  it.each(['followers', 'following'] as const)('useFollowList pages through %s', async (kind) => {
    mocked[kind].mockResolvedValueOnce({ items: [], nextCursor: 'c1' });
    mocked[kind].mockResolvedValueOnce({ items: [], nextCursor: null });
    const client = freshClient();
    const { result } = await renderHook(() => useFollowList('u1', kind), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(mocked[kind]).toHaveBeenLastCalledWith('u1', undefined);

    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocked[kind]).toHaveBeenLastCalledWith('u1', 'c1');
    expect(client.getQueryData(['follows', 'u1', kind])).toBeDefined();
  });
});

describe('usePeopleSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['clearTimeout', 'nextTick', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits 300 ms after the last keystroke and ignores terms under 2 characters', async () => {
    mocked.search.mockResolvedValue([person('a')]);
    const { result, rerender } = await renderHook(
      (props: { term: string }) => usePeopleSearch(props.term),
      { wrapper: wrapperFor(freshClient()), initialProps: { term: ' a ' } },
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(500);
    });
    expect(mocked.search).not.toHaveBeenCalled();

    await rerender({ term: ' an ' });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(299);
    });
    expect(mocked.search).not.toHaveBeenCalled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(mocked.search).toHaveBeenCalledWith('an');
    await waitFor(() => expect(result.current.data).toEqual([person('a')]));
  });

  it('keeps the previous results while the next term loads', async () => {
    const next = deferred<PersonResult[]>();
    mocked.search.mockResolvedValueOnce([person('a')]).mockReturnValueOnce(next.promise);
    const { result, rerender } = await renderHook(
      (props: { term: string }) => usePeopleSearch(props.term),
      { wrapper: wrapperFor(freshClient()), initialProps: { term: 'an' } },
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    await waitFor(() => expect(result.current.data).toEqual([person('a')]));

    await rerender({ term: 'ana' });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(300);
    });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toEqual([person('a')]);

    await act(async () => {
      next.resolve([person('b')]);
    });
    await waitFor(() => expect(result.current.data).toEqual([person('b')]));
  });
});

describe('useToggleFollow', () => {
  function seed(client: QueryClient) {
    client.setQueryData(['profile', 'u1'], profile('u1'));
    client.setQueryData(['profile', 'u2'], profile('u2'));
    client.setQueryData(['people', 'an'], [person('u1'), person('u2')]);
    client.setQueryData(['people', 'ana'], [person('u1')]);
  }

  const followed = (client: QueryClient, key: unknown[]) =>
    client.getQueryData<UserProfile>(key)?.isFollowedByMe;

  it('updates the profile and every cached search result right away, then refreshes the following feed', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    seed(client);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });

    expect(client.getQueryData<UserProfile>(['profile', 'u1'])).toMatchObject({
      isFollowedByMe: true,
      followerCount: 6,
    });
    expect(client.getQueryData<PersonResult[]>(['people', 'an'])).toEqual([
      person('u1', { isFollowedByMe: true }),
      person('u2'),
    ]);
    expect(client.getQueryData<PersonResult[]>(['people', 'ana'])).toEqual([
      person('u1', { isFollowedByMe: true }),
    ]);
    expect(followed(client, ['profile', 'u2'])).toBe(false);
    expect(mocked.setFollow).toHaveBeenCalledWith('u1', true);

    await act(async () => {
      request.resolve();
    });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed', 'following'] }),
    );
    expect(showToast).not.toHaveBeenCalled();
  });

  it('refreshes the profile and the own profile once the last tap of a user settles', async () => {
    const first = deferred();
    const second = deferred();
    mocked.setFollow.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = freshClient();
    seed(client);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: false });
    });

    await act(async () => {
      first.resolve();
    });
    await waitFor(() => expect(mocked.setFollow).toHaveBeenCalledTimes(2));
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['profile', 'u1'], exact: true });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['profile', 'me'], exact: true });

    await act(async () => {
      second.resolve();
    });
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'u1'], exact: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'me'], exact: true });
  });

  it('refreshes both profiles after a failed follow as well', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    seed(client);
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });

    await act(async () => {
      request.reject(new Error('boom'));
    });

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'u1'], exact: true }),
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'me'], exact: true });
  });

  it('unfollowing lowers the follower count', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['profile', 'u1'], profile('u1', { isFollowedByMe: true }));
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate({ id: 'u1', follow: false });
    });

    expect(client.getQueryData<UserProfile>(['profile', 'u1'])).toMatchObject({
      isFollowedByMe: false,
      followerCount: 4,
    });
    await act(async () => {
      request.resolve();
    });
  });

  it('a failed follow restores that user in the profile and the search results and shows a toast', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });

    await act(async () => {
      request.reject(new Error('boom'));
    });

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(client.getQueryData<UserProfile>(['profile', 'u1'])).toMatchObject({
      isFollowedByMe: false,
      followerCount: 5,
    });
    expect(client.getQueryData<PersonResult[]>(['people', 'an'])).toEqual([
      person('u1'),
      person('u2'),
    ]);
    expect(client.getQueryData<PersonResult[]>(['people', 'ana'])).toEqual([person('u1')]);
  });

  it('only the failing user is rolled back', async () => {
    const ok = deferred();
    const bad = deferred();
    mocked.setFollow.mockImplementation((id) => (id === 'u1' ? bad.promise : ok.promise));
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });
    await act(async () => {
      result.current.mutate({ id: 'u2', follow: true });
    });
    expect(followed(client, ['profile', 'u2'])).toBe(true);

    await act(async () => {
      ok.resolve();
      bad.reject(new Error('boom'));
    });

    await waitFor(() => expect(followed(client, ['profile', 'u1'])).toBe(false));
    expect(followed(client, ['profile', 'u2'])).toBe(true);
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('serializes taps of one user and rolls back to the last confirmed state only after the last one fails', async () => {
    const first = deferred();
    const second = deferred();
    mocked.setFollow.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: false });
    });
    expect(mocked.setFollow).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
    });
    await waitFor(() => expect(mocked.setFollow).toHaveBeenCalledTimes(2));
    expect(mocked.setFollow).toHaveBeenLastCalledWith('u1', false);
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => {
      second.reject(new Error('boom'));
    });

    // The server confirmed "followed" before the unfollow failed.
    await waitFor(() => expect(followed(client, ['profile', 'u1'])).toBe(true));
    expect(client.getQueryData<UserProfile>(['profile', 'u1'])?.followerCount).toBe(6);
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});

describe('useToggleFollow announce', () => {
  it('confirms an announced follow with a toast once the server has it, with no observer left', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['profile', 'u1'], profile('u1'));
    const { result, unmount } = await renderHook(() => useToggleFollow(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true, announce: 'Ana' });
    });
    // The button that asked is gone (the compact header drops it on the optimistic write).
    await unmount();
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => {
      request.resolve();
    });
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Seguindo Ana'));
  });

  it('stays silent without announce, on an unfollow and when the follow fails', async () => {
    mocked.setFollow.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const client = freshClient();
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ id: 'u1', follow: true });
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 'u2', follow: false, announce: 'Bia' });
    });
    expect(showToast).not.toHaveBeenCalled();

    mocked.setFollow.mockRejectedValueOnce(new Error('boom'));
    client.setQueryData(['profile', 'u3'], profile('u3'));
    await act(async () => {
      await result.current.mutateAsync({ id: 'u3', follow: true, announce: 'Caio' }).catch(() => undefined);
    });
    expect(showToast).not.toHaveBeenCalledWith('Seguindo Caio');
  });
});

describe('useToggleFollow in the follows lists', () => {
  function listPerson(id: string, overrides: Partial<FollowListPerson> = {}): FollowListPerson {
    return { ...person(id), followsMe: false, ...overrides };
  }

  function listOf(...items: FollowListPerson[]) {
    return { pages: [{ items, nextCursor: null }], pageParams: [undefined] };
  }

  function rows(client: QueryClient, key: unknown[]) {
    return client
      .getQueryData<{ pages: FollowListPage[] }>(key)
      ?.pages.flatMap((page) => page.items.map((p) => [p.id, p.isFollowedByMe]));
  }

  function seed(client: QueryClient) {
    client.setQueryData(['profile', 'me'], profile('me', { followingCount: 2 }));
    client.setQueryData(['profile', 'u1'], profile('u1'));
    client.setQueryData(['follows', 'me', 'followers'], listOf(listPerson('u1'), listPerson('u2')));
    client.setQueryData(['follows', 'u9', 'following'], listOf(listPerson('u1')));
  }

  it('updates the row in every list, the profile and the own following count right away', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });

    expect(rows(client, ['follows', 'me', 'followers'])).toEqual([
      ['u1', true],
      ['u2', false],
    ]);
    expect(rows(client, ['follows', 'u9', 'following'])).toEqual([['u1', true]]);
    expect(client.getQueryData<UserProfile>(['profile', 'u1'])).toMatchObject({
      isFollowedByMe: true,
      followerCount: 6,
    });
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.followingCount).toBe(3);

    await act(async () => {
      request.resolve();
    });
  });

  it('counts an unfollow from a list whose user has no cached profile', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['profile', 'me'], profile('me', { followingCount: 2 }));
    client.setQueryData(['follows', 'me', 'following'], listOf(listPerson('u2', { isFollowedByMe: true })));
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });

    await act(async () => {
      result.current.mutate({ id: 'u2', follow: false });
    });

    // The row stays, now offering to follow again.
    expect(rows(client, ['follows', 'me', 'following'])).toEqual([['u2', false]]);
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.followingCount).toBe(1);
    await act(async () => {
      request.resolve();
    });
  });

  it('rolls the rows and both counts back when the follow fails', async () => {
    const request = deferred();
    mocked.setFollow.mockReturnValue(request.promise);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });

    await act(async () => {
      request.reject(new Error('boom'));
    });

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(rows(client, ['follows', 'me', 'followers'])).toEqual([
      ['u1', false],
      ['u2', false],
    ]);
    expect(rows(client, ['follows', 'u9', 'following'])).toEqual([['u1', false]]);
    expect(client.getQueryData<UserProfile>(['profile', 'u1'])).toMatchObject({
      isFollowedByMe: false,
      followerCount: 5,
    });
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.followingCount).toBe(2);
  });

  it('nets the own following count over a follow and unfollow of the same user', async () => {
    const first = deferred();
    const second = deferred();
    mocked.setFollow.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFollow(), { wrapper: wrapperFor(client) });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: true });
    });
    await act(async () => {
      result.current.mutate({ id: 'u1', follow: false });
    });
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.followingCount).toBe(2);

    await act(async () => {
      first.resolve();
    });
    await waitFor(() => expect(mocked.setFollow).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.reject(new Error('boom'));
    });

    // The server confirmed the follow before the unfollow failed.
    await waitFor(() => expect(rows(client, ['follows', 'me', 'followers'])?.[0]).toEqual(['u1', true]));
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.followingCount).toBe(3);
  });
});

describe('useUpdateProfile', () => {
  it('merges the sent changes into the profile and the session user', async () => {
    const request = deferred();
    mocked.update.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['profile', 'me'], profile('me', { name: 'Eu', bio: null }));
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateProfile(), { wrapper: wrapperFor(client) });

    let done!: Promise<void>;
    await act(async () => {
      done = result.current.mutateAsync({ name: 'Novo', bio: 'olá' });
    });
    expect(useSession.getState().user?.name).toBe('Eu');

    await act(async () => {
      request.resolve();
      await done;
    });

    expect(mocked.update).toHaveBeenCalledWith({ name: 'Novo', bio: 'olá' });
    expect(client.getQueryData<UserProfile>(['profile', 'me'])).toMatchObject({
      name: 'Novo',
      bio: 'olá',
      username: 'user-me',
    });
    expect(useSession.getState().user).toEqual({ ...me, name: 'Novo', bio: 'olá' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
  });

  it('leaves the cache and the session alone when the update fails', async () => {
    mocked.update.mockRejectedValue(new Error('conflict'));
    const client = freshClient();
    client.setQueryData(['profile', 'me'], profile('me'));
    const { result } = await renderHook(() => useUpdateProfile(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await expect(result.current.mutateAsync({ username: 'taken' })).rejects.toThrow('conflict');
    });

    expect(useSession.getState().user).toEqual(me);
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.username).toBe('user-me');
  });

  it('still updates the session when the profile is not cached', async () => {
    mocked.update.mockResolvedValue(undefined);
    const client = freshClient();
    const { result } = await renderHook(() => useUpdateProfile(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ username: 'novo' });
    });

    expect(useSession.getState().user?.username).toBe('novo');
    expect(client.getQueryData(['profile', 'me'])).toBeUndefined();
  });
});

describe('useUploadImage', () => {
  it('writes the new avatar URL into the profile and the session user', async () => {
    const request = deferred<string>();
    mocked.upload.mockReturnValue(request.promise);
    const client = freshClient();
    client.setQueryData(['profile', 'me'], profile('me'));
    const { result } = await renderHook(() => useUploadImage(), { wrapper: wrapperFor(client) });

    let done!: Promise<string>;
    await act(async () => {
      done = result.current.mutateAsync({ kind: 'avatar', image });
    });
    expect(useSession.getState().user?.avatarUrl).toBeNull();

    await act(async () => {
      request.resolve('/uploads/a.png');
      await done;
    });

    expect(mocked.upload).toHaveBeenCalledWith('avatar', image);
    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.avatarUrl).toBe('/uploads/a.png');
    expect(useSession.getState().user?.avatarUrl).toBe('/uploads/a.png');
    expect(useSession.getState().user?.bannerUrl).toBeNull();
  });

  it('writes the banner URL for a banner upload', async () => {
    mocked.upload.mockResolvedValue('/uploads/b.png');
    const client = freshClient();
    client.setQueryData(['profile', 'me'], profile('me'));
    const { result } = await renderHook(() => useUploadImage(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ kind: 'banner', image });
    });

    expect(client.getQueryData<UserProfile>(['profile', 'me'])?.bannerUrl).toBe('/uploads/b.png');
    expect(useSession.getState().user?.bannerUrl).toBe('/uploads/b.png');
    expect(useSession.getState().user?.avatarUrl).toBeNull();
  });
});
