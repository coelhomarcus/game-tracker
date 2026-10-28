/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { gamesApi } from '../api';
import {
  parseGame,
  parseGamePlayer,
  parseGameStats,
  parseGameSummary,
  parseTrendingGame,
} from '../types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const gameJson = {
  id: 'g1',
  igdbId: 1942,
  name: 'Hades',
  coverUrl: 'https://img/hades.jpg',
  summary: 'Escape.',
  screenshots: ['https://img/s1.jpg'],
  platforms: ['PC'],
  genres: ['Roguelike'],
  isFavoritedByMe: true,
};

describe('parsers', () => {
  it('parseGame defaults missing arrays, booleans and nullables', () => {
    expect(parseGame({ id: 'g1', igdbId: 7, name: 'X' })).toEqual({
      id: 'g1',
      igdbId: 7,
      name: 'X',
      coverUrl: null,
      summary: null,
      screenshots: [],
      platforms: [],
      genres: [],
      isFavoritedByMe: false,
    });
  });

  it('parseGameSummary defaults missing arrays', () => {
    expect(parseGameSummary({ igdbId: 7, name: 'X', coverUrl: null })).toEqual({
      igdbId: 7,
      name: 'X',
      coverUrl: null,
      platforms: [],
      genres: [],
    });
  });

  it('parseGameStats defaults missing counts to 0', () => {
    expect(parseGameStats({ playing: 3 })).toEqual({
      backlog: 0,
      playing: 3,
      completed: 0,
      dropped: 0,
    });
  });

  it('parseGamePlayer parses string hours and a defensive user', () => {
    expect(
      parseGamePlayer({
        user: { id: 'u1', username: 'ana' },
        status: 'completed',
        hoursPlayed: '12.5',
      }),
    ).toEqual({
      user: { id: 'u1', username: 'ana', name: null, avatarUrl: null },
      status: 'completed',
      hoursPlayed: 12.5,
    });
    expect(parseGamePlayer({ user: { id: 'u1', username: 'ana' }, status: 'weird' })).toMatchObject(
      { status: 'backlog', hoursPlayed: null },
    );
  });
});

describe('parseTrendingGame', () => {
  it('keeps the local id with the summary and the entry count', () => {
    expect(parseTrendingGame({ game: gameJson, entryCount: 12 })).toEqual({
      game: {
        id: 'g1',
        igdbId: 1942,
        name: 'Hades',
        coverUrl: 'https://img/hades.jpg',
        platforms: ['PC'],
        genres: ['Roguelike'],
      },
      entryCount: 12,
    });
  });

  it('defaults a missing count to 0 and missing arrays and cover', () => {
    expect(parseTrendingGame({ game: { id: 'g2', igdbId: 2, name: 'Y' } })).toEqual({
      game: { id: 'g2', igdbId: 2, name: 'Y', coverUrl: null, platforms: [], genres: [] },
      entryCount: 0,
    });
  });
});

describe('gamesApi.trending', () => {
  it('sends the limit (10 by default) and parses each game', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/games/trending`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json([
          { game: gameJson, entryCount: 5 },
          { game: { ...gameJson, id: 'g2', igdbId: 2, name: 'Celeste' }, entryCount: 3 },
        ]);
      }),
    );

    const games = await gamesApi.trending();
    await gamesApi.trending(20);

    expect(games.map((item) => [item.game.id, item.game.igdbId, item.game.name, item.entryCount])).toEqual([
      ['g1', 1942, 'Hades', 5],
      ['g2', 2, 'Celeste', 3],
    ]);
    expect(seen.map((params) => params.get('limit'))).toEqual(['10', '20']);
  });
});

describe('gamesApi', () => {
  it('search sends GET /games/search?q=', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${apiBaseUrl}/games/search`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ igdbId: 1942, name: 'Hades' }]);
      }),
    );

    const result = await gamesApi.search('hades');

    expect(new URL(seenUrl).searchParams.get('q')).toBe('hades');
    expect(result).toEqual([
      { igdbId: 1942, name: 'Hades', coverUrl: null, platforms: [], genres: [] },
    ]);
  });

  it('byIgdbId parses the game', async () => {
    server.use(http.get(`${apiBaseUrl}/games/igdb/1942`, () => HttpResponse.json(gameJson)));

    await expect(gamesApi.byIgdbId(1942)).resolves.toEqual(gameJson);
  });

  it('stats parses counts', async () => {
    server.use(
      http.get(`${apiBaseUrl}/games/g1/stats`, () =>
        HttpResponse.json({ backlog: 1, playing: 2, completed: 3, dropped: 4 }),
      ),
    );

    await expect(gamesApi.stats('g1')).resolves.toEqual({
      backlog: 1,
      playing: 2,
      completed: 3,
      dropped: 4,
    });
  });

  it('players sends status, scope and limit', async () => {
    let params: URLSearchParams | undefined;
    server.use(
      http.get(`${apiBaseUrl}/games/g1/players`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([
          {
            user: { id: 'u1', username: 'ana', name: 'Ana', avatarUrl: null },
            status: 'playing',
            hoursPlayed: '3.0',
          },
        ]);
      }),
    );

    const result = await gamesApi.players('g1', {
      status: 'playing',
      scope: 'following',
      limit: 20,
    });

    expect(params?.get('status')).toBe('playing');
    expect(params?.get('scope')).toBe('following');
    expect(params?.get('limit')).toBe('20');
    expect(result).toEqual([
      {
        user: { id: 'u1', username: 'ana', name: 'Ana', avatarUrl: null },
        status: 'playing',
        hoursPlayed: 3,
      },
    ]);
  });

  it('favorites sends GET /users/:id/favorites and parses the game rows', async () => {
    server.use(
      http.get(`${apiBaseUrl}/users/u1/favorites`, () =>
        HttpResponse.json([{ id: 'g1', igdbId: 1942, name: 'Hades' }]),
      ),
    );

    await expect(gamesApi.favorites('u1')).resolves.toEqual([
      {
        id: 'g1',
        igdbId: 1942,
        name: 'Hades',
        coverUrl: null,
        summary: null,
        screenshots: [],
        platforms: [],
        genres: [],
        isFavoritedByMe: false,
      },
    ]);
  });

  it('setFavorite sends POST to favorite and DELETE to unfavorite', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/games/g1/favorite`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/games/g1/favorite`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await gamesApi.setFavorite('g1', true);
    await gamesApi.setFavorite('g1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });
});
