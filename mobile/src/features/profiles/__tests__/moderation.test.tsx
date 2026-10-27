import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { showToast } from '@/lib/toast';

import { profilesApi } from '../api';
import { moderationKey, useSetModeration } from '../queries';
import type { Post, PostPage } from '@/features/feed/types';
import { socialDefaults } from '@/test-utils/postDefaults';

import type { ModerationPage, UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/profiles/api', () => ({
  profilesApi: { mutes: jest.fn(), blocks: jest.fn(), setMute: jest.fn(), setBlock: jest.fn() },
}));

const mocked = jest.mocked(profilesApi);

const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const flagOf = (flag: 'isMutedByMe' | 'isBlockedByMe') =>
  client.getQueryData<UserProfile>(['profile', 'u2'])?.[flag];

beforeEach(() => {
  jest.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData<Partial<UserProfile>>(['profile', 'u2'], {
    id: 'u2',
    isMutedByMe: false,
    isBlockedByMe: false,
  });
  client.setQueryData<InfiniteData<ModerationPage, string | undefined>>(moderationKey('mutes'), {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
});

afterEach(() => client.clear());

describe('useSetModeration', () => {
  it('mutes at once and marks the muted list stale once the server agrees', async () => {
    const request = deferred();
    mocked.setMute.mockReturnValueOnce(request.promise);
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    expect(mocked.setMute).toHaveBeenCalledWith('u2', true);
    expect(flagOf('isMutedByMe')).toBe(true);
    expect(client.getQueryState(moderationKey('mutes'))?.isInvalidated).toBe(false);
    await act(async () => request.resolve());

    await waitFor(() =>
      expect(client.getQueryState(moderationKey('mutes'))?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(['profile', 'u2'])?.isInvalidated).toBe(true);
  });

  it('rolls a failed block back with a toast and leaves the list alone', async () => {
    mocked.setBlock.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Não foi possível concluir. Tente de novo.'));
    expect(flagOf('isBlockedByMe')).toBe(false);
    expect(mocked.setMute).not.toHaveBeenCalled();
  });

  it('runs taps on one person in order and ends where the last tap did', async () => {
    const first = deferred();
    mocked.setMute.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));
    await act(async () => result.current.mutate({ person: bia, on: false }));
    expect(mocked.setMute).toHaveBeenCalledTimes(1);
    await act(async () => first.reject(new Error('boom')));

    await waitFor(() => expect(mocked.setMute).toHaveBeenCalledTimes(2));
    expect(mocked.setMute.mock.calls).toEqual([
      ['u2', true],
      ['u2', false],
    ]);
    // The earlier failure is not rolled back: the later tap decided the outcome.
    expect(flagOf('isMutedByMe')).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });
});

describe('blocking cleans the caches', () => {
  // A request left open would hold the person's lane, and the next test's request with it.
  const open: (() => void)[] = [];
  const hang = () => {
    const request = deferred();
    open.push(request.resolve);
    return request.promise;
  };
  afterEach(async () => {
    await act(async () => open.splice(0).forEach((resolve) => resolve()));
  });

  const ana = { id: 'u1', username: 'ana', name: 'Ana', avatarUrl: null };

  function post(id: string, author = bia, by?: typeof ana): Post {
    return {
      id,
      author,
      content: id,
      type: 'status',
      activityStatus: null,
      createdAt: new Date('2026-10-20T12:00:00.000Z'),
      game: null,
      entry: null,
      imageUrl: null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      ...socialDefaults,
      reason: by ? { type: 'repost', by, at: new Date('2026-10-21T12:00:00.000Z') } : null,
    };
  }

  function seedLists() {
    const pages = (items: Post[]): InfiniteData<PostPage, string | undefined> => ({
      pages: [{ items, nextCursor: null }],
      pageParams: [undefined],
    });
    // Bia's posts, a repost by Bia of Ana's post, and one that has nothing to do with Bia.
    const mixed = [post('p1'), post('p2', ana), post('p3', ana, bia), post('p4', ana)];
    client.setQueryData(['feed', 'all'], pages(mixed));
    client.setQueryData(['userPosts', 'u2', 'posts'], pages([post('p1'), post('p5')]));
    client.setQueryData(['gamePosts', 'g1'], pages(mixed));
    client.setQueryData(['bookmarks'], pages(mixed));
  }

  const idsOf = (key: readonly unknown[]) =>
    client
      .getQueryData<InfiniteData<PostPage>>(key)
      ?.pages.flatMap((page) => page.items.map((item) => item.id));

  it('takes the blocked user’s posts and reposts out of every loaded list at once', async () => {
    seedLists();
    mocked.setBlock.mockReturnValueOnce(hang());
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    expect(idsOf(['feed', 'all'])).toEqual(['p2', 'p4']);
    expect(idsOf(['gamePosts', 'g1'])).toEqual(['p2', 'p4']);
    expect(idsOf(['bookmarks'])).toEqual(['p2', 'p4']);
    expect(idsOf(['userPosts', 'u2', 'posts'])).toEqual([]);
  });

  it('takes a muted user out of the feeds at once and leaves every other list alone', async () => {
    seedLists();
    mocked.setMute.mockReturnValueOnce(hang());
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    expect(idsOf(['feed', 'all'])).toEqual(['p2', 'p4']);
    expect(idsOf(['gamePosts', 'g1'])).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(idsOf(['bookmarks'])).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(idsOf(['userPosts', 'u2', 'posts'])).toEqual(['p1', 'p5']);
  });

  it('puts the feed posts back when the mute fails', async () => {
    seedLists();
    mocked.setMute.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(flagOf('isMutedByMe')).toBe(false);
    expect(idsOf(['feed', 'all'])).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('keeps the posts out when a mute is undone, since only the server knows what comes back', async () => {
    seedLists();
    mocked.setMute.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));
    await waitFor(() => expect(client.getQueryState(['profile', 'u2'])?.isInvalidated).toBe(true));
    await act(async () => result.current.mutate({ person: bia, on: false }));

    expect(idsOf(['feed', 'all'])).toEqual(['p2', 'p4']);
  });

  it('ends both follows on the profile at once', async () => {
    client.setQueryData<Partial<UserProfile>>(['profile', 'u2'], {
      id: 'u2',
      isMutedByMe: false,
      isBlockedByMe: false,
      isFollowedByMe: true,
      followsMe: true,
      followerCount: 5,
    });
    mocked.setBlock.mockReturnValueOnce(hang());
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    expect(client.getQueryData(['profile', 'u2'])).toMatchObject({
      isBlockedByMe: true,
      isFollowedByMe: false,
      followsMe: false,
      followerCount: 4,
    });
  });

  it('marks the feed, threads, searches, notifications and post lists stale once the block lands', async () => {
    const keys = [
      ['feed', 'all'],
      ['post', 'p1'],
      ['comments', 'p1', 'top'],
      ['people', 'bi'],
      ['gameSearch', 'zel'],
      ['notifications'],
      ['userPosts', 'u2', 'posts'],
      ['userReplies', 'u2'],
      ['gamePosts', 'g1'],
      ['bookmarks'],
    ];
    const empty = { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] };
    for (const key of keys) client.setQueryData(key, empty);
    const request = deferred();
    mocked.setBlock.mockReturnValueOnce(request.promise);
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    await act(async () => request.resolve());

    await waitFor(() => {
      for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    });
  });

  it('marks the lists stale again when the block fails, so the rolled back posts come back', async () => {
    seedLists();
    client.setQueryData(['notifications'], { items: [] });
    mocked.setBlock.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    await waitFor(() => expect(flagOf('isBlockedByMe')).toBe(false));
    expect(showToast).toHaveBeenCalled();
    expect(client.getQueryState(['feed', 'all'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['notifications'])?.isInvalidated).toBe(true);
  });

  it('puts back the follows, the follower count and the posts when the block fails', async () => {
    seedLists();
    client.setQueryData<Partial<UserProfile>>(['profile', 'u2'], {
      id: 'u2',
      isMutedByMe: false,
      isBlockedByMe: false,
      isFollowedByMe: true,
      followsMe: true,
      followerCount: 5,
    });
    mocked.setBlock.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(client.getQueryData(['profile', 'u2'])).toMatchObject({
      isBlockedByMe: false,
      isFollowedByMe: true,
      followsMe: true,
      followerCount: 5,
    });
    expect(idsOf(['feed', 'all'])).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(idsOf(['gamePosts', 'g1'])).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(idsOf(['bookmarks'])).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(idsOf(['userPosts', 'u2', 'posts'])).toEqual(['p1', 'p5']);
  });

  it('leaves a list that changed since the block alone when the block fails', async () => {
    seedLists();
    const request = deferred();
    mocked.setBlock.mockReturnValueOnce(request.promise);
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));
    // A refetch lands a newer page while the request is out.
    client.setQueryData(['feed', 'all'], {
      pages: [{ items: [post('p9', ana)], nextCursor: null }],
      pageParams: [undefined],
    });
    await act(async () => request.reject(new Error('boom')));

    await waitFor(() => expect(flagOf('isBlockedByMe')).toBe(false));
    expect(idsOf(['feed', 'all'])).toEqual(['p9']);
    expect(idsOf(['gamePosts', 'g1'])).toEqual(['p1', 'p2', 'p3', 'p4']);
  });
});
