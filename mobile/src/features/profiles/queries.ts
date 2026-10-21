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

import { authErrorMessage, useSession, type User } from '@/features/auth';
import { createLanes } from '@/features/feed/likeLanes';
import type { PostPage } from '@/features/feed/types';
import { showToast } from '@/lib/toast';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { profilesApi, type ProfileChanges } from './api';
import type { ImageKind, PersonResult, PickedImage, UserProfile } from './types';

type PostPages = InfiniteData<PostPage, string | undefined>;

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

/** `type` picks the activity tab or the posts tab of the profile. */
export function useUserPosts(id: string | undefined, type: 'activity' | 'post') {
  return useInfiniteQuery<PostPage, Error, PostPages, readonly unknown[], string | undefined>({
    queryKey: ['userPosts', id, type],
    queryFn:
      id === undefined ? skipToken : ({ pageParam }) => profilesApi.posts(id, type, pageParam),
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

/** Applies the follow state to the user's profile and to every cached people search. */
function setFollowEverywhere(client: QueryClient, id: string, followed: boolean) {
  client.setQueryData<UserProfile>(['profile', id], (profile) =>
    profile ? withFollow(followed)(profile) : profile,
  );
  client.setQueriesData<PersonResult[]>({ queryKey: ['people'] }, (results) =>
    results?.some((p) => p.id === id && p.isFollowedByMe !== followed)
      ? results.map((p) => (p.id === id ? { ...p, isFollowedByMe: followed } : p))
      : results,
  );
}

/**
 * Optimistic everywhere the user is cached. Requests of one user run in order; a failure
 * reverts only that user, and only once no later tap of the same user is pending.
 */
export function useToggleFollow() {
  const client = useQueryClient();
  const settle = (id: string, follow: boolean, error?: Error) => {
    const to = followLanes.settle(followLane(id), follow, !error);
    if (to === undefined) return;
    setFollowEverywhere(client, id, to);
    if (error) showToast(authErrorMessage(error));
  };
  return useMutation<void, Error, { id: string; follow: boolean }>({
    mutationFn: ({ id, follow }) =>
      followLanes.run(followLane(id), () => profilesApi.setFollow(id, follow)),
    onMutate: async ({ id, follow }) => {
      followLanes.begin(followLane(id), !follow);
      await Promise.all([
        client.cancelQueries({ queryKey: ['profile', id], exact: true }),
        client.cancelQueries({
          queryKey: ['people'],
          predicate: (query) => query.state.data !== undefined,
        }),
      ]);
      setFollowEverywhere(client, id, follow);
    },
    onSuccess: (_data, { id, follow }) => {
      settle(id, follow);
      return client.invalidateQueries({ queryKey: ['feed', 'following'] });
    },
    onError: (error, { id, follow }) => settle(id, follow, error),
  });
}

/** Writes the given fields into the signed-in user's session copy. */
function patchSessionUser(patch: Partial<User>) {
  useSession.setState((state) => (state.user ? { user: { ...state.user, ...patch } } : state));
}

function patchMyProfile(client: QueryClient, me: string, patch: Partial<UserProfile>) {
  client.setQueryData<UserProfile>(['profile', me], (profile) =>
    profile ? { ...profile, ...patch } : profile,
  );
}

/** The update answers with no body, so what was sent is what the profile now holds. */
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation<void, Error, ProfileChanges, { me: string | undefined }>({
    mutationFn: (changes) => profilesApi.update(changes),
    onMutate: () => ({ me: useSession.getState().user?.id }),
    onSuccess: (_data, changes, context) => {
      // A sign-out or account switch while the request was in flight leaves nothing to update.
      if (context?.me === undefined || useSession.getState().user?.id !== context.me) return;
      const sent: Partial<User> = {};
      if (changes.username !== undefined) sent.username = changes.username;
      if (changes.name !== undefined) sent.name = changes.name;
      if (changes.bio !== undefined) sent.bio = changes.bio;
      patchMyProfile(client, context.me, sent);
      patchSessionUser(sent);
      return client.invalidateQueries({ queryKey: ['profile', context.me] });
    },
  });
}

export function useUploadImage() {
  const client = useQueryClient();
  return useMutation<
    string,
    Error,
    { kind: ImageKind; image: PickedImage },
    { me: string | undefined }
  >({
    mutationFn: ({ kind, image }) => profilesApi.upload(kind, image),
    onMutate: () => ({ me: useSession.getState().user?.id }),
    onSuccess: (url, { kind }, context) => {
      if (context?.me === undefined || useSession.getState().user?.id !== context.me) return;
      const patch = kind === 'avatar' ? { avatarUrl: url } : { bannerUrl: url };
      patchMyProfile(client, context.me, patch);
      patchSessionUser(patch);
    },
  });
}
