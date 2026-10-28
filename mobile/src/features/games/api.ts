import { api } from '@/features/auth';
import type { GameStatus } from '@/theme/tokens';

import {
  parseGame,
  parseGamePlayer,
  parseGameStats,
  parseGameSummary,
  parseTrendingGame,
  type Game,
  type GamePlayer,
  type GameStats,
  type GameSummary,
  type TrendingGame,
} from './types';

export type PlayersScope = 'all' | 'following';

export const gamesApi = {
  async search(term: string, signal?: AbortSignal): Promise<GameSummary[]> {
    const json = await api.get<unknown[]>('/games/search', { query: { q: term }, signal });
    return json.map((item) => parseGameSummary(item as Record<string, unknown>));
  },

  /** The games with the most entries created or updated in the last 7 days (up to 20). */
  async trending(limit = 10): Promise<TrendingGame[]> {
    const json = await api.get<unknown[]>('/games/trending', { query: { limit } });
    return json.map((item) => parseTrendingGame(item as Record<string, unknown>));
  },

  async byIgdbId(igdbId: number): Promise<Game> {
    return parseGame(await api.get<Record<string, unknown>>(`/games/igdb/${igdbId}`));
  },

  async stats(gameId: string): Promise<GameStats> {
    return parseGameStats(await api.get<Record<string, unknown>>(`/games/${gameId}/stats`));
  },

  async players(
    gameId: string,
    opts: { status: GameStatus; scope: PlayersScope; limit: number },
  ): Promise<GamePlayer[]> {
    const json = await api.get<unknown[]>(`/games/${gameId}/players`, { query: opts });
    return json.map((item) => parseGamePlayer(item as Record<string, unknown>));
  },

  /** The games a user favorited; the endpoint returns plain game rows. */
  async favorites(userId: string): Promise<Game[]> {
    const json = await api.get<unknown[]>(`/users/${userId}/favorites`);
    return json.map((item) => parseGame(item as Record<string, unknown>));
  },

  async setFavorite(gameId: string, favorite: boolean): Promise<void> {
    if (favorite) await api.post<void>(`/games/${gameId}/favorite`);
    else await api.delete<void>(`/games/${gameId}/favorite`);
  },
};
