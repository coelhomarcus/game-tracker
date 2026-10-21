import type { QueryClient } from '@tanstack/react-query';

import { useSession } from '@/features/auth';

/**
 * The Perfil tab stays mounted and does not refetch on focus, so changes the user makes
 * elsewhere must mark its queries stale. Does nothing when signed out; other users' keys are
 * never touched.
 */
export function invalidateOwnProfile(
  client: QueryClient,
  { entries }: { entries: boolean },
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
  return Promise.all(invalidations);
}
