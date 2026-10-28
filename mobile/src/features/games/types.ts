import { parseStatus } from '@/features/library/status';
import type { GameStatus } from '@/theme/tokens';

export type GameSummary = {
  igdbId: number;
  name: string;
  coverUrl: string | null;
  platforms: string[];
  genres: string[];
};

/** One "Em alta" game: the search summary plus its local id, and the entries of the last 7 days. */
export type TrendingGame = {
  game: GameSummary & { id: string };
  entryCount: number;
};

export type Game = {
  id: string;
  igdbId: number;
  name: string;
  coverUrl: string | null;
  summary: string | null;
  screenshots: string[];
  platforms: string[];
  genres: string[];
  isFavoritedByMe: boolean;
};

/** Playthrough counts per status, not people: replays count more than once. */
export type GameStats = {
  backlog: number;
  playing: number;
  completed: number;
  dropped: number;
};

export type UserSummary = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type GamePlayer = {
  user: UserSummary;
  status: GameStatus;
  hoursPlayed: number | null;
};

// The API payloads are trusted for required fields; optional ones are read defensively.
type Json = Record<string, any>;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

/** `numeric` columns arrive as strings (`"20.0"`); numbers are accepted too. */
export function parseApiHours(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

export function parseGameSummary(json: Json): GameSummary {
  return {
    igdbId: json.igdbId,
    name: json.name,
    coverUrl: nullableString(json.coverUrl),
    platforms: strings(json.platforms),
    genres: strings(json.genres),
  };
}

export function parseTrendingGame(json: Json): TrendingGame {
  return {
    game: { id: json.game.id, ...parseGameSummary(json.game) },
    entryCount: count(json.entryCount),
  };
}

export function parseGame(json: Json): Game {
  return {
    id: json.id,
    igdbId: json.igdbId,
    name: json.name,
    coverUrl: nullableString(json.coverUrl),
    summary: nullableString(json.summary),
    screenshots: strings(json.screenshots),
    platforms: strings(json.platforms),
    genres: strings(json.genres),
    isFavoritedByMe: json.isFavoritedByMe === true,
  };
}

export function parseGameStats(json: Json): GameStats {
  return {
    backlog: count(json.backlog),
    playing: count(json.playing),
    completed: count(json.completed),
    dropped: count(json.dropped),
  };
}

export function parseUserSummary(json: Json): UserSummary {
  return {
    id: json.id,
    username: json.username,
    name: nullableString(json.name),
    avatarUrl: nullableString(json.avatarUrl),
  };
}

export function parseGamePlayer(json: Json): GamePlayer {
  return {
    user: parseUserSummary(json.user),
    status: parseStatus(String(json.status)),
    hoursPlayed: parseApiHours(json.hoursPlayed),
  };
}
