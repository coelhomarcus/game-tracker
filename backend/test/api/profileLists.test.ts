// Listas de seguidores/seguindo, `followsMe` no perfil, filtro de mídia dos posts de um perfil e
// os posts que o usuário curtiu.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { follows, likes, postImages, posts, reposts } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;

const send = (method: string, p: string, user: TestUser | null, body?: unknown) =>
  api.http(method, p, user?.accessToken ?? null, body);

async function createPost(user: TestUser, body: Json): Promise<string> {
  const res = await send('POST', '/posts', user, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

async function follow(from: TestUser, to: TestUser, at?: string) {
  assert.equal((await send('POST', `/users/${to.user.id}/follow`, from)).status, 204);
  if (at) {
    await db
      .update(follows)
      .set({ createdAt: sql`${at}::timestamptz` })
      .where(and(eq(follows.followerId, from.user.id), eq(follows.followingId, to.user.id)));
  }
}

/** Percorre todas as páginas de uma lista de `limit` itens, falhando se o cursor andar em círculos. */
async function pages(user: TestUser, path: string, limit: number): Promise<Json[][]> {
  const result: Json[][] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const res: Json = await send('GET', `${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`, user);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    result.push(res.body.items);
    cursor = res.body.nextCursor;
    if (!cursor) return result;
  }
  throw new Error('a paginação não terminou');
}

before(async () => {
  api = await startApi();
});
after(() => api.close());

describe('followers and following lists', () => {
  let target: TestUser;
  let viewer: TestUser;
  let f1: TestUser;
  let f2: TestUser;
  let f3: TestUser;

  before(async () => {
    target = await registerUser(api.http, 'flt');
    viewer = await registerUser(api.http, 'flv');
    f1 = await registerUser(api.http, 'fl1');
    f2 = await registerUser(api.http, 'fl2');
    f3 = await registerUser(api.http, 'fl3');
    // Seguidores de `target`: f1 (mais antigo), f2 e f3 (mais novo); f2 e f3 no mesmo milissegundo.
    await follow(f1, target, '2026-03-01T10:00:00.100000Z');
    await follow(f2, target, '2026-03-01T10:00:00.200100Z');
    await follow(f3, target, '2026-03-01T10:00:00.200200Z');
    // `target` segue f1 e f3 (f3 é o mais novo).
    await follow(target, f1, '2026-03-02T10:00:00Z');
    await follow(target, f3, '2026-03-03T10:00:00Z');
    // O visualizador segue f2 e é seguido por f3.
    await follow(viewer, f2);
    await follow(f3, viewer);
  });

  const ids = (items: Json[]) => items.map((i) => i.id);

  it('lists followers newest follow first with summary, bio and the viewer flags', async () => {
    const res = await send('GET', `/users/${target.user.id}/followers`, viewer);
    assert.equal(res.status, 200);
    assert.equal(res.body.nextCursor, null);
    assert.deepEqual(ids(res.body.items), [f3.user.id, f2.user.id, f1.user.id]);
    const item = res.body.items[0] as Json;
    for (const field of ['id', 'username', 'name', 'avatarUrl', 'bio', 'isFollowedByMe', 'followsMe']) {
      assert.ok(field in item, `campo ${field} sumiu`);
    }
    const byId = new Map<string, Json>((res.body.items as Json[]).map((i) => [i.id, i]));
    const row = (u: TestUser) => byId.get(u.user.id)!;
    assert.equal(row(f2).isFollowedByMe, true);
    assert.equal(row(f2).followsMe, false);
    assert.equal(row(f3).isFollowedByMe, false);
    assert.equal(row(f3).followsMe, true);
    assert.equal(row(f1).isFollowedByMe, false);
    assert.equal(row(f1).followsMe, false);
  });

  it('lists following newest follow first', async () => {
    const res = await send('GET', `/users/${target.user.id}/following`, viewer);
    assert.equal(res.status, 200);
    assert.deepEqual(ids(res.body.items), [f3.user.id, f1.user.id]);
  });

  it('lists each person with the flags relative to the viewer, whoever owns the list', async () => {
    const res = await send('GET', `/users/${f3.user.id}/followers`, viewer);
    // f3 não tem seguidores além de `target`.
    assert.deepEqual(ids(res.body.items), [target.user.id]);
    const own = await send('GET', `/users/${viewer.user.id}/followers`, viewer);
    assert.deepEqual(ids(own.body.items), [f3.user.id]);
    assert.equal(own.body.items[0].followsMe, true);
  });

  it('pages with a cursor, without gaps or repeats, within the same millisecond', async () => {
    const result = await pages(viewer, `/users/${target.user.id}/followers`, 1);
    assert.equal(result.length, 3);
    assert.deepEqual(result.flat().map((i) => i.id), [f3.user.id, f2.user.id, f1.user.id]);
    const following = await pages(viewer, `/users/${target.user.id}/following`, 1);
    assert.deepEqual(following.flat().map((i) => i.id), [f3.user.id, f1.user.id]);
  });

  it('pages follows with the very same created_at exactly once each', async () => {
    const popular = await registerUser(api.http, 'ftp');
    const fans = [await registerUser(api.http, 'ft1'), await registerUser(api.http, 'ft2'), await registerUser(api.http, 'ft3')];
    const sameInstant = '2026-03-05T10:00:00.123456Z';
    for (const fan of fans) {
      await follow(fan, popular, sameInstant);
      await follow(popular, fan, sameInstant);
    }
    const expected = fans.map((fan) => fan.user.id).sort();
    for (const kind of ['followers', 'following']) {
      const result = await pages(viewer, `/users/${popular.user.id}/${kind}`, 1);
      assert.equal(result.length, 3);
      assert.deepEqual(result.flat().map((i) => i.id).sort(), expected);
    }
  });

  it('returns an empty page for someone without followers and 404 for an unknown user', async () => {
    const lonely = await registerUser(api.http, 'fll');
    assert.deepEqual((await send('GET', `/users/${lonely.user.id}/followers`, viewer)).body, { items: [], nextCursor: null });
    assert.deepEqual((await send('GET', `/users/${lonely.user.id}/following`, viewer)).body, { items: [], nextCursor: null });
    assert.equal((await send('GET', `/users/00000000-0000-4000-8000-000000000000/followers`, viewer)).status, 404);
    assert.equal((await send('GET', `/users/nao-e-uuid/following`, viewer)).status, 404);
  });

  it('requires auth, a valid cursor and a limit between 1 and 50', async () => {
    for (const kind of ['followers', 'following']) {
      const path = `/users/${target.user.id}/${kind}`;
      assert.equal((await send('GET', path, null)).status, 401);
      const bad = await send('GET', `${path}?cursor=nao-e-um-cursor`, viewer);
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.code, 'validation_error');
      assert.equal((await send('GET', `${path}?limit=0`, viewer)).status, 400);
      assert.equal((await send('GET', `${path}?limit=51`, viewer)).status, 400);
      assert.equal((await send('GET', `${path}?limit=50`, viewer)).status, 200);
    }
  });
});

describe('followsMe on the profile', () => {
  it('is true only when the profile user follows the viewer', async () => {
    const a = await registerUser(api.http, 'fma');
    const b = await registerUser(api.http, 'fmb');
    assert.equal((await send('GET', `/users/${b.user.id}`, a)).body.followsMe, false);
    await follow(b, a);
    const profile = (await send('GET', `/users/${b.user.id}`, a)).body;
    assert.equal(profile.followsMe, true);
    assert.equal(profile.isFollowedByMe, false);
    // Seguir de volta não muda `followsMe`; o outro lado continua falso.
    await follow(a, b);
    assert.equal((await send('GET', `/users/${b.user.id}`, a)).body.followsMe, true);
    assert.equal((await send('GET', `/users/${a.user.id}`, b)).body.followsMe, true);
    assert.equal((await send('GET', `/users/${a.user.id}`, a)).body.followsMe, false);
  });
});

describe('profile posts media filter', () => {
  let author: TestUser;
  let other: TestUser;
  let viewer: TestUser;
  let withImages: string;
  let legacy: string;
  let textOnly: string;
  let reposted: string;

  const addImage = (postId: string, n: number) =>
    db.insert(postImages).values({ postId, url: `http://example.test/uploads/posts/m${n}.jpg`, width: 10, height: 20, position: 0 });

  before(async () => {
    author = await registerUser(api.http, 'mda');
    other = await registerUser(api.http, 'mdo');
    viewer = await registerUser(api.http, 'mdv');
    textOnly = await createPost(author, { content: 'só texto' });
    withImages = await createPost(author, { content: 'com imagem' });
    await addImage(withImages, 1);
    legacy = (
      await db.insert(posts).values({ userId: author.user.id, content: 'foto antiga', imageUrl: 'http://example.test/uploads/legado.jpg' }).returning({ id: posts.id })
    )[0]!.id;
    // Post de outra pessoa com imagem, repostado pelo autor: não entra (é repost).
    reposted = await createPost(other, { content: 'imagem alheia' });
    await addImage(reposted, 2);
    await db.insert(reposts).values({ postId: reposted, userId: author.user.id });
    // Post de outra pessoa com imagem, que não é do autor.
    await addImage(await createPost(other, { content: 'outra imagem' }), 3);
    await db.update(posts).set({ createdAt: new Date('2026-03-01T10:00:00Z') }).where(eq(posts.id, withImages));
    await db.update(posts).set({ createdAt: new Date('2026-03-02T10:00:00Z') }).where(eq(posts.id, legacy));
  });

  it('returns only the user own posts with at least one image, no reposts', async () => {
    const res = await send('GET', `/users/${author.user.id}/posts?filter=media`, viewer);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body.items as Json[]).map((p) => p.id), [legacy, withImages]);
    for (const item of res.body.items as Json[]) {
      assert.equal(item.reason, null);
      assert.equal(item.user.id, author.user.id);
      assert.ok(item.images.length >= 1);
      assert.ok('likeCount' in item);
    }
    // Sem o filtro, o texto e o repost aparecem.
    const all = await send('GET', `/users/${author.user.id}/posts`, viewer);
    const allIds = (all.body.items as Json[]).map((p) => p.id);
    assert.ok(allIds.includes(textOnly));
    assert.ok(allIds.includes(reposted));
  });

  it('pages the media filter with the same cursor', async () => {
    const result = await pages(viewer, `/users/${author.user.id}/posts?filter=media`, 1);
    assert.deepEqual(result.flat().map((p) => p.id), [legacy, withImages]);
  });

  it('rejects an unknown filter', async () => {
    assert.equal((await send('GET', `/users/${author.user.id}/posts?filter=nope`, viewer)).status, 400);
  });
});

describe('my likes', () => {
  let author: TestUser;
  let reader: TestUser;
  let ids: string[];

  const list = (user: TestUser | null, query = '') => send('GET', `/users/me/likes${query}`, user);

  before(async () => {
    author = await registerUser(api.http, 'lka');
    reader = await registerUser(api.http, 'lkr');
    ids = [];
    for (const text of ['um', 'dois', 'três', 'quatro']) ids.push(await createPost(author, { content: text }));
    // Curtidos fora da ordem de criação: 3º, 1º, 2º. O 4º não é curtido.
    for (const i of [2, 0, 1]) assert.equal((await send('POST', `/posts/${ids[i]}/like`, reader)).status, 204);
    await send('POST', `/posts/${ids[3]}/like`, author);
    const stamps = ['2026-03-01T10:00:00.123100Z', '2026-03-01T10:00:00.123300Z', '2026-03-01T10:00:00.123200Z'];
    for (const [n, i] of [2, 0, 1].entries()) {
      await db
        .update(likes)
        .set({ createdAt: sql`${stamps[n]!}::timestamptz` })
        .where(and(eq(likes.postId, ids[i]!), eq(likes.userId, reader.user.id)));
    }
  });

  it('lists the posts I liked, newest like first, hydrated with reason null', async () => {
    const res = await list(reader);
    assert.equal(res.status, 200);
    // Curtidas: ids[2] às .1231, ids[0] às .1233, ids[1] às .1232.
    assert.deepEqual((res.body.items as Json[]).map((p) => p.id), [ids[0], ids[1], ids[2]]);
    assert.equal(res.body.nextCursor, null);
    for (const item of res.body.items as Json[]) {
      assert.equal(item.reason, null);
      assert.equal(item.likedByMe, true);
      assert.equal(item.user.id, author.user.id);
      for (const field of ['likeCount', 'commentCount', 'repostCount', 'images', 'quotedPost']) {
        assert.ok(field in item, `campo ${field} sumiu`);
      }
    }
  });

  it('pages likes with the very same created_at exactly once each', async () => {
    const fan = await registerUser(api.http, 'lkt');
    const liked: string[] = [];
    for (const text of ['a', 'b', 'c']) {
      const id = await createPost(author, { content: text });
      assert.equal((await send('POST', `/posts/${id}/like`, fan)).status, 204);
      liked.push(id);
    }
    await db
      .update(likes)
      .set({ createdAt: sql`${'2026-03-05T10:00:00.123456Z'}::timestamptz` })
      .where(eq(likes.userId, fan.user.id));
    const result = await pages(fan, '/users/me/likes', 1);
    assert.equal(result.length, 3);
    assert.deepEqual(result.flat().map((p) => p.id).sort(), [...liked].sort());
  });

  it('is private: someone with no likes gets an empty list', async () => {
    assert.deepEqual((await list(await registerUser(api.http, 'lkn'))).body, { items: [], nextCursor: null });
  });

  it('pages by like time without gaps or repeats, within the same millisecond', async () => {
    const result = await pages(reader, '/users/me/likes', 1);
    assert.equal(result.length, 3);
    assert.deepEqual(result.flat().map((p) => p.id), [ids[0], ids[1], ids[2]]);
  });

  it('drops a liked post that gets deleted and an unliked one', async () => {
    const other = await registerUser(api.http, 'lkd');
    const doomed = await createPost(author, { content: 'efêmero' });
    const kept = await createPost(author, { content: 'fica' });
    await send('POST', `/posts/${doomed}/like`, other);
    await send('POST', `/posts/${kept}/like`, other);
    assert.equal(((await list(other)).body.items as Json[]).length, 2);
    assert.equal((await send('DELETE', `/posts/${doomed}`, author)).status, 204);
    await send('DELETE', `/posts/${kept}/like`, other);
    assert.deepEqual((await list(other)).body.items, []);
  });

  it('is not shadowed by /users/:id and requires auth, a valid cursor and a valid limit', async () => {
    assert.equal((await list(null)).status, 401);
    const bad = await list(reader, '?cursor=nao-e-um-cursor');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'validation_error');
    assert.equal((await list(reader, '?limit=0')).status, 400);
    assert.equal((await list(reader, '?limit=51')).status, 400);
  });
});
