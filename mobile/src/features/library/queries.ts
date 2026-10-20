import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { libraryApi } from './api';
import type { EntryDraft, GameEntry } from './types';

const LIBRARY_KEY = ['library'] as const;

/** The whole collection of the signed-in user. */
export function useLibrary() {
  return useQuery({ queryKey: LIBRARY_KEY, queryFn: () => libraryApi.listMine() });
}

export function useCreateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ igdbId, draft }: { igdbId: number; draft: EntryDraft }) =>
      libraryApi.create(igdbId, draft),
    onSuccess: () => client.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
}

export function useUpdateEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ original, edited }: { original: GameEntry; edited: EntryDraft }) =>
      libraryApi.update(original, edited),
    onSuccess: () => client.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
}

export function useDeleteEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => libraryApi.remove(entryId),
    onSuccess: () => client.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
}
