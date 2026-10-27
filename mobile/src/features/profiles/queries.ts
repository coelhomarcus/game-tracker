import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { authErrorMessage, useSession } from '@/features/auth';
import { feedApi } from '@/features/feed/api';
import { createLanes } from '@/features/feed/likeLanes';
import type { PostPage } from '@/features/feed/types';
import { showToast } from '@/lib/toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { profilesApi, type ProfileChanges } from './api';
import {
  cancelOwnProfileRefetch,
  invalidateAvatarLists,
  patchOwnProfile,
  type OwnProfilePatch,
} from './ownProfile';
import type {
  FollowListPage,
  ImageKind,
  PersonResult,
  PickedImage,
  UserProfile,
  UserReplyPage,
} from './types';

type PostPages = InfiniteData<PostPage, string | undefined>;
type FollowPages = InfiniteData<FollowListPage, string | undefined>;
type ReplyPages = InfiniteData<UserReplyPage, string | undefined>;

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;

export function useProfile(id?: string) {
  return useQuery({
    queryKey: ['profile', id],
    queryFn: id === undefined ? skipToken : () => profilesApi.get(id),
  });
}

export function usePeopleSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery({
    queryKey: ['people', debounced],
    queryFn: () => profilesApi.search(debounced),
    enabled: debounced.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
  });
}

/**
 * The post lists of a profile: `posts` (the user's posts and reposts), `media` (their own posts
 * with an image) and `likes` (what the signed-in user liked: only asked for on the own profile).
 * All live under `['userPosts', id]`, where post toggles and the own-profile refreshes reach them.
 */
export type ProfileFeed = 'posts' | 'media' | 'likes';

function fetchProfileFeed(id: string, feed: ProfileFeed, cursor: string | undefined) {
  if (feed === 'likes') return feedApi.myLikes(cursor);
  return profilesApi.userPosts(id, feed === 'media' ? { filter: 'media', cursor } : { cursor });
}

export function useUserPosts(id: string | undefined, feed: ProfileFeed) {
  return useInfiniteQuery<PostPage, Error, PostPages, readonly unknown[], string | undefined>({
    queryKey: ['userPosts', id, feed],
    queryFn:
      id === undefined ? skipToken : ({ pageParam }) => fetchProfileFeed(id, feed, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** The comments a user wrote (the Respostas tab), newest first. */
export function useUserReplies(id: string | undefined) {
  return useInfiniteQuery<UserReplyPage, Error, ReplyPages, readonly unknown[], string | undefined>({
    queryKey: ['userReplies', id],
    queryFn: id === undefined ? skipToken : ({ pageParam }) => profilesApi.replies(id, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export type FollowListKind = 'followers' | 'following';

/** Who follows the user, or whom they follow, newest follow first. */
export function useFollowList(id: string | undefined, kind: FollowListKind) {
  return useInfiniteQuery<FollowListPage, Error, FollowPages, readonly unknown[], string | undefined>({
    queryKey: ['follows', id, kind],
    queryFn:
      id === undefined
        ? skipToken
        : ({ pageParam }) =>
            kind === 'followers' ? profilesApi.followers(id, pageParam) : profilesApi.following(id, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUserEntries(id?: string) {
  return useQuery({
    queryKey: ['userEntries', id],
    queryFn: id === undefined ? skipToken : () => profilesApi.entries(id),
  });
}

export function useUserFavorites(id?: string) {
  return useQuery({
    queryKey: ['userFavorites', id],
    queryFn: id === undefined ? skipToken : () => profilesApi.favorites(id),
  });
}

const followLanes = createLanes();
const followLane = (id: string) => `follow:${id}`;

/** Moves the profile to `followed`, adjusting the follower count only when the copy differs. */
function withFollow(followed: boolean) {
  return (profile: UserProfile): UserProfile =>
    profile.isFollowedByMe === followed
      ? profile
      : {
          ...profile,
          isFollowedByMe: followed,
          followerCount: Math.max(0, profile.followerCount + (followed ? 1 : -1)),
        };
}

/** Whether the signed-in user follows `id`, as the cache shows it now (profile, lists, search). */
function cachedFollowState(client: QueryClient, id: string): boolean | undefined {
  const profile = client.getQueryData<UserProfile>(['profile', id]);
  if (profile) return profile.isFollowedByMe;
  for (const [, data] of client.getQueriesData<FollowPages>({ queryKey: ['follows'] })) {
    for (const page of data?.pages ?? []) {
      const person = page.items.find((p) => p.id === id);
      if (person) return person.isFollowedByMe;
    }
  }
  for (const [, results] of client.getQueriesData<PersonResult[]>({ queryKey: ['people'] })) {
    const person = results?.find((p) => p.id === id);
    if (person) return person.isFollowedByMe;
  }
  return undefined;
}

/** The list with `id`'s row moved to `followed`; the same object when no row changes. */
function withFollowedRow(pages: FollowPages | undefined, id: string, followed: boolean) {
  const changes = pages?.pages.some((page) =>
    page.items.some((p) => p.id === id && p.isFollowedByMe !== followed),
  );
  if (!pages || !changes) return pages;
  return {
    ...pages,
    pages: pages.pages.map((page) => ({
      ...page,
      items: page.items.map((p) => (p.id === id ? { ...p, isFollowedByMe: followed } : p)),
    })),
  };
}

/**
 * Applies the follow state to the user's profile, every cached people search and followers or
 * following list, and to the signed-in user's "seguindo" count when the state really changes.
 */
function setFollowEverywhere(client: QueryClient, id: string, followed: boolean) {
  const before = cachedFollowState(client, id);
  const me = useSession.getState().user?.id;
  if (before !== undefined && before !== followed && me !== undefined && me !== id) {
    client.setQueryData<UserProfile>(['profile', me], (profile) =>
      profile
        ? { ...profile, followingCount: Math.max(0, profile.followingCount + (followed ? 1 : -1)) }
        : profile,
    );
  }
  client.setQueryData<UserProfile>(['profile', id], (profile) =>
    profile ? withFollow(followed)(profile) : profile,
  );
  client.setQueriesData<PersonResult[]>({ queryKey: ['people'] }, (results) =>
    results?.some((p) => p.id === id && p.isFollowedByMe !== followed)
      ? results.map((p) => (p.id === id ? { ...p, isFollowedByMe: followed } : p))
      : results,
  );
  client.setQueriesData<FollowPages>({ queryKey: ['follows'] }, (pages) =>
    withFollowedRow(pages, id, followed),
  );
}

/** Marks the profile and the signed-in user's own profile stale; they are the same key for self. */
function refreshProfiles(client: QueryClient, id: string) {
  const me = useSession.getState().user?.id;
  const ids = me === undefined || me === id ? [id] : [id, me];
  for (const profileId of ids) {
    void client.invalidateQueries({ queryKey: ['profile', profileId], exact: true });
  }
  // Following someone adds or removes a row in two lists that the optimistic write cannot build.
  // They are only marked stale: a row the user just unfollowed stays in an open list, and the next
  // mount or pull brings the true membership.
  for (const key of [
    ['follows', id, 'followers'],
    ...(me === undefined ? [] : [['follows', me, 'following']]),
  ]) {
    void client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
  }
}

export type FollowVariables = {
  id: string;
  follow: boolean;
  /**
   * The person's name, to confirm a follow with a toast ("Seguindo <nome>") once the server has
   * it. The hook shows it, so it appears even when the button that asked unmounts on the
   * optimistic write (the compact header's Seguir does).
   */
  announce?: string;
};

/**
 * Optimistic everywhere the user is cached. Requests of one user run in order; a failure
 * reverts only that user, and only once no later tap of the same user is pending.
 */
export function useToggleFollow() {
  const client = useQueryClient();
  const settle = (id: string, follow: boolean, error?: Error) => {
    const lane = followLane(id);
    const to = followLanes.settle(lane, follow, !error);
    if (to !== undefined) {
      setFollowEverywhere(client, id, to);
      if (error) showToast(authErrorMessage(error));
    }
    // A GET that started before the last request ended may carry pre-follow data, and the own
    // profile's "following" count changes with every follow, so both are refetched once.
    if (!followLanes.has(lane)) refreshProfiles(client, id);
  };
  return useMutation<void, Error, FollowVariables>({
    mutationFn: ({ id, follow }) =>
      followLanes.run(followLane(id), () => profilesApi.setFollow(id, follow)),
    onMutate: async ({ id, follow }) => {
      followLanes.begin(followLane(id), !follow);
      const me = useSession.getState().user?.id;
      await Promise.all([
        client.cancelQueries({ queryKey: ['profile', id], exact: true }),
        // The own profile's "seguindo" count is written too.
        me === undefined || me === id
          ? undefined
          : client.cancelQueries({
              queryKey: ['profile', me],
              exact: true,
              predicate: (query) => query.state.data !== undefined,
            }),
        client.cancelQueries({
          queryKey: ['people'],
          predicate: (query) => query.state.data !== undefined,
        }),
        client.cancelQueries({
          queryKey: ['follows'],
          predicate: (query) => query.state.data !== undefined,
        }),
      ]);
      setFollowEverywhere(client, id, follow);
    },
    onSuccess: (_data, { id, follow, announce }) => {
      settle(id, follow);
      if (follow && announce !== undefined) showToast(`Seguindo ${announce}`);
      return client.invalidateQueries({ queryKey: ['feed', 'following'] });
    },
    onError: (error, { id, follow }) => settle(id, follow, error),
  });
}

type OwnChangeContext = { me: string | undefined };

/**
 * Remembers who makes a change to the own profile and stops a profile refetch already in flight,
 * whose older answer would otherwise overwrite what the change writes.
 */
async function beginOwnChange(client: QueryClient): Promise<OwnChangeContext> {
  const me = useSession.getState().user?.id;
  if (me !== undefined) await cancelOwnProfileRefetch(client, me);
  return { me };
}

/** The update answers with no body, so what was sent is what the profile now holds. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation<void, Error, ProfileChanges, OwnChangeContext>({
    mutationFn: (changes) => profilesApi.update(changes),
    onMutate: () => beginOwnChange(client),
    onSuccess: (_data, changes, context) => {
      // A sign-out or account switch while the request was in flight leaves nothing to update.
      if (context?.me === undefined || useSession.getState().user?.id !== context.me) return;
      const sent: OwnProfilePatch = {};
      if (changes.username !== undefined) sent.username = changes.username;
      if (changes.name !== undefined) sent.name = changes.name;
      if (changes.bio !== undefined) sent.bio = changes.bio;
      patchOwnProfile(client, context.me, sent);
      return client.invalidateQueries({ queryKey: ['profile', context.me] });
    },
  });
}

/** The key of the profile field that holds each image's URL. */
const IMAGE_FIELD = { avatar: 'avatarUrl', banner: 'bannerUrl' } as const satisfies Record<
  ImageKind,
  keyof OwnProfilePatch
>;

/**
 * Writes an image change into the own profile and session. A new or removed avatar also
 * refreshes every list that shows it: the server deleted the old file.
 */
function applyImageChange(client: QueryClient, me: string, kind: ImageKind, url: string | null) {
  patchOwnProfile(client, me, { [IMAGE_FIELD[kind]]: url });
  if (kind === 'avatar') void invalidateAvatarLists(client);
}

export function useUploadImage() {
  const client = useQueryClient();
  return useMutation<string, Error, { kind: ImageKind; image: PickedImage }, OwnChangeContext>({
    mutationFn: ({ kind, image }) => profilesApi.upload(kind, image),
    onMutate: () => beginOwnChange(client),
    onSuccess: (url, { kind }, context) => {
      if (context?.me === undefined || useSession.getState().user?.id !== context.me) return;
      applyImageChange(client, context.me, kind, url);
    },
  });
}

/** Removes the avatar or the banner; the profile and session then hold no URL for it. */
export function useRemoveImage() {
  const client = useQueryClient();
  return useMutation<void, Error, ImageKind, OwnChangeContext>({
    mutationFn: (kind) => profilesApi.removeImage(kind),
    onMutate: () => beginOwnChange(client),
    onSuccess: (_data, kind, context) => {
      if (context?.me === undefined || useSession.getState().user?.id !== context.me) return;
      applyImageChange(client, context.me, kind, null);
    },
  });
}
