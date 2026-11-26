import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq, sql } from 'drizzle-orm';

import { db } from '../../src/db';
import { comments, games, postImages, posts, reposts } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { ensureSyntheticGames } from '../helpers/seed';
import { startApi, type TestApi } from '../helpers/server';

describe('reply previews', () => {
  let api: TestApi;
  let viewer: TestUser;
  let responder: TestUser;
  let originalAuthor: TestUser;
  let ancestorAuthor: TestUser;
  let rootId: string;
  let firstId: string;
  let nestedId: string;
  let ownPostId: string;

  async function ok(method: string, path: string, user: TestUser, status = 200, body?: object) {
    const response = await api.http(method, path, user.accessToken, body);
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
  }

  before(async () => {
    api = await startApi();
    await ensureSyntheticGames();
    const game = await db.query.games.findFirst({ where: eq(games.igdbId, 900001) });
    viewer = await registerUser(api.http, 'rv');
    responder = await registerUser(api.http, 'rr');
    originalAuthor = await registerUser(api.http, 'ro');
    ancestorAuthor = await registerUser(api.http, 'ra');
    await ok('POST', `/users/${responder.user.id}/follow`, viewer, 204);
    rootId = (await ok('POST', '/posts', originalAuthor, 201, { gameId: game!.id, content: 'O post original' })).id;
    ownPostId = (await ok('POST', '/posts', viewer, 201, { content: 'Outro post no feed' })).id;
    await db.insert(postImages).values({ postId: rootId, url: 'https://example.test/preview.jpg', position: 0, width: 800, height: 600 });
    const thread = `/posts/${rootId}/comments`;
    const ancestor = await ok('POST', thread, ancestorAuthor, 201, { content: 'Comentário pai' });
    firstId = (await ok('POST', thread, responder, 201, { content: 'Primeira resposta' })).id;
    nestedId = (await ok('POST', thread, responder, 201, { content: 'Resposta ao comentário', parentCommentId: ancestor.id })).id;
    // Mesmo milissegundo: o cursor guarda o microssegundo antes de desempatar pelo id.
    await db.update(comments).set({ createdAt: sql`'2026-10-20T12:00:00.123001Z'` }).where(eq(comments.id, firstId));
    await db.update(comments).set({ createdAt: sql`'2026-10-20T12:00:00.123003Z'` }).where(eq(comments.id, nestedId));
    await db.insert(reposts).values({ postId: rootId, userId: responder.user.id, createdAt: sql`'2026-10-20T12:00:00.123002Z'` });
    await db.update(posts).set({ createdAt: sql`'2026-10-20T12:00:00.123004Z'` }).where(eq(posts.id, ownPostId));
  });

  after(() => api.close());

  it('paginates posts, reposts and replies together with independent identities', async () => {
    const path = '/feed?scope=following&type=post&includeReplies=true&limit=1';
    const seen: Array<[string, string]> = [];
    let cursor: string | null = null;
    for (let index = 0; index < 4; index += 1) {
      const page = await ok('GET', cursor ? `${path}&cursor=${encodeURIComponent(cursor)}` : path, viewer);
      assert.equal(page.items.length, 1);
      const item = page.items[0];
      seen.push([item.reason?.type ?? 'post', item.reason?.id ?? item.id]);
      if (item.reason?.type === 'reply') {
        assert.equal(item.reason.by.id, responder.user.id);
        assert.equal(item.user.id, originalAuthor.user.id);
        assert.equal(item.images[0].url, 'https://example.test/preview.jpg');
      }
      cursor = page.nextCursor;
    }
    assert.equal(cursor, null);
    assert.deepEqual(seen, [['post', ownPostId], ['reply', nestedId], ['repost', rootId], ['reply', firstId]]);
    const legacy = await ok('GET', '/feed?scope=following&type=post', viewer);
    assert(legacy.items.every((item: { reason?: { type: string } }) => item.reason?.type !== 'reply'));
  });

  it('returns the text, author, image and game of the original in profile replies', async () => {
    const profile = await ok('GET', `/users/${responder.user.id}/comments`, viewer);
    assert.equal(profile.items[0].post.content, 'O post original');
    assert.equal(profile.items[0].post.user.id, originalAuthor.user.id);
    assert.equal(profile.items[0].post.game.igdbId, 900001);
    assert.equal(profile.items[0].post.images[0].url, 'https://example.test/preview.jpg');
  });

  it('hides a reply when an ancestor or the original author is hidden from the feed', async () => {
    await ok('POST', `/users/${ancestorAuthor.user.id}/mute`, viewer, 204);
    const path = '/feed?scope=following&type=post&includeReplies=true';
    const page = await ok('GET', path, viewer);
    assert.deepEqual(page.items.filter((item: { reason?: { type: string } }) => item.reason?.type === 'reply')
      .map((item: { reason: { id: string } }) => item.reason.id), [firstId]);
    await ok('POST', `/users/${originalAuthor.user.id}/block`, viewer, 204);
    assert((await ok('GET', path, viewer)).items.every((item: { id: string }) => item.id !== rootId));
  });
});
