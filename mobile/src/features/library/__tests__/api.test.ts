/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { createBody, libraryApi, updateBody } from '../api';
import { STATUSES, parseStatus, statusIcon, statusLabel } from '../status';
import { parseEntry, type EntryDraft, type GameEntry } from '../types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const gameJson = { id: 'g1', igdbId: 1942, name: 'Hades' };

const entryJson = {
  id: 'e1',
  platform: 'PC',
  status: 'playing',
  startedAt: '2026-03-05',
  finishedAt: null,
  hoursPlayed: '20.0',
  rating: 8,
  createdAt: '2026-03-06T10:00:00.000Z',
  game: gameJson,
};

function entry(): GameEntry {
  return parseEntry(entryJson);
}

function draftOf(e: GameEntry): EntryDraft {
  return {
    platform: e.platform,
    status: e.status,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    hoursPlayed: e.hoursPlayed,
    rating: e.rating,
    notes: e.notes,
  };
}

describe('status', () => {
  it('lists statuses in display order with labels and icons', () => {
    expect(STATUSES).toEqual(['playing', 'completed', 'backlog', 'dropped']);
    expect(statusLabel).toEqual({
      backlog: 'Na fila',
      playing: 'Jogando',
      completed: 'Concluído',
      dropped: 'Abandonado',
    });
    expect(statusIcon).toEqual({
      backlog: 'bookmark-outline',
      playing: 'play-circle-outline',
      completed: 'checkmark-circle-outline',
      dropped: 'close-circle-outline',
    });
  });

  it('parseStatus falls back to backlog', () => {
    expect(parseStatus('completed')).toBe('completed');
    expect(parseStatus('mystery')).toBe('backlog');
  });
});

describe('parseEntry', () => {
  it('parses string hours, dates and missing notes', () => {
    const e = entry();

    expect(e.hoursPlayed).toBe(20);
    expect(e.startedAt).toEqual({ year: 2026, month: 3, day: 5 });
    expect(e.finishedAt).toBeNull();
    expect(e.notes).toBeNull();
    expect(e.rating).toBe(8);
    expect(e.createdAt).toEqual(new Date('2026-03-06T10:00:00.000Z'));
    expect(e.game.name).toBe('Hades');
    expect(e.game.screenshots).toEqual([]);
  });

  it('accepts timestamp dates and numeric hours', () => {
    const e = parseEntry({
      ...entryJson,
      startedAt: '2026-03-05T00:00:00.000Z',
      hoursPlayed: 4.5,
    });

    expect(e.startedAt).toEqual({ year: 2026, month: 3, day: 5 });
    expect(e.hoursPlayed).toBe(4.5);
  });
});

describe('createBody', () => {
  it('omits null fields and blank notes', () => {
    expect(
      createBody(1942, {
        platform: 'PC',
        status: 'backlog',
        startedAt: null,
        finishedAt: null,
        hoursPlayed: null,
        rating: null,
        notes: '   ',
      }),
    ).toEqual({ igdbId: 1942, platform: 'PC', status: 'backlog' });
  });

  it('includes set fields, trims notes and formats dates', () => {
    expect(
      createBody(1942, {
        platform: 'PC',
        status: 'completed',
        startedAt: { year: 2026, month: 3, day: 5 },
        finishedAt: { year: 2026, month: 4, day: 1 },
        hoursPlayed: 12.5,
        rating: 9,
        notes: '  ótimo  ',
      }),
    ).toEqual({
      igdbId: 1942,
      platform: 'PC',
      status: 'completed',
      startedAt: '2026-03-05',
      finishedAt: '2026-04-01',
      hoursPlayed: 12.5,
      rating: 9,
      notes: 'ótimo',
    });
  });
});

describe('updateBody', () => {
  it('is empty when nothing changed', () => {
    const e = entry();
    expect(updateBody(e, draftOf(e))).toEqual({});
  });

  it('sends only the changed rating', () => {
    const e = entry();
    expect(updateBody(e, { ...draftOf(e), rating: 9 })).toEqual({ rating: 9 });
  });

  it('sends null for a cleared field', () => {
    const e = entry();
    expect(updateBody(e, { ...draftOf(e), hoursPlayed: null })).toEqual({ hoursPlayed: null });
    expect(updateBody(e, { ...draftOf(e), startedAt: null })).toEqual({ startedAt: null });
  });

  it('sends a newly set date as YYYY-MM-DD', () => {
    const e = entry();
    expect(
      updateBody(e, { ...draftOf(e), finishedAt: { year: 2026, month: 3, day: 5 } }),
    ).toEqual({ finishedAt: '2026-03-05' });
  });

  it('compares equal dates by value', () => {
    const e = entry();
    expect(updateBody(e, { ...draftOf(e), startedAt: { year: 2026, month: 3, day: 5 } })).toEqual(
      {},
    );
  });

  it('sends changed platform and status', () => {
    const e = entry();
    expect(updateBody(e, { ...draftOf(e), platform: 'PS5', status: 'completed' })).toEqual({
      platform: 'PS5',
      status: 'completed',
    });
  });

  it('compares notes trimmed with blank equal to null', () => {
    const withNotes = parseEntry({ ...entryJson, notes: 'bom' });
    expect(updateBody(withNotes, { ...draftOf(withNotes), notes: '  bom ' })).toEqual({});
    expect(updateBody(withNotes, { ...draftOf(withNotes), notes: '   ' })).toEqual({
      notes: null,
    });
    expect(updateBody(withNotes, { ...draftOf(withNotes), notes: ' novo ' })).toEqual({
      notes: 'novo',
    });

    const e = entry();
    expect(updateBody(e, { ...draftOf(e), notes: '  ' })).toEqual({});
  });
});

describe('libraryApi', () => {
  it('listMine requests recent sort and parses entries', async () => {
    let sort: string | null = null;
    server.use(
      http.get(`${apiBaseUrl}/game-entries/me`, ({ request }) => {
        sort = new URL(request.url).searchParams.get('sort');
        return HttpResponse.json([entryJson]);
      }),
    );

    const result = await libraryApi.listMine();

    expect(sort).toBe('recent');
    expect(result).toHaveLength(1);
    expect(result[0]?.hoursPlayed).toBe(20);
  });

  it('create posts the body and parses the entry', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/game-entries`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(entryJson, { status: 201 });
      }),
    );

    const created = await libraryApi.create(1942, {
      platform: 'PC',
      status: 'playing',
      startedAt: null,
      finishedAt: null,
      hoursPlayed: null,
      rating: null,
      notes: null,
    });

    expect(body).toEqual({ igdbId: 1942, platform: 'PC', status: 'playing' });
    expect(created.id).toBe('e1');
  });

  it('update patches only the changed fields', async () => {
    let body: unknown;
    server.use(
      http.patch(`${apiBaseUrl}/game-entries/e1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...entryJson, rating: 9 });
      }),
    );
    const e = entry();

    const updated = await libraryApi.update(e, { ...draftOf(e), rating: 9 });

    expect(body).toEqual({ rating: 9 });
    expect(updated.rating).toBe(9);
  });

  it('update with an unchanged draft makes no request and resolves to the original', async () => {
    let calls = 0;
    server.use(
      http.patch(`${apiBaseUrl}/game-entries/e1`, () => {
        calls += 1;
        return HttpResponse.json(entryJson);
      }),
    );
    const e = entry();

    const result = await libraryApi.update(e, draftOf(e));

    expect(calls).toBe(0);
    expect(result).toBe(e);
  });

  it('remove sends DELETE', async () => {
    let deleted = false;
    server.use(
      http.delete(`${apiBaseUrl}/game-entries/e1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await libraryApi.remove('e1');

    expect(deleted).toBe(true);
  });
});
