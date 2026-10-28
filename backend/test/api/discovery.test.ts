// Descoberta do Explorar: GET /games/trending (jogos com mais registros na semana) e
// GET /users/suggestions (quem seguir), sempre sem quem tem bloqueio com quem vê nem silenciados.
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { count } from 'drizzle-orm';
import { db } from '../../src/db';
import { gameEntries, games, posts, users } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;

before(async () => {
  api = await startApi();
});
after(() => api.close());

async function ok(method: string, path: string, user: TestUser | null, body?: unknown): Promise<any> {
  const res = await api.http(method, path, user?.accessToken ?? null, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

describe('GET /games/trending', () => {
  let viewer: TestUser;
  let other: TestUser;
  let players: TestUser[];
  let blocker: TestUser;
  let muted: TestUser;
  const game: Record<string, { id: string; igdbId: number }> = {};

  async function createGame(key: string) {
    const igdbId = 7_000_000 + randomInt(1_000_000_000);
    const [row] = await db
      .insert(games)
      .values({ igdbId, name: `Em alta ${key}`, coverUrl: `http://example.test/${key}.jpg`, summary: 'Sinopse.', platforms: ['PC'], genres: ['RPG'] })
      .returning({ id: games.id, igdbId: games.igdbId });
    game[key] = row!;
  }

  /** `n` registros do jogo, repartidos entre `owners`, criados em `at`. Devolve os ids. */
  async function entries(key: string, n: number, at: Date, owners: TestUser[] = players) {
    const rows = await db
      .insert(gameEntries)
      .values(
        Array.from({ length: n }, (_, i) => ({
          userId: owners[i % owners.length]!.user.id,
          gameId: game[key]!.id,
          platform: 'PC',
          status: 'playing' as const,
          createdAt: at,
        })),
      )
      .returning({ id: gameEntries.id, userId: gameEntries.userId });
    return rows;
  }

  const trending = async (user: TestUser, query = '?limit=20') => (await ok('GET', `/games/trending${query}`, user)) as Json[];
  /** Só os jogos deste teste, na ordem da resposta. */
  const mine = (items: Json[]) => {
    const keys = new Map(Object.entries(game).map(([key, value]) => [value.id, key]));
    return items.filter((item) => keys.has(item.game.id)).map((item) => `${keys.get(item.game.id)}:${item.entryCount}`);
  };

  before(async () => {
    viewer = await registerUser(api.http, 'trv');
    other = await registerUser(api.http, 'tro');
    players = [await registerUser(api.http, 'trp1'), await registerUser(api.http, 'trp2'), await registerUser(api.http, 'trp3')];
    blocker = await registerUser(api.http, 'trb');
    muted = await registerUser(api.http, 'trm');
    for (const key of ['top', 'recentTie', 'olderTie', 'updated', 'stale', 'blocked', 'muted']) await createGame(key);

    // Muitos registros, para ficarem à frente do que os outros testes criaram nesta semana.
    await entries('top', 40, ago(60_000));
    await entries('recentTie', 30, ago(60_000));
    await entries('olderTie', 30, ago(2 * DAY));
    // Registros antigos que foram atualizados nesta semana (o post de atividade da mudança de
    // status); dois posts no mesmo registro contam uma vez só.
    const old = await entries('updated', 25, ago(10 * DAY));
    await db.insert(posts).values(
      old.flatMap((entry) => [
        { userId: entry.userId, content: 'zerou', type: 'activity' as const, activityStatus: 'completed' as const, gameEntryId: entry.id, gameId: game.updated!.id },
        { userId: entry.userId, content: 'jogando', type: 'activity' as const, activityStatus: 'playing' as const, gameEntryId: entry.id, gameId: game.updated!.id },
      ]),
    );
    // Fora da janela: criados há 8 dias e um post de atividade antigo, nada nesta semana.
    const stale = await entries('stale', 50, ago(8 * DAY));
    await db.insert(posts).values({ userId: stale[0]!.userId, content: 'antigo', type: 'activity', gameEntryId: stale[0]!.id, createdAt: ago(9 * DAY) });
    // Um post comum (não de atividade) ligado a um registro antigo não conta como atualização.
    await db.insert(posts).values({ userId: stale[1]!.userId, content: 'comentário', type: 'status', gameEntryId: stale[1]!.id });
    await entries('blocked', 45, ago(1000), [blocker]);
    await entries('muted', 45, ago(60 * 60_000), [muted]);

    await ok('POST', `/users/${viewer.user.id}/block`, blocker);
    await ok('POST', `/users/${muted.user.id}/mute`, viewer);
  });

  it('ranks by entries created or updated in the last 7 days; a tie goes to the most recent', async () => {
    assert.deepEqual(mine(await trending(other)), [
      'blocked:45',
      'muted:45',
      'top:40',
      'recentTie:30',
      'olderTie:30',
      'updated:25',
    ]);
  });

  it('leaves out entries of people blocked either way or muted by the viewer', async () => {
    assert.deepEqual(mine(await trending(viewer)), ['top:40', 'recentTie:30', 'olderTie:30', 'updated:25']);
  });

  it('is ordered by entry count and uses the game summary shape', async () => {
    const items = await trending(other);
    const counts = items.map((item) => item.entryCount);
    assert.deepEqual(counts, [...counts].sort((x, y) => y - x));
    const top = items.find((item) => item.game.id === game.top!.id)!;
    assert.deepEqual(Object.keys(top).sort(), ['entryCount', 'game']);
    assert.deepEqual(top.game, {
      id: game.top!.id,
      igdbId: game.top!.igdbId,
      name: 'Em alta top',
      summary: 'Sinopse.',
      coverUrl: 'http://example.test/top.jpg',
      screenshots: [],
      platforms: ['PC'],
      genres: ['RPG'],
    });
  });

  it('defaults to 10, takes up to 20, and needs a session', async () => {
    assert.ok((await trending(other, '')).length <= 10);
    assert.equal((await trending(other, '?limit=2')).length, 2);
    for (const query of ['?limit=0', '?limit=21', '?limit=x']) {
      const res = await api.http('GET', `/games/trending${query}`, other.accessToken);
      assert.equal(res.status, 400, query);
    }
    assert.equal((await api.http('GET', '/games/trending', null)).status, 401);
  });

  it('a new entry through the API counts', async () => {
    const before = (await trending(other, '?limit=20')).find((item) => item.game.id === game.updated!.id)!.entryCount;
    await ok('POST', '/game-entries', other, { igdbId: game.updated!.igdbId, platform: 'PC', status: 'playing' });
    const after = (await trending(other, '?limit=20')).find((item) => item.game.id === game.updated!.id)!.entryCount;
    assert.equal(after, before + 1);
  });
});

describe('GET /users/suggestions', () => {
  let me: TestUser;
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let x: TestUser;
  let y: TestUser;
  let y2: TestUser;
  let z: TestUser;
  let mutedPerson: TestUser;
  let blocksMe: TestUser;
  let blockedByMe: TestUser;

  const suggestions = async (user: TestUser, query = '?limit=20') => (await ok('GET', `/users/suggestions${query}`, user)) as Json[];
  const follow = (who: TestUser, whom: TestUser) => ok('POST', `/users/${whom.user.id}/follow`, who);
  const followerCount = async (viewer: TestUser, id: string) => (await ok('GET', `/users/${id}`, viewer)).followerCount as number;

  before(async () => {
    const reg = (prefix: string) => registerUser(api.http, prefix);
    me = await reg('sgme');
    [a, b, c] = [await reg('sga'), await reg('sgb'), await reg('sgc')];
    [x, y, y2, z] = [await reg('sgx'), await reg('sgy'), await reg('sgy2'), await reg('sgz')];
    [mutedPerson, blocksMe, blockedByMe] = [await reg('sgmu'), await reg('sgbm'), await reg('sgbb')];
    const outsiders = [await reg('sgo1'), await reg('sgo2')];

    for (const person of [a, b, c]) await follow(me, person);
    // x: seguido por 3 dos meus; y e y2 por 2 (y tem mais seguidores); z por 1.
    for (const person of [x, y, y2, z]) await follow(a, person);
    for (const person of [x, y, y2]) await follow(b, person);
    await follow(c, x);
    for (const outsider of outsiders) await follow(outsider, y);
    // Seguidos pelos meus, mas fora: eu, quem eu já sigo, silenciados e bloqueios nos dois sentidos.
    for (const person of [me, b, mutedPerson, blocksMe, blockedByMe]) await follow(a, person);
    for (const person of [mutedPerson, blocksMe, blockedByMe]) await follow(c, person);
    await follow(x, me);
    await ok('POST', `/users/${mutedPerson.user.id}/mute`, me);
    await ok('POST', `/users/${me.user.id}/block`, blocksMe);
    await ok('POST', `/users/${blockedByMe.user.id}/block`, me);
  });

  it('ranks people my follows follow by how many of them, then by follower count', async () => {
    const items = await suggestions(me);
    assert.deepEqual(
      items.slice(0, 4).map((item) => [item.id, item.followedByCount]),
      [
        [x.user.id, 3],
        [y.user.id, 2],
        [y2.user.id, 2],
        [z.user.id, 1],
      ],
    );
    assert.ok(items.slice(4).every((item) => item.followedByCount === 0));
  });

  it('carries the person summary, bio and the relation to me', async () => {
    await ok('PATCH', '/users/me', x, { bio: 'Jogo de tudo' });
    const items = await suggestions(me);
    const first = items[0]!;
    assert.deepEqual(Object.keys(first).sort(), ['avatarUrl', 'bio', 'followedByCount', 'followsMe', 'id', 'isFollowedByMe', 'name', 'username']);
    assert.deepEqual(first, {
      id: x.user.id,
      username: x.user.username,
      name: 'sgx',
      avatarUrl: null,
      bio: 'Jogo de tudo',
      isFollowedByMe: false,
      followsMe: true,
      followedByCount: 3,
    });
    assert.equal(items.find((item) => item.id === y.user.id)!.followsMe, false);
    assert.ok(items.every((item) => item.isFollowedByMe === false));
  });

  it('never suggests me, people I follow, muted people or blocks either way', async () => {
    const ids = (await suggestions(me)).map((item) => item.id);
    for (const person of [me, a, b, c, mutedPerson, blocksMe, blockedByMe]) {
      assert.ok(!ids.includes(person.user.id), person.user.username);
    }
    assert.equal(new Set(ids).size, ids.length, 'sem repetidos');
  });

  it('fills up to the limit with the most-followed people', async () => {
    const items = await suggestions(me);
    const [{ value: total }] = (await db.select({ value: count() }).from(users)) as [{ value: number }];
    // Fora: eu, os 3 que sigo, o silenciado e os 2 bloqueios.
    assert.equal(items.length, Math.min(20, total - 7));
    const fill = items.slice(4);
    assert.ok(fill.length > 0);
    const counts = await Promise.all(fill.map((item) => followerCount(me, item.id)));
    assert.deepEqual(counts, [...counts].sort((p, q) => q - p));
  });

  it('someone who follows nobody gets the most-followed people', async () => {
    const lonely = await registerUser(api.http, 'sgl');
    const items = await suggestions(lonely);
    assert.equal(items.length, 20);
    assert.ok(items.every((item) => item.followedByCount === 0));
    const counts = await Promise.all(items.map((item) => followerCount(lonely, item.id)));
    assert.deepEqual(counts, [...counts].sort((p, q) => q - p));
    assert.ok(!items.some((item) => item.id === lonely.user.id));
  });

  it('defaults to 10, takes up to 20, and needs a session', async () => {
    assert.equal((await suggestions(me, '')).length, 10);
    assert.deepEqual(
      (await suggestions(me, '?limit=2')).map((item) => item.id),
      [x.user.id, y.user.id],
    );
    for (const query of ['?limit=0', '?limit=21', '?limit=x']) {
      assert.equal((await api.http('GET', `/users/suggestions${query}`, me.accessToken)).status, 400, query);
    }
    assert.equal((await api.http('GET', '/users/suggestions', null)).status, 401);
  });

  it('following a suggestion takes it out', async () => {
    await follow(me, x);
    const ids = (await suggestions(me)).map((item) => item.id);
    assert.ok(!ids.includes(x.user.id));
    await ok('DELETE', `/users/${x.user.id}/follow`, me);
  });
});
