import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '../../src/db';
import { bookmarks, games, posts, reposts } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

describe('Game activity timelines', () => {
  let api: TestApi;
  let viewer: TestUser;
  let player: TestUser;
  let gameId: string;
  let playing: string;
  let completed: string;
  let manual: string;
  let quote: string;
  const search = `activity-fixture-${randomInt(1_000_000, 9_999_999)}`;

  async function read(path: string, user = viewer) {
    const result = await api.http('GET', path, user.accessToken);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return result.body;
  }

  async function write(method: 'POST' | 'PATCH' | 'DELETE', path: string, user: TestUser, status: number, data?: object) {
    const result = await api.http(method, path, user.accessToken, data);
    assert.equal(result.status, status, JSON.stringify(result.body));
    return result.body;
  }

  before(async () => {
    api = await startApi();
    viewer = await registerUser(api.http, 'av');
    player = await registerUser(api.http, 'ap');
    await write('POST', `/users/${player.user.id}/follow`, viewer, 204);
    const igdbId = randomInt(10_000_000, 2_000_000_000);
    const [game] = await db.insert(games).values({ igdbId, name: search, platforms: ['PC'], genres: [] }).returning();
    gameId = game!.id;

    const entry = await write('POST', '/game-entries', player, 201, { igdbId, platform: 'PC', status: 'playing' });
    const history = `/users/${player.user.id}/posts?type=activity`;
    playing = (await read(history)).items[0].id;
    await db.update(posts).set({ gameId: null }).where(eq(posts.id, playing));
    manual = (await write('POST', '/posts', player, 201, { gameId, content: `Opinião sobre ${search}` })).id;
    await write('PATCH', `/game-entries/${entry.id}`, player, 200, { status: 'completed' });
    await write('PATCH', `/game-entries/${entry.id}`, player, 200, { status: 'completed', rating: 9 });
    completed = (await read(history)).items[0].id;
    quote = (await write('POST', '/posts', viewer, 201, { content: 'Bela conquista' })).id;

    // Relações gravadas por versões anteriores, antes das restrições de escrita.
    await db.insert(reposts).values({ userId: viewer.user.id, postId: completed });
    await db.insert(bookmarks).values({ userId: viewer.user.id, postId: completed });
    await db.update(posts).set({ quotedPostId: completed }).where(eq(posts.id, quote));
  });

  after(() => api.close());

  it('filters both timeline branches before paginating and retains legacy reads', async () => {
    for (const path of ['/feed?scope=following', `/users/${player.user.id}/posts?limit=1`, `/games/${gameId}/posts?limit=1`]) {
      const base = path.includes('limit=') ? path : `${path}&limit=1`;
      const first = await read(`${base}&type=activity`);
      assert.deepEqual(first.items.map((item: { id: string }) => item.id), [completed]);
      const next = await read(`${base}&type=activity&cursor=${encodeURIComponent(first.nextCursor)}`);
      assert.deepEqual(next.items.map((item: { id: string }) => item.id), [playing]);
      assert.equal(next.items[0].activityStatus, 'playing');
      assert.equal(next.items[0].game.id, gameId);
      assert.equal(next.nextCursor, null);
      const publications = await read(`${base.replace('limit=1', 'limit=20')}&type=post`);
      assert(publications.items.some((item: { id: string }) => item.id === manual));
      assert(publications.items.every((item: { type: string }) => item.type !== 'activity'));
    }
    assert((await read('/feed?scope=following')).items.some((item: { id: string }) => item.id === completed));
    assert.deepEqual((await read(`/posts/search?q=${search}&type=post`)).items.map((item: { id: string }) => item.id), [manual]);
    assert.deepEqual((await read('/users/me/bookmarks?type=post')).items, []);
    assert.equal((await read('/users/me/bookmarks')).items[0].id, completed);
    assert.equal((await read(`/posts/${quote}`)).quotedPost.id, completed);
  });

  it('keeps the comment thread and likes while reserving publication actions', async () => {
    await write('POST', `/posts/${completed}/like`, viewer, 204);
    await write('POST', `/posts/${completed}/comments`, viewer, 201, { content: 'Parabéns!' });
    assert.equal((await read(`/posts/${completed}`)).likedByMe, true);
    assert.equal((await read(`/posts/${completed}/comments`))[0].content, 'Parabéns!');
    const notifications = await read('/notifications', player);
    assert(notifications.items.some((item: { type: string; postType: string }) => item.type === 'like' && item.postType === 'activity'));
    await write('POST', `/posts/${completed}/repost`, viewer, 400);
    await write('POST', `/posts/${completed}/bookmark`, viewer, 400);
    await write('POST', '/posts', viewer, 400, { content: 'Citação nova', quotedPostId: completed });
    await write('POST', '/posts', viewer, 400, { content: 'Evento manual', type: 'activity' });
  });

  it('honors existing mute and block rules for activity timelines', async () => {
    await write('POST', `/users/${player.user.id}/mute`, viewer, 204);
    assert.deepEqual((await read('/feed?scope=following&type=activity')).items, []);
    assert.deepEqual((await read(`/games/${gameId}/posts?type=activity`)).items, []);
    assert.equal((await read(`/users/${player.user.id}/posts?type=activity`)).items.length, 2);
    await write('POST', `/users/${viewer.user.id}/block`, player, 204);
    assert.deepEqual((await read(`/users/${player.user.id}/posts?type=activity`)).items, []);
    assert.equal((await api.http('GET', `/posts/${completed}`, viewer.accessToken)).status, 404);
  });
});
