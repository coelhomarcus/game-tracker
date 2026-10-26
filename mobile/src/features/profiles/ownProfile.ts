import type { QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';

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
