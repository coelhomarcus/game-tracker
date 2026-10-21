import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { invalidateOwnProfile } from '@/features/profiles/ownProfile';

import { libraryApi } from './api';
import type { EntryDraft, GameEntry } from './types';

const LIBRARY_KEY = ['library'] as const;

/**
 * A record change moves the per-game community counts, the playing list and the user's own
 * profile (collection, record count, activity) too.
 */
function invalidateAfterChange(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: LIBRARY_KEY }),
    client.invalidateQueries({ queryKey: ['gameStats'] }),
    client.invalidateQueries({ queryKey: ['gamePlayers'] }),
    invalidateOwnProfile(client, { entries: true }),
  ]);
}

/** The whole collection of the signed-in user. */
export function useLibrary() {
  return useQuery({ queryKey: LIBRARY_KEY, queryFn: () => libraryApi.listMine() });
}

export function useCreateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ igdbId, draft }: { igdbId: number; draft: EntryDraft }) =>
      libraryApi.create(igdbId, draft),
    onSuccess: () => invalidateAfterChange(client),
  });
}

export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ original, edited }: { original: GameEntry; edited: EntryDraft }) =>
      libraryApi.update(original, edited),
    onSuccess: () => invalidateAfterChange(client),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => libraryApi.remove(entryId),
    onSuccess: () => invalidateAfterChange(client),
  });
}
