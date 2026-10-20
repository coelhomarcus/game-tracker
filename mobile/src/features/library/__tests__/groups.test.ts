import type { Game } from '@/features/games/types';
import type { GameStatus } from '@/theme/tokens';

import {
  bestRating,
  buildLibraryOverview,
  hasNotes,
  knownHours,
  newestAddedAt,
  oldestAddedAt,
  platformsOf,
  singleStatus,
  type LibraryFilterInput,
} from '../groups';
import type { LibrarySort } from '../prefsStore';
import type { GameEntry } from '../types';

function game(id: string, name: string): Game {
  return {
    id,
    igdbId: 1,
    name,
    coverUrl: null,
    summary: null,
    screenshots: [],
    platforms: [],
    genres: [],
    isFavoritedByMe: false,
  };
}

let nextId = 0;

function entry(overrides: Partial<Omit<GameEntry, 'game'>> & { game: Game }): GameEntry {
  nextId += 1;
  return {
    id: `e${String(nextId).padStart(3, '0')}`,
    platform: 'PC',
    status: 'backlog',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const NO_FILTER: LibraryFilterInput = { query: '', status: null, platformKey: null };

const zelda = game('g1', 'Zelda');
const mario = game('g2', 'Mario');
const onix = game('g3', 'Pokémon Ônix');

function day(n: number): Date {
  return new Date(Date.UTC(2026, 0, n));
}

function names(
  entries: GameEntry[],
  filter: LibraryFilterInput = NO_FILTER,
  sort: LibrarySort = 'name',
): string[] {
  return buildLibraryOverview(entries, filter, sort).groups.map((g) => g.game.name);
}

function firstGroup(entries: GameEntry[]) {
  return buildLibraryOverview(entries, NO_FILTER, 'name').groups[0]!;
}

describe('grouping', () => {
  it('turns two entries of one game into one group with totalEntries 2', () => {
    const a = entry({ game: zelda, createdAt: day(1) });
    const b = entry({ game: zelda, createdAt: day(2) });
    const overview = buildLibraryOverview([a, b], NO_FILTER, 'recent');
    expect(overview.groups).toHaveLength(1);
    expect(overview.groups[0]!.totalEntries).toBe(2);
    expect(overview.groups[0]!.entries).toHaveLength(2);
  });

  it('orders a group newest first, then by id descending', () => {
    const old = entry({ game: zelda, createdAt: day(1) });
    const newer = entry({ game: zelda, createdAt: day(3) });
    const tieA = entry({ game: zelda, createdAt: day(2), id: 'a' });
    const tieB = entry({ game: zelda, createdAt: day(2), id: 'b' });
    const overview = buildLibraryOverview([old, tieA, newer, tieB], NO_FILTER, 'recent');
    expect(overview.groups[0]!.entries.map((e) => e.id)).toEqual([newer.id, 'b', 'a', old.id]);
  });

  it('returns empty results for an empty library', () => {
    const overview = buildLibraryOverview([], NO_FILTER, 'recent');
    expect(overview.groups).toEqual([]);
    expect(overview.totalGames).toBe(0);
    expect(overview.platforms).toEqual([]);
    expect(overview.summary).toEqual({ games: 0, records: 0, playingGames: 0 });
    expect(overview.statusCounts).toEqual({ playing: 0, completed: 0, backlog: 0, dropped: 0 });
  });

  it('does not mutate the input array', () => {
    const entries = [
      entry({ game: zelda, createdAt: day(1) }),
      entry({ game: zelda, createdAt: day(2) }),
    ];
    const copy = [...entries];
    buildLibraryOverview(entries, NO_FILTER, 'recent');
    expect(entries).toEqual(copy);
  });
});

describe('summary', () => {
  it('counts all entries, ignoring every filter', () => {
    const entries = [
      entry({ game: zelda, status: 'playing' }),
      entry({ game: zelda, status: 'playing' }),
      entry({ game: mario, status: 'completed' }),
      entry({ game: onix, status: 'backlog' }),
    ];
    const overview = buildLibraryOverview(
      entries,
      { query: 'mario', status: 'completed', platformKey: 'ps5' },
      'name',
    );
    expect(overview.summary).toEqual({ games: 3, records: 4, playingGames: 1 });
  });
});

describe('search', () => {
  it('finds "Pokémon Ônix" with "pokemon onix"', () => {
    const entries = [entry({ game: onix }), entry({ game: mario })];
    expect(names(entries, { ...NO_FILTER, query: 'pokemon onix' })).toEqual(['Pokémon Ônix']);
  });

  it('matches a substring, ignoring case and surrounding spaces', () => {
    const entries = [entry({ game: onix }), entry({ game: mario })];
    expect(names(entries, { ...NO_FILTER, query: '  MAR ' })).toEqual(['Mario']);
  });

  it('drops games that do not match', () => {
    const overview = buildLibraryOverview(
      [entry({ game: zelda })],
      { ...NO_FILTER, query: 'xyz' },
      'name',
    );
    expect(overview.groups).toEqual([]);
    expect(overview.totalGames).toBe(0);
  });
});

describe('platform filter', () => {
  it('matches "PS5" and "ps5 " as the same platform', () => {
    const a = entry({ game: zelda, platform: 'PS5' });
    const b = entry({ game: mario, platform: 'ps5 ' });
    const c = entry({ game: onix, platform: 'PC' });
    expect(names([a, b, c], { ...NO_FILTER, platformKey: 'ps5' })).toEqual(['Mario', 'Zelda']);
  });

  it('keeps only the matching entries of a game but its full totalEntries', () => {
    const ps5 = entry({ game: zelda, platform: 'PS5' });
    const pc = entry({ game: zelda, platform: 'PC' });
    const overview = buildLibraryOverview([ps5, pc], { ...NO_FILTER, platformKey: 'ps5' }, 'name');
    expect(overview.groups[0]!.entries).toEqual([ps5]);
    expect(overview.groups[0]!.totalEntries).toBe(2);
  });
});

describe('status filter', () => {
  it('keeps the group with only the playing entry while totalEntries stays 2', () => {
    const playing = entry({ game: zelda, status: 'playing' });
    const completed = entry({ game: zelda, status: 'completed' });
    const overview = buildLibraryOverview(
      [playing, completed],
      { ...NO_FILTER, status: 'playing' },
      'name',
    );
    expect(overview.groups).toHaveLength(1);
    expect(overview.groups[0]!.entries).toEqual([playing]);
    expect(overview.groups[0]!.totalEntries).toBe(2);
  });

  it('removes groups left without entries', () => {
    const entries = [
      entry({ game: zelda, status: 'playing' }),
      entry({ game: mario, status: 'dropped' }),
    ];
    expect(names(entries, { ...NO_FILTER, status: 'dropped' })).toEqual(['Mario']);
  });
});

describe('statusCounts and totalGames', () => {
  const entries = [
    entry({ game: zelda, status: 'playing', platform: 'PS5' }),
    entry({ game: zelda, status: 'completed', platform: 'PS5' }),
    entry({ game: zelda, status: 'completed', platform: 'PS5' }),
    entry({ game: mario, status: 'backlog', platform: 'PS5' }),
    entry({ game: onix, status: 'playing', platform: 'PC' }),
  ];

  it('counts a game once per status it has', () => {
    const { statusCounts, totalGames } = buildLibraryOverview(entries, NO_FILTER, 'name');
    expect(statusCounts).toEqual({ playing: 2, completed: 1, backlog: 1, dropped: 0 });
    expect(totalGames).toBe(3);
  });

  it('is unaffected by the status filter', () => {
    const none = buildLibraryOverview(entries, NO_FILTER, 'name');
    const filtered = buildLibraryOverview(entries, { ...NO_FILTER, status: 'backlog' }, 'name');
    expect(filtered.statusCounts).toEqual(none.statusCounts);
    expect(filtered.totalGames).toBe(none.totalGames);
  });

  it('is computed after search and platform', () => {
    const overview = buildLibraryOverview(
      entries,
      { query: 'zel', status: null, platformKey: 'ps5' },
      'name',
    );
    expect(overview.statusCounts).toEqual({ playing: 1, completed: 1, backlog: 0, dropped: 0 });
    expect(overview.totalGames).toBe(1);
  });
});

describe('platforms', () => {
  it('lists each platform once, labelled by first spelling, sorted by key', () => {
    const entries = [
      entry({ game: zelda, platform: 'Switch' }),
      entry({ game: mario, platform: 'PS5' }),
      entry({ game: onix, platform: 'ps5 ' }),
      entry({ game: onix, platform: 'PC' }),
    ];
    expect(buildLibraryOverview(entries, NO_FILTER, 'name').platforms).toEqual([
      { key: 'pc', label: 'PC' },
      { key: 'ps5', label: 'PS5' },
      { key: 'switch', label: 'Switch' },
    ]);
  });

  it('is not narrowed by filters', () => {
    const entries = [
      entry({ game: zelda, platform: 'Switch' }),
      entry({ game: mario, platform: 'PC' }),
    ];
    const overview = buildLibraryOverview(entries, { ...NO_FILTER, query: 'zelda' }, 'name');
    expect(overview.platforms.map((p) => p.key)).toEqual(['pc', 'switch']);
  });
});

describe('sorting', () => {
  it('recent: newest added first', () => {
    const entries = [
      entry({ game: zelda, createdAt: day(1) }),
      entry({ game: mario, createdAt: day(3) }),
      entry({ game: onix, createdAt: day(2) }),
    ];
    expect(names(entries, NO_FILTER, 'recent')).toEqual(['Mario', 'Pokémon Ônix', 'Zelda']);
  });

  it('recent: uses the newest entry of the group', () => {
    const entries = [
      entry({ game: zelda, createdAt: day(1) }),
      entry({ game: zelda, createdAt: day(5) }),
      entry({ game: mario, createdAt: day(3) }),
    ];
    expect(names(entries, NO_FILTER, 'recent')).toEqual(['Zelda', 'Mario']);
  });

  it('oldest: oldest added first', () => {
    const entries = [
      entry({ game: zelda, createdAt: day(1) }),
      entry({ game: zelda, createdAt: day(5) }),
      entry({ game: mario, createdAt: day(3) }),
      entry({ game: onix, createdAt: day(2) }),
    ];
    expect(names(entries, NO_FILTER, 'oldest')).toEqual(['Zelda', 'Pokémon Ônix', 'Mario']);
  });

  it('mostPlayed: most known hours first, summing entries', () => {
    const entries = [
      entry({ game: zelda, hoursPlayed: 5 }),
      entry({ game: mario, hoursPlayed: 4 }),
      entry({ game: mario, hoursPlayed: 3 }),
      entry({ game: onix, hoursPlayed: 6 }),
    ];
    expect(names(entries, NO_FILTER, 'mostPlayed')).toEqual(['Mario', 'Pokémon Ônix', 'Zelda']);
  });

  it('mostPlayed: a game with 0 hours comes before one with no hours', () => {
    const entries = [
      entry({ game: mario, hoursPlayed: null }),
      entry({ game: zelda, hoursPlayed: 0 }),
      entry({ game: onix, hoursPlayed: 2 }),
    ];
    expect(names(entries, NO_FILTER, 'mostPlayed')).toEqual(['Pokémon Ônix', 'Zelda', 'Mario']);
  });

  it('rating: best rating first, unrated last', () => {
    const entries = [
      entry({ game: zelda, rating: null }),
      entry({ game: mario, rating: 3 }),
      entry({ game: mario, rating: 9 }),
      entry({ game: onix, rating: 7 }),
    ];
    expect(names(entries, NO_FILTER, 'rating')).toEqual(['Mario', 'Pokémon Ônix', 'Zelda']);
  });

  it('rating: a rating of 0 sorts before unrated', () => {
    const entries = [entry({ game: mario, rating: null }), entry({ game: zelda, rating: 0 })];
    expect(names(entries, NO_FILTER, 'rating')).toEqual(['Zelda', 'Mario']);
  });

  it('name: folded name A to Z', () => {
    const entries = [
      entry({ game: zelda }),
      entry({ game: mario }),
      entry({ game: game('g9', 'Ágata') }),
      entry({ game: onix }),
    ];
    expect(names(entries, NO_FILTER, 'name')).toEqual(['Ágata', 'Mario', 'Pokémon Ônix', 'Zelda']);
  });

  it('breaks ties by folded name, then game id', () => {
    const entries = [
      entry({ game: game('g-b', 'Twin'), hoursPlayed: 1 }),
      entry({ game: game('g-a', 'twin'), hoursPlayed: 1 }),
      entry({ game: game('g-z', 'Alpha'), hoursPlayed: 1 }),
    ];
    const ids = buildLibraryOverview(entries, NO_FILTER, 'mostPlayed').groups.map((g) => g.game.id);
    expect(ids).toEqual(['g-z', 'g-a', 'g-b']);
  });

  it('computes sort keys from the entries that passed the filters', () => {
    const entries = [
      entry({ game: zelda, status: 'playing', hoursPlayed: 1 }),
      entry({ game: zelda, status: 'completed', hoursPlayed: 100 }),
      entry({ game: mario, status: 'playing', hoursPlayed: 10 }),
    ];
    expect(names(entries, { ...NO_FILTER, status: 'playing' }, 'mostPlayed')).toEqual([
      'Mario',
      'Zelda',
    ]);
  });
});

describe('group helpers', () => {
  it('singleStatus is the shared status, or null with several', () => {
    const same = firstGroup([
      entry({ game: zelda, status: 'playing' }),
      entry({ game: zelda, status: 'playing' }),
    ]);
    const mixed = firstGroup([
      entry({ game: zelda, status: 'playing' }),
      entry({ game: zelda, status: 'completed' }),
    ]);
    const status: GameStatus | null = singleStatus(same);
    expect(status).toBe('playing');
    expect(singleStatus(mixed)).toBeNull();
  });

  it('knownHours sums known hours, treats 0 as known, and is null with none', () => {
    const summed = firstGroup([
      entry({ game: zelda, hoursPlayed: 1.5 }),
      entry({ game: zelda, hoursPlayed: null }),
      entry({ game: zelda, hoursPlayed: 2 }),
    ]);
    expect(knownHours(summed)).toBe(3.5);
    expect(knownHours(firstGroup([entry({ game: zelda, hoursPlayed: 0 })]))).toBe(0);
    expect(knownHours(firstGroup([entry({ game: zelda })]))).toBeNull();
  });

  it('bestRating is the highest rating, or null when unrated', () => {
    const rated = firstGroup([
      entry({ game: zelda, rating: 4 }),
      entry({ game: zelda, rating: 8 }),
      entry({ game: zelda }),
    ]);
    expect(bestRating(rated)).toBe(8);
    expect(bestRating(firstGroup([entry({ game: zelda, rating: 0 })]))).toBe(0);
    expect(bestRating(firstGroup([entry({ game: zelda })]))).toBeNull();
  });

  it('hasNotes is true when any entry has non-blank notes', () => {
    expect(hasNotes(firstGroup([entry({ game: zelda }), entry({ game: zelda, notes: 'boa' })]))).toBe(
      true,
    );
    expect(hasNotes(firstGroup([entry({ game: zelda, notes: '   ' })]))).toBe(false);
    expect(hasNotes(firstGroup([entry({ game: zelda })]))).toBe(false);
  });

  it('newestAddedAt and oldestAddedAt span the group entries', () => {
    const g = firstGroup([
      entry({ game: zelda, createdAt: day(2) }),
      entry({ game: zelda, createdAt: day(9) }),
      entry({ game: zelda, createdAt: day(4) }),
    ]);
    expect(newestAddedAt(g)).toEqual(day(9));
    expect(oldestAddedAt(g)).toEqual(day(2));
  });

  it('platformsOf lists distinct platforms by folded text in entry order', () => {
    const g = firstGroup([
      entry({ game: zelda, platform: 'PS5', createdAt: day(1) }),
      entry({ game: zelda, platform: 'Switch', createdAt: day(2) }),
      entry({ game: zelda, platform: 'ps5 ', createdAt: day(3) }),
    ]);
    // Entries run newest first: 'ps5 ', 'Switch', 'PS5'.
    expect(platformsOf(g)).toEqual(['ps5 ', 'Switch']);
  });
});
