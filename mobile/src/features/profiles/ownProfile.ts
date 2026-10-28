import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { useSession, type User } from '@/features/auth';

import type { UserProfile } from './types';

/** What both the session copy and the cached profile hold about the signed-in user. */
export type OwnProfilePatch = Partial<
  Pick<User, 'username' | 'name' | 'bio' | 'avatarUrl' | 'bannerUrl'>
>;

/**
 * Writes what the server now holds into the signed-in user's cached profile (when cached) and
 * session copy. `me` is who made the change: after a sign-out or an account switch nothing is
 * written.
 */
export function patchOwnProfile(client: QueryClient, me: string, patch: OwnProfilePatch): void {
  if (useSession.getState().user?.id !== me) return;
  client.setQueryData<UserProfile>(['profile', me], (profile) =>
    profile ? { ...profile, ...patch } : profile,
  );
  useSession.setState((state) => (state.user ? { user: { ...state.user, ...patch } } : state));
}

/**
 * Stops a refetch of the own profile that started before a change, so that its older answer
 * cannot overwrite what the change writes. A profile still loading for the first time is left
 * alone.
 */
export function cancelOwnProfileRefetch(client: QueryClient, me: string): Promise<void> {
  return client.cancelQueries({
    queryKey: ['profile', me],
    exact: true,
    predicate: (query) => query.state.data !== undefined,
  });
}

/**
 * Every cached list or page that shows users' avatars beside what they wrote: the feeds and
 * other post lists, a post and its comments, replies, chat, notifications and people lists.
 */
const AVATAR_LISTS: readonly QueryKey[] = [
  ['feed'],
  ['gamePosts'],
  ['userPosts'],
  ['bookmarks'],
  ['postSearch'],
  ['post'],
  ['comments'],
  ['userReplies'],
  ['conversations'],
  ['messages'],
  ['notifications'],
  ['people'],
  ['follows'],
  ['gamePlayers'],
];

/**
 * After the own avatar changed or was removed. The server deletes the old file, so a list still
 * holding its URL would draw a broken image: the lists on screen refetch now, the others when
 * they are shown again.
 */
export function invalidateAvatarLists(client: QueryClient): Promise<unknown> {
  return Promise.all(AVATAR_LISTS.map((queryKey) => client.invalidateQueries({ queryKey })));
}

/**
 * The Perfil tab stays mounted and does not refetch on focus, so changes the user makes
 * elsewhere must mark its queries stale. Does nothing when signed out; other users' keys are
 * never touched.
 */
export function invalidateOwnProfile(
  client: QueryClient,
  { entries, favorites = false }: { entries: boolean; favorites?: boolean },
): Promise<unknown> {
  const me = useSession.getState().user?.id;
  if (me === undefined) return Promise.resolve();
  const invalidations = [
    client.invalidateQueries({ queryKey: ['profile', me], exact: true }),
    client.invalidateQueries({ queryKey: ['userPosts', me] }),
  ];
  if (entries) {
    invalidations.push(client.invalidateQueries({ queryKey: ['userEntries', me], exact: true }));
  }
  if (favorites) {
    invalidations.push(client.invalidateQueries({ queryKey: ['userFavorites', me], exact: true }));
  }
  return Promise.all(invalidations);
}

/** The own Respostas tab, after the user wrote or deleted a comment. */
export function invalidateOwnReplies(client: QueryClient): Promise<unknown> {
  const me = useSession.getState().user?.id;
  if (me === undefined) return Promise.resolve();
  return client.invalidateQueries({ queryKey: ['userReplies', me], exact: true });
}

/** The own Curtidas tab, after the user liked or unliked a post. */
export function invalidateOwnLikes(client: QueryClient): Promise<unknown> {
  const me = useSession.getState().user?.id;
  if (me === undefined) return Promise.resolve();
  return client.invalidateQueries({ queryKey: ['userPosts', me, 'likes'], exact: true });
}
