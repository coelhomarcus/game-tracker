import { parseGame, parseApiHours, type Game } from '@/features/games/types';
import { parseApiDate, type DateOnly } from '@/lib/dateOnly';
import type { GameStatus } from '@/theme/tokens';

import { parseStatus } from './status';

/** One playthrough. Keyed by `id`, never by game: the same game can have several entries. */
export type GameEntry = {
  id: string;
  platform: string;
  status: GameStatus;
  startedAt: DateOnly | null;
  finishedAt: DateOnly | null;
  hoursPlayed: number | null;
  rating: number | null;
  notes: string | null;
  /** An instant, not a calendar date. */
  createdAt: Date;
  game: Game;
};

/** Form values of an entry; `null` means "no value". */
export type EntryDraft = {
  platform: string;
  status: GameStatus;
  startedAt: DateOnly | null;
  finishedAt: DateOnly | null;
  hoursPlayed: number | null;
  rating: number | null;
  notes: string | null;
};

function optionalDate(value: unknown): DateOnly | null {
  return typeof value === 'string' ? parseApiDate(value) : null;
}

export function parseEntry(json: Record<string, any>): GameEntry {
  return {
    id: json.id,
    platform: json.platform,
    status: parseStatus(String(json.status)),
    startedAt: optionalDate(json.startedAt),
    finishedAt: optionalDate(json.finishedAt),
    hoursPlayed: parseApiHours(json.hoursPlayed),
    rating: typeof json.rating === 'number' ? json.rating : null,
    notes: typeof json.notes === 'string' ? json.notes : null,
    createdAt: new Date(json.createdAt),
    game: parseGame(json.game),
  };
}
