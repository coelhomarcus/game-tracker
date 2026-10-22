// Requires the synthetic games 900001/900002 (`npm run test:seed` in backend/): IGDB is not
// reachable from the test environment.
import { gamesApi } from '@/features/games/api';
import { libraryApi } from '@/features/library/api';
import type { EntryDraft, GameEntry } from '@/features/library/types';
import { ApiError } from '@/lib/http/errors';

import {
  apiErrorOf,
  describeBackend,
  FIXTURE_GAME_ONE,
  FIXTURE_GAME_TWO,
  signUpFresh,
  type SignedInUser,
} from './backend';

function draft(fields: Partial<EntryDraft> & Pick<EntryDraft, 'status'>): EntryDraft {
  return {
    platform: 'PC',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    ...fields,
  };
}

/** The form values of an existing entry, as the edit form starts from them. */
function draftOf(entry: GameEntry, changes: Partial<EntryDraft> = {}): EntryDraft {
  const { platform, status, startedAt, finishedAt, hoursPlayed, rating, notes } = entry;
  return { platform, status, startedAt, finishedAt, hoursPlayed, rating, notes, ...changes };
}

describeBackend('library and games against the test API', () => {
  let me: SignedInUser;

  beforeEach(async () => {
    me = await signUpFresh('lib');
  });

  it('game by igdbId: internal UUID distinct from the igdbId, not favorited', async () => {
    const game = await gamesApi.byIgdbId(FIXTURE_GAME_ONE);

    expect(game.igdbId).toBe(FIXTURE_GAME_ONE);
    expect(game.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(game.platforms.length).toBeGreaterThan(0);
    expect(game.isFavoritedByMe).toBe(false);
  });

  it('missing IGDB game: a domain error, not a crash', async () => {
    // `not_found` with IGDB credentials, `igdb_not_configured` without: an envelope either way.
    const error = await apiErrorOf(gamesApi.byIgdbId(999999999));
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBeGreaterThanOrEqual(400);
  });

  it('search: real results with IGDB; without credentials, a distinct error (never an empty list)', async () => {
    let results: Awaited<ReturnType<typeof gamesApi.search>> | null = null;
    let failure: ApiError | null = null;
    try {
      results = await gamesApi.search('zelda');
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      failure = error;
    }

    if (results) {
      // An environment with IGDB configured.
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((g) => g.igdbId > 0 && g.name.length > 0)).toBe(true);
      expect(Array.isArray(results[0].platforms)).toBe(true);
    } else {
      // Without credentials the failure must be told apart from "no results".
      expect(failure).toMatchObject({ status: 503, code: 'igdb_not_configured' });
      expect(failure?.message).toContain('não foi configurada');
    }
  });

  it('two playthroughs of the same game: create, edit, clear fields and remove one', async () => {
    const first = await libraryApi.create(
      FIXTURE_GAME_ONE,
      draft({
        status: 'completed',
        startedAt: { year: 2026, month: 1, day: 5 },
        finishedAt: { year: 2026, month: 1, day: 20 },
        hoursPlayed: 12.5,
        rating: 9,
        notes: 'Primeira vez',
      }),
    );
    expect(first.hoursPlayed).toBe(12.5);
    expect(first.rating).toBe(9);
    expect(first.notes).toBe('Primeira vez');
    // Calendar days, without a time zone shift.
    expect(first.startedAt).toEqual({ year: 2026, month: 1, day: 5 });
    expect(first.finishedAt).toEqual({ year: 2026, month: 1, day: 20 });

    const second = await libraryApi.create(FIXTURE_GAME_ONE, draft({ status: 'backlog' }));
    expect(second.id).not.toBe(first.id);
    expect(second.game.id).toBe(first.game.id);

    const started = await libraryApi.update(second, draftOf(second, { status: 'playing' }));
    expect(started.status).toBe('playing');

    // Clearing every optional field: no value in the form becomes null on the server.
    const cleared = await libraryApi.update(
      first,
      draft({ status: 'completed', notes: 'Primeira vez' }),
    );
    expect(cleared.hoursPlayed).toBeNull();
    expect(cleared.rating).toBeNull();
    expect(cleared.startedAt).toBeNull();
    expect(cleared.finishedAt).toBeNull();
    // A field that did not change is kept.
    expect(cleared.notes).toBe('Primeira vez');

    // The whole collection agrees, not only the PATCH response.
    const reloaded = (await libraryApi.listMine()).find((e) => e.id === first.id);
    expect(reloaded).toMatchObject({
      hoursPlayed: null,
      rating: null,
      startedAt: null,
      finishedAt: null,
    });

    await libraryApi.remove(first.id);
    const left = await libraryApi.listMine();
    // The other playthrough is still there.
    expect(left.map((e) => e.id)).toEqual([second.id]);
    expect(left[0].status).toBe('playing');
  });

  it('zero hours is saved and read as zero, unlike missing hours', async () => {
    const entry = await libraryApi.create(
      FIXTURE_GAME_TWO,
      draft({ status: 'playing', hoursPlayed: 0 }),
    );
    expect(entry.hoursPlayed).toBe(0);

    const bumped = await libraryApi.update(entry, draftOf(entry, { hoursPlayed: 7.5 }));
    expect(bumped.hoursPlayed).toBe(7.5);
    const zeroAgain = await libraryApi.update(bumped, draftOf(bumped, { hoursPlayed: 0 }));
    // Changing to zero is not clearing.
    expect(zeroAgain.hoursPlayed).toBe(0);
  });

  it('editing without changes makes no request and returns the same entry', async () => {
    const entry = await libraryApi.create(
      FIXTURE_GAME_ONE,
      draft({ status: 'backlog', rating: 6 }),
    );
    const same = await libraryApi.update(entry, draftOf(entry));
    expect(same).toBe(entry);
  });

  it('favorite and unfavorite are idempotent and update the game', async () => {
    const game = await gamesApi.byIgdbId(FIXTURE_GAME_ONE);
    await gamesApi.setFavorite(game.id, true);
    await gamesApi.setFavorite(game.id, true);
    expect((await gamesApi.byIgdbId(FIXTURE_GAME_ONE)).isFavoritedByMe).toBe(true);
    expect((await gamesApi.favorites(me.user.id)).map((g) => g.id)).toEqual([game.id]);

    await gamesApi.setFavorite(game.id, false);
    await gamesApi.setFavorite(game.id, false);
    expect((await gamesApi.byIgdbId(FIXTURE_GAME_ONE)).isFavoritedByMe).toBe(false);
  });

  it('statistics and players count my playthrough', async () => {
    const game = await gamesApi.byIgdbId(FIXTURE_GAME_TWO);
    const before = await gamesApi.stats(game.id);
    await libraryApi.create(FIXTURE_GAME_TWO, draft({ status: 'playing', hoursPlayed: 3.5 }));
    const after = await gamesApi.stats(game.id);
    expect(after.playing).toBe(before.playing + 1);

    const players = await gamesApi.players(game.id, { status: 'playing', scope: 'all', limit: 20 });
    expect(players.some((p) => p.user.id === me.user.id && p.hoursPlayed === 3.5)).toBe(true);
    const following = await gamesApi.players(game.id, {
      status: 'playing',
      scope: 'following',
      limit: 20,
    });
    // I follow nobody.
    expect(following).toEqual([]);
  });

  it("another user's entry cannot be edited or removed", async () => {
    const mine = await libraryApi.create(FIXTURE_GAME_ONE, draft({ status: 'backlog' }));
    await signUpFresh('lib'); // another account

    expect(
      await apiErrorOf(libraryApi.update(mine, draftOf(mine, { hoursPlayed: 1 }))),
    ).toMatchObject({ status: 404, code: 'not_found' });
    expect(await apiErrorOf(libraryApi.remove(mine.id))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });
});
