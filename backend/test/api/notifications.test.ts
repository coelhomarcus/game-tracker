// Notificações de curtida e de seguir só nascem quando a relação é criada de fato. A lista pagina
// por cursor, filtra por tipo e traz a miniatura do post; a contagem de não lidas tem rota própria.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { db } from '../../src/db';
import { notifications, postImages, posts } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

describe('notifications without duplicates', () => {
  let api: TestApi;
  let a: TestUser;
  let b: TestUser;
  let postId: string;

  const notifs = async () => (await api.http('GET', '/notifications', a.accessToken)).body;
  const count = async (type: string) => (await notifs()).items.filter((i: { type: string }) => i.type === type).length;

  before(async () => {
    api = await startApi();
    a = await registerUser(api.http, 'na');
    b = await registerUser(api.http, 'nb');
    postId = (await api.http('POST', '/posts', a.accessToken, { content: 'olá' })).body.id;
  });
  after(() => api.close());

  it('like the time generates the notification', async () => {
    assert.equal((await api.http('POST', `/posts/${postId}/like`, b.accessToken)).status, 204);
    assert.equal(await count('like'), 1);
  });

  it('like of new does not generate another', async () => {
    for (let i = 0; i < 3; i++) await api.http('POST', `/posts/${postId}/like`, b.accessToken);
    assert.equal(await count('like'), 1);
  });

  it('unlike and like again creates the real new like (new notification)', async () => {
    await api.http('DELETE', `/posts/${postId}/like`, b.accessToken);
    await api.http('POST', `/posts/${postId}/like`, b.accessToken);
    assert.equal(await count('like'), 2);
  });

  it('like the own post does not notifies', async () => {
    await api.http('POST', `/posts/${postId}/like`, a.accessToken);
    assert.equal(await count('like'), 2);
  });

  it('follow the time generates the notification; repeat does not generate another', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await api.http('POST', `/users/${a.user.id}/follow`, b.accessToken)).status, 204);
    assert.equal(await count('follow'), 1);
  });

  it('the counter of unread matches with the events real', async () => {
    const { items, unreadCount } = await notifs();
    assert.equal(unreadCount, items.filter((i: { read: boolean }) => !i.read).length);
    assert.equal(unreadCount, 3, '2 curtidas + 1 seguidor');
  });

  it('comment and reply notify the author correct', async () => {
    const c = (await api.http('POST', `/posts/${postId}/comments`, b.accessToken, { content: 'oi' })).body;
    await api.http('POST', `/posts/${postId}/comments`, a.accessToken, { content: 'resposta', parentCommentId: c.id });
    assert.equal(await count('comment'), 1, 'a resposta de A ao comentário de B notifica B, não A');
  });

  it('marking all the read clears the counter and is idempotent', async () => {
    assert.equal((await api.http('POST', '/notifications/read-all', a.accessToken)).status, 204);
    assert.equal((await notifs()).unreadCount, 0);
    assert.equal((await api.http('POST', '/notifications/read-all', a.accessToken)).status, 204);
  });
});

type Json = Record<string, any>;

describe('GET /notifications: pages, filters and the post image', () => {
  let api: TestApi;
  let a: TestUser;
  let b: TestUser;
  let plainPostId: string;
  let imagePostId: string;
  let legacyPostId: string;

  const get = async (user: TestUser, query = '') => {
    const res = await api.http('GET', `/notifications${query}`, user.accessToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as Json;
  };
  const ids = (body: Json) => (body.items as Json[]).map((n) => n.id as string);
  const send = async (method: string, path: string, user: TestUser, body?: unknown) => {
    const res = await api.http(method, path, user.accessToken, body);
    assert.ok(res.status >= 200 && res.status < 300, `${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as Json;
  };

  /** Todas as páginas de um filtro, seguindo o cursor. */
  async function allPages(user: TestUser, filter: string, limit: number) {
    const pages: Json[] = [];
    let cursor: string | null = null;
    do {
      const query = `?filter=${filter}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await get(user, query);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 50);
    return pages;
  }

  before(async () => {
    api = await startApi();
    a = await registerUser(api.http, 'npa');
    b = await registerUser(api.http, 'npb');
    plainPostId = (await send('POST', '/posts', a, { content: 'sem imagem' })).id;
    imagePostId = (await send('POST', '/posts', a, { content: 'com imagens' })).id;
    await db.insert(postImages).values([
      { postId: imagePostId, url: 'http://example.test/uploads/posts/segunda.jpg', width: 2, height: 2, position: 1 },
      { postId: imagePostId, url: 'http://example.test/uploads/posts/primeira.jpg', width: 1, height: 1, position: 0 },
    ]);
    // Post antigo: só a coluna legada `image_url`, sem linhas em `post_images`.
    const [legacy] = await db
      .insert(posts)
      .values({ userId: a.user.id, content: 'foto antiga', imageUrl: 'http://example.test/uploads/legado.jpg' })
      .returning({ id: posts.id });
    legacyPostId = legacy!.id;

    // Um de cada tipo, de B para A, em sequência.
    await send('POST', `/users/${a.user.id}/follow`, b);
    await send('POST', `/posts/${plainPostId}/like`, b);
    await send('POST', `/posts/${imagePostId}/like`, b);
    await send('POST', `/posts/${legacyPostId}/like`, b);
    await send('POST', `/posts/${plainPostId}/repost`, b);
    await send('POST', `/posts/${plainPostId}/comments`, b, { content: 'um comentário' });
    const own = await send('POST', `/posts/${plainPostId}/comments`, a, { content: 'meu comentário' });
    await send('POST', `/posts/${plainPostId}/comments`, b, { content: 'respondendo', parentCommentId: own.id });
    await send('POST', '/posts', b, { content: `oi @${a.user.username}` });
    await send('POST', '/posts', b, { content: 'citando', quotedPostId: imagePostId });
  });
  after(() => api.close());

  it('without params: the first page, newest first, with unreadCount and nextCursor', async () => {
    const body = await get(a);
    assert.equal(body.nextCursor, null, 'menos de 30 notificações: uma página só');
    const items = body.items as Json[];
    const times = items.map((n) => Date.parse(n.createdAt));
    assert.deepEqual(times, [...times].sort((x, y) => y - x));
    assert.equal(body.unreadCount, items.filter((n) => !n.read).length);
    const types = new Set(items.map((n) => n.type));
    for (const type of ['follow', 'like', 'repost', 'comment', 'reply', 'mention', 'quote']) {
      assert.ok(types.has(type), `falta ${type}: ${[...types].join(',')}`);
    }
    // Os campos de antes continuam, e o cursor interno não vaza.
    const first = items[0]!;
    for (const key of ['id', 'type', 'actor', 'postId', 'commentId', 'read', 'createdAt', 'excerpt', 'postImageUrl']) {
      assert.ok(key in first, `falta o campo ${key}`);
    }
    assert.equal('atText' in first, false);
    assert.equal('post' in first, false);
    assert.deepEqual(Object.keys(first.actor).sort(), ['avatarUrl', 'id', 'name', 'username']);
  });

  it('defaults to 30 per page', async () => {
    const c = await registerUser(api.http, 'npl');
    await db
      .insert(notifications)
      .values(Array.from({ length: 31 }, () => ({ userId: c.user.id, actorId: b.user.id, type: 'follow' as const })));
    const first = await get(c);
    assert.equal(first.items.length, 30);
    assert.notEqual(first.nextCursor, null);
    const second = await get(c, `?cursor=${encodeURIComponent(first.nextCursor)}`);
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
  });

  it('pages follow the cursor without gaps or repeats', async () => {
    const full = ids(await get(a, '?limit=50'));
    const pages = await allPages(a, 'all', 3);
    assert.deepEqual(pages.flatMap(ids), full);
    assert.ok(pages.length >= 3);
    for (const page of pages.slice(0, -1)) assert.equal(page.items.length, 3);
    assert.equal(pages[pages.length - 1]!.nextCursor, null);
    // Toda página traz a contagem total de não lidas.
    for (const page of pages) assert.equal(page.unreadCount, pages[0]!.unreadCount);
  });

  it('notifications in the same instant are paged by id, none skipped', async () => {
    const c = await registerUser(api.http, 'npc');
    const at = new Date('2026-01-01T00:00:00.123Z');
    const rows = await db
      .insert(notifications)
      .values([0, 1, 2, 3].map(() => ({ userId: c.user.id, actorId: b.user.id, type: 'follow' as const, createdAt: at })))
      .returning({ id: notifications.id });
    const expected = rows.map((row) => row.id).sort().reverse();
    assert.deepEqual((await allPages(c, 'all', 1)).flatMap(ids), expected);
  });

  it('each filter keeps only its types and pages on its own; unreadCount counts every type', async () => {
    const all = (await get(a, '?limit=50')).items as Json[];
    const expected: Record<string, string[]> = {
      replies: ['comment', 'reply'],
      mentions: ['mention', 'quote'],
      follows: ['follow'],
    };
    const unreadAll = all.filter((n) => !n.read).length;
    for (const [filter, types] of Object.entries(expected)) {
      const body = await get(a, `?filter=${filter}&limit=50`);
      const wanted = all.filter((n) => types.includes(n.type)).map((n) => n.id);
      assert.ok(wanted.length > 0, filter);
      assert.deepEqual(ids(body), wanted, filter);
      assert.equal(body.unreadCount, unreadAll, `${filter}: a contagem é de todos os tipos`);
      assert.deepEqual((await allPages(a, filter, 1)).flatMap(ids), wanted, `${filter} paginado`);
    }
    assert.deepEqual(ids(await get(a, '?filter=all&limit=50')), all.map((n) => n.id));
  });

  it('postImageUrl is the first image of the related post, or null', async () => {
    const all = (await get(a, '?limit=50')).items as Json[];
    const likeOf = (postId: string) => all.find((n) => n.type === 'like' && n.postId === postId)!;
    assert.equal(likeOf(imagePostId).postImageUrl, 'http://example.test/uploads/posts/primeira.jpg');
    assert.equal(likeOf(legacyPostId).postImageUrl, 'http://example.test/uploads/legado.jpg');
    assert.equal(likeOf(plainPostId).postImageUrl, null);
    assert.equal(all.find((n) => n.type === 'follow')!.postImageUrl, null);
    // A citação aponta para o post novo (sem imagem), não para o citado.
    assert.equal(all.find((n) => n.type === 'quote')!.postImageUrl, null);
  });

  it('rejects a bad filter, limit or cursor', async () => {
    const badCursor = Buffer.from('{"at":"x"}').toString('base64url');
    for (const query of ['?filter=likes', '?limit=0', '?limit=51', '?cursor=nada', `?cursor=${badCursor}`]) {
      const res = await api.http('GET', `/notifications${query}`, a.accessToken);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'validation_error', query);
    }
    assert.equal((await api.http('GET', '/notifications?limit=50', a.accessToken)).status, 200);
  });

  it('GET /notifications/unread-count matches the list and needs a session', async () => {
    const res = await api.http('GET', '/notifications/unread-count', a.accessToken);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), ['unreadCount']);
    assert.ok(res.body.unreadCount > 0);
    assert.equal(res.body.unreadCount, (await get(a)).unreadCount);
    assert.equal((await api.http('GET', '/notifications/unread-count', null)).status, 401);
    assert.equal((await api.http('GET', '/notifications', null)).status, 401);
  });

  it('the count and the pages leave out muted and blocked actors', async () => {
    const owner = await registerUser(api.http, 'npo');
    const muted = await registerUser(api.http, 'npm');
    const blocker = await registerUser(api.http, 'npk');
    const blocked = await registerUser(api.http, 'npd');
    const friend = await registerUser(api.http, 'npf');
    for (const actor of [muted, blocker, blocked, friend]) await send('POST', `/users/${owner.user.id}/follow`, actor);
    const unread = async () => (await api.http('GET', '/notifications/unread-count', owner.accessToken)).body.unreadCount;
    assert.equal(await unread(), 4);

    await send('POST', `/users/${muted.user.id}/mute`, owner);
    await send('POST', `/users/${owner.user.id}/block`, blocker);
    await send('POST', `/users/${blocked.user.id}/block`, owner);

    assert.equal(await unread(), 1);
    for (const filter of ['all', 'follows']) {
      const body = await get(owner, `?filter=${filter}`);
      assert.deepEqual((body.items as Json[]).map((n) => n.actor.id), [friend.user.id], filter);
      assert.equal(body.unreadCount, 1, filter);
    }
    const paged = (await allPages(owner, 'all', 1)).flatMap((page) => (page.items as Json[]).map((n) => n.actor.id));
    assert.deepEqual(paged, [friend.user.id]);
  });
});
