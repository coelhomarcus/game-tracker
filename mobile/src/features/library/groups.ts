import type { Game } from '@/features/games/types';
import { foldText } from '@/lib/foldText';
import type { GameStatus } from '@/theme/tokens';

import type { LibrarySort } from './prefsStore';
import type { GameEntry } from './types';

const STATUSES: readonly GameStatus[] = ['playing', 'completed', 'backlog', 'dropped'];

/** Search, status and platform of the library. `platformKey` is already folded. */
export type LibraryFilterInput = {
  query: string;
  status: GameStatus | null;
  platformKey: string | null;
};

/** One game of the library with the entries that satisfy the filters. Replays are never merged. */
export type LibraryGroup = {
  game: Game;
  /** Entries that satisfy the filters, newest first. */
  entries: GameEntry[];
  /** Every entry of the game, filtered or not. */
  totalEntries: number;
};

export type LibraryOverview = {
  groups: LibraryGroup[];
  /** Distinct games per status after search and platform, before the chosen status. */
  statusCounts: Record<GameStatus, number>;
  /** Distinct games after search and platform, before the chosen status. */
  totalGames: number;
  /** Every platform in the library: folded key, label as first written, sorted by key. */
  platforms: { key: string; label: string }[];
  /** Unfiltered: distinct games, entries, and games with a `playing` entry. */
  summary: { games: number; records: number; playingGames: number };
};

/** The status shared by all entries of the group; `null` when there are several. */
export function singleStatus(group: LibraryGroup): GameStatus | null {
  const statuses = new Set(group.entries.map((e) => e.status));
  return statuses.size === 1 ? [...statuses][0]! : null;
}

/** Sum of the known hours; `null` when no entry has hours. Zero is a known value. */
export function knownHours(group: LibraryGroup): number | null {
  let sum: number | null = null;
  for (const e of group.entries) {
    if (e.hoursPlayed !== null) sum = (sum ?? 0) + e.hoursPlayed;
  }
  return sum;
}

export function bestRating(group: LibraryGroup): number | null {
  let best: number | null = null;
  for (const e of group.entries) {
    if (e.rating !== null && (best === null || e.rating > best)) best = e.rating;
  }
  return best;
}

export function hasNotes(group: LibraryGroup): boolean {
  return group.entries.some((e) => e.notes !== null && e.notes.trim() !== '');
}

export function newestAddedAt(group: LibraryGroup): Date {
  return group.entries.reduce(
    (best, e) => (e.createdAt.getTime() > best.getTime() ? e.createdAt : best),
    group.entries[0]!.createdAt,
  );
}

export function oldestAddedAt(group: LibraryGroup): Date {
  return group.entries.reduce(
    (best, e) => (e.createdAt.getTime() < best.getTime() ? e.createdAt : best),
    group.entries[0]!.createdAt,
  );
}

/** Distinct platforms (by folded text), in entry order. */
export function platformsOf(group: LibraryGroup): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of group.entries) {
    if (!seen.has(foldText(e.platform))) {
      seen.add(foldText(e.platform));
      result.push(e.platform);
    }
  }
  return result;
}

/** Code-unit comparison, so the order never depends on the device locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareNewestFirst(a: GameEntry, b: GameEntry): number {
  const byDate = b.createdAt.getTime() - a.createdAt.getTime();
  return byDate !== 0 ? byDate : compareText(b.id, a.id);
}

function compareByTitle(a: LibraryGroup, b: LibraryGroup): number {
  const byName = compareText(foldText(a.game.name), foldText(b.game.name));
  return byName !== 0 ? byName : compareText(a.game.id, b.game.id);
}

/** Highest first; a missing value goes last, after zero. */
function compareDescendingNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

/** Sort keys come from the entries that passed the filters. Ties: title, then game id. */
function compareGroups(sort: LibrarySort, a: LibraryGroup, b: LibraryGroup): number {
  let primary: number;
  switch (sort) {
    case 'recent':
      primary = newestAddedAt(b).getTime() - newestAddedAt(a).getTime();
      break;
    case 'oldest':
      primary = oldestAddedAt(a).getTime() - oldestAddedAt(b).getTime();
      break;
    case 'mostPlayed':
      primary = compareDescendingNullsLast(knownHours(a), knownHours(b));
      break;
    case 'rating':
      primary = compareDescendingNullsLast(bestRating(a), bestRating(b));
      break;
    case 'name':
      primary = compareText(foldText(a.game.name), foldText(b.game.name));
      break;
  }
  return primary !== 0 ? primary : compareByTitle(a, b);
}

export function buildLibraryOverview(
  entries: GameEntry[],
  filter: LibraryFilterInput,
  sort: LibrarySort,
): LibraryOverview {
  // Every entry of each game, newest first.
  const byGame = new Map<string, GameEntry[]>();
  for (const e of entries) {
    const list = byGame.get(e.game.id);
    if (list) list.push(e);
    else byGame.set(e.game.id, [e]);
  }
  for (const list of byGame.values()) list.sort(compareNewestFirst);

  const platformLabels = new Map<string, string>();
  for (const e of entries) {
    const key = foldText(e.platform);
    if (!platformLabels.has(key)) platformLabels.set(key, e.platform);
  }
  const platforms = [...platformLabels]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => compareText(a.key, b.key));

  let playingGames = 0;
  for (const list of byGame.values()) {
    if (list.some((e) => e.status === 'playing')) playingGames += 1;
  }

  // Search and platform first; the status only narrows the result, so the status counts
  // show what each status would bring.
  const query = foldText(filter.query);
  const base: { gameId: string; entries: GameEntry[] }[] = [];
  for (const [gameId, list] of byGame) {
    if (query !== '' && !foldText(list[0]!.game.name).includes(query)) continue;
    const kept =
      filter.platformKey === null
        ? list
        : list.filter((e) => foldText(e.platform) === filter.platformKey);
    if (kept.length > 0) base.push({ gameId, entries: kept });
  }

  const statusCounts: Record<GameStatus, number> = {
    playing: 0,
    completed: 0,
    backlog: 0,
    dropped: 0,
  };
  for (const { entries: kept } of base) {
    const present = new Set(kept.map((e) => e.status));
    for (const status of STATUSES) {
      if (present.has(status)) statusCounts[status] += 1;
    }
  }

  const groups: LibraryGroup[] = [];
  for (const { gameId, entries: kept } of base) {
    const shown = filter.status === null ? kept : kept.filter((e) => e.status === filter.status);
    if (shown.length === 0) continue;
    groups.push({
      game: shown[0]!.game,
      entries: shown,
      totalEntries: byGame.get(gameId)!.length,
    });
  }
  groups.sort((a, b) => compareGroups(sort, a, b));

  return {
    groups,
    statusCounts,
    totalGames: base.length,
    platforms,
    summary: { games: byGame.size, records: entries.length, playingGames },
  };
}
