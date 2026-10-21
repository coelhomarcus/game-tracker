import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { gamesApi, type PlayersScope } from './api';
import type { Game } from './types';

const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_MIN_LENGTH = 2;
const PLAYERS_LIMIT = 10;

export function useGame(igdbId: number) {
  return useQuery({ queryKey: ['game', igdbId], queryFn: () => gamesApi.byIgdbId(igdbId) });
}

export function useGameStats(gameId?: string) {
  return useQuery({
    queryKey: ['gameStats', gameId],
    queryFn: () => gamesApi.stats(gameId as string),
    enabled: gameId !== undefined,
  });
}

/** People currently playing the game, from everyone or only from the people the user follows. */
export function useGamePlayers(gameId: string | undefined, scope: PlayersScope) {
  return useQuery({
    queryKey: ['gamePlayers', gameId, scope],
    queryFn: () =>
      gamesApi.players(gameId as string, { status: 'playing', scope, limit: PLAYERS_LIMIT }),
    enabled: gameId !== undefined,
  });
}

export function useGameSearch(term: string) {
  const debounced = useDebouncedValue(term.trim(), SEARCH_DEBOUNCE_MS);
  return useQuery({
    queryKey: ['gameSearch', debounced],
    queryFn: ({ signal }) => gamesApi.search(debounced, signal),
    enabled: debounced.length >= SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
  });
}

/** Flips `isFavoritedByMe` right away and restores it if the request fails. */
export function useToggleFavorite(igdbId: number) {
  const client = useQueryClient();
  const key = ['game', igdbId];

  return useMutation({
    mutationFn: ({ gameId, favorite }: { gameId: string; favorite: boolean }) =>
      gamesApi.setFavorite(gameId, favorite),
    onMutate: async ({ favorite }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Game>(key);
      client.setQueryData<Game>(key, (game) =>
        game ? { ...game, isFavoritedByMe: favorite } : game,
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    // The library footer heart reads `entry.game.isFavoritedByMe`, so the library is refreshed too.
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: key }),
        client.invalidateQueries({ queryKey: ['library'] }),
      ]),
  });
}
