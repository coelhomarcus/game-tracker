// Modelo de leitura dos posts (contadores, estado de quem vê, imagens, post citado) e o feed com
// reposts ordenado pela hora da atividade. Reposts, salvos, imagens e citações ainda não têm
// endpoint de escrita, então esses dados entram direto no banco de teste; o resto vem pela API.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db';
import { bookmarks, games, postImages, posts, reposts } from '../../src/db/schema';
import { encodeCursor } from '../../src/lib/cursor';
import { registerUser, type TestUser } from '../helpers/client';
import { ensureSyntheticGames } from '../helpers/seed';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

interface FeedPage {
  items: Json[];
  nextCursor: string | null;
}

/** Identidade de um item do feed: o post original ou o repost de alguém. */
const keyOf = (item: Json) => (item.reason ? `repost:${item.id}:${item.reason.by.id}` : `post:${item.id}`);

async function createPost(api: TestApi, user: TestUser, body: Json): Promise<string> {
  const res = await api.http('POST', '/posts', user.accessToken, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

async function setPostTime(id: string, at: Date) {
  await db.update(posts).set({ createdAt: at }).where(eq(posts.id, id));
}

async function repost(postId: string, userId: string, at?: Date) {
  await db.insert(reposts).values({ postId, userId, ...(at ? { createdAt: at } : {}) });
}

/** Percorre todas as páginas; falha se o cursor andar em círculos. */
async function allPages(load: (cursor?: string) => Promise<FeedPage>, maxPages = 50) {
  const items: Json[] = [];
  const pageSizes: number[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await load(cursor);
    items.push(...page.items);
    pageSizes.push(page.items.length);
    if (!page.nextCursor) return { items, pageSizes };
    cursor = page.nextCursor;
  }
  throw new Error('paginação não terminou');
}

describe('post read model', () => {
  let api: TestApi;
  let author: TestUser;
  let b: TestUser;
  let c: TestUser;
  let postId: string;

  const getPost = async (id: string, viewer: TestUser) => {
    const res = await api.http('GET', `/posts/${id}`, viewer.accessToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as Json;
  };

  before(async () => {
    api = await startApi();
    author = await registerUser(api.http, 'rma');
    b = await registerUser(api.http, 'rmb');
    c = await registerUser(api.http, 'rmc');

    postId = await createPost(api, author, { content: 'post contado' });
    for (const viewer of [b, c]) assert.equal((await api.http('POST', `/posts/${postId}/like`, viewer.accessToken)).status, 204);
    for (const text of ['um', 'dois', 'três']) {
      assert.equal((await api.http('POST', `/posts/${postId}/comments`, b.accessToken, { content: text })).status, 201);
    }
    await repost(postId, b.user.id);
    await repost(postId, c.user.id);
    await db.insert(bookmarks).values({ postId, userId: b.user.id });
    // Duas citações do post (posts novos apontando para ele).
    for (const viewer of [b, c]) {
      const quoteId = await createPost(api, viewer, { content: 'citando' });
      await db.update(posts).set({ quotedPostId: postId }).where(eq(posts.id, quoteId));
    }
  });
  after(() => api.close());

  it('counts likes, comments, reposts, quotes and bookmarks', async () => {
    const post = await getPost(postId, author);
    assert.equal(post.likeCount, 2);
    assert.equal(post.commentCount, 3);
    assert.equal(post.repostCount, 2);
    assert.equal(post.quoteCount, 2);
    assert.equal(post.bookmarkCount, 1);
  });

  it("flags reflect only the viewer's own actions", async () => {
    const asB = await getPost(postId, b);
    assert.equal(asB.likedByMe, true);
    assert.equal(asB.repostedByMe, true);
    assert.equal(asB.bookmarkedByMe, true);

    const asC = await getPost(postId, c);
    assert.equal(asC.likedByMe, true);
    assert.equal(asC.repostedByMe, true);
    assert.equal(asC.bookmarkedByMe, false);

    const asAuthor = await getPost(postId, author);
    assert.equal(asAuthor.likedByMe, false);
    assert.equal(asAuthor.repostedByMe, false);
    assert.equal(asAuthor.bookmarkedByMe, false);
  });

  it('keeps every existing field', async () => {
    const post = await getPost(postId, b);
    for (const field of ['id', 'userId', 'content', 'type', 'activityStatus', 'imageUrl', 'createdAt', 'gameEntry', 'game', 'user']) {
      assert.ok(field in post, `campo ${field} sumiu`);
    }
    assert.equal(post.user.id, author.user.id);
    assert.deepEqual(Object.keys(post.user).sort(), ['avatarUrl', 'id', 'name', 'username']);
    // Nada de listas cruas de likes/comentários na resposta.
    assert.equal(post.likes, undefined);
    assert.equal(post.comments, undefined);
  });

  it('a post with no activity has zero counts and an empty image list', async () => {
    const id = await createPost(api, author, { content: 'sozinho' });
    const post = await getPost(id, b);
    assert.deepEqual(
      [post.likeCount, post.commentCount, post.repostCount, post.quoteCount, post.bookmarkCount],
      [0, 0, 0, 0, 0],
    );
    assert.deepEqual([post.likedByMe, post.repostedByMe, post.bookmarkedByMe], [false, false, false]);
    assert.deepEqual(post.images, []);
    assert.equal(post.imageUrl, null);
    assert.equal(post.quotedPost, null);
  });

  it('legacy imageUrl becomes the only image when the post has no image rows', async () => {
    const url = 'http://example.test/uploads/legado.jpg';
    const id = await createPost(api, author, { content: 'com foto antiga', imageUrl: url });
    const post = await getPost(id, b);
    assert.equal(post.imageUrl, url);
    assert.deepEqual(post.images, [{ url, width: null, height: null, alt: null }]);
  });

  it('image rows come ordered by position and imageUrl is the first one', async () => {
    const id = await createPost(api, author, { content: 'galeria' });
    await db.insert(postImages).values([
      { postId: id, url: 'http://example.test/uploads/posts/c.jpg', width: 30, height: 31, position: 2, alt: null },
      { postId: id, url: 'http://example.test/uploads/posts/a.jpg', width: 10, height: 11, position: 0, alt: 'primeira' },
      { postId: id, url: 'http://example.test/uploads/posts/b.jpg', width: 20, height: 21, position: 1, alt: 'segunda' },
    ]);
    const post = await getPost(id, b);
    assert.deepEqual(post.images, [
      { url: 'http://example.test/uploads/posts/a.jpg', width: 10, height: 11, alt: 'primeira' },
      { url: 'http://example.test/uploads/posts/b.jpg', width: 20, height: 21, alt: 'segunda' },
      { url: 'http://example.test/uploads/posts/c.jpg', width: 30, height: 31, alt: null },
    ]);
    assert.equal(post.imageUrl, 'http://example.test/uploads/posts/a.jpg');
  });

  it('a quote carries a one-level summary of the quoted post', async () => {
    await ensureSyntheticGames();
    const [game] = await db.select().from(games).where(eq(games.igdbId, 900001));
    const originalId = await createPost(api, author, { content: 'original citado', gameId: game!.id });
    await db.insert(postImages).values({
      postId: originalId,
      url: 'http://example.test/uploads/posts/q.jpg',
      width: 5,
      height: 6,
      position: 0,
    });
    const quoteId = await createPost(api, b, { content: 'minha citação' });
    await db.update(posts).set({ quotedPostId: originalId }).where(eq(posts.id, quoteId));
    // Citação da citação: o resumo não aninha outra citação.
    const quoteOfQuoteId = await createPost(api, c, { content: 'citação da citação' });
    await db.update(posts).set({ quotedPostId: quoteId }).where(eq(posts.id, quoteOfQuoteId));

    const quote = await getPost(quoteId, c);
    assert.equal(quote.quotedPostId, originalId);
    const summary = quote.quotedPost;
    assert.equal(summary.id, originalId);
    assert.equal(summary.content, 'original citado');
    assert.equal(summary.user.id, author.user.id);
    assert.deepEqual(Object.keys(summary.user).sort(), ['avatarUrl', 'id', 'name', 'username']);
    assert.equal(summary.game.id, game!.id);
    assert.deepEqual(summary.images, [{ url: 'http://example.test/uploads/posts/q.jpg', width: 5, height: 6, alt: null }]);
    assert.ok(!Number.isNaN(new Date(summary.createdAt).getTime()));

    const nested = await getPost(quoteOfQuoteId, author);
    assert.equal(nested.quotedPost.id, quoteId);
    assert.equal(nested.quotedPost.quotedPost, undefined);
    assert.equal(nested.quotedPost.likeCount, undefined);

    const original = await getPost(originalId, c);
    assert.equal(original.quoteCount, 1);
  });

  it('a quote of a deleted post keeps existing with quotedPost null', async () => {
    const originalId = await createPost(api, author, { content: 'vai sumir' });
    const quoteId = await createPost(api, b, { content: 'citou o que sumiu' });
    await db.update(posts).set({ quotedPostId: originalId }).where(eq(posts.id, quoteId));
    await db.delete(posts).where(eq(posts.id, originalId));

    const quote = await getPost(quoteId, c);
    assert.equal(quote.content, 'citou o que sumiu');
    assert.equal(quote.quotedPost, null);
  });
});

describe('feed with reposts', () => {
  let api: TestApi;
  let viewer: TestUser;
  let f1: TestUser;
  let f2: TestUser;
  let stranger: TestUser;
  let ids: Record<string, string>;
  /** Itens esperados no Seguindo de `viewer`, do mais recente ao mais antigo. */
  let expectedFollowing: string[];
  let base: number;
  const at = (seconds: number) => new Date(base + seconds * 1000);

  const feed = (user: TestUser, scope: 'following' | 'general', limit: number) => async (cursor?: string) => {
    const query = `/feed?scope=${scope}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await api.http('GET', query, user.accessToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as FeedPage;
  };

  before(async () => {
    api = await startApi();
    viewer = await registerUser(api.http, 'fdv');
    f1 = await registerUser(api.http, 'fd1');
    f2 = await registerUser(api.http, 'fd2');
    stranger = await registerUser(api.http, 'fds');
    for (const followed of [f1, f2]) {
      assert.equal((await api.http('POST', `/users/${followed.user.id}/follow`, viewer.accessToken)).status, 204);
    }

    // Horários explícitos, todos no passado recente, para a ordem ser determinística.
    base = Date.now() - 10 * 60_000;
    ids = {};
    const timeline: [string, TestUser, number][] = [
      ['u1', stranger, 1],
      ['f1a', f1, 2],
      ['f2a', f2, 3],
      ['v1', viewer, 5],
      ['f1b', f1, 9],
      ['f2b', f2, 11],
    ];
    for (const [name, user, second] of timeline) {
      ids[name] = await createPost(api, user, { content: name });
      await setPostTime(ids[name]!, at(second));
    }
    await repost(ids.u1!, f1.user.id, at(4)); // seguido reposta post de quem não é seguido
    await repost(ids.u1!, f2.user.id, at(6)); // mesmo original, outro repostador
    await repost(ids.f1a!, f2.user.id, at(7));
    await repost(ids.f2a!, stranger.user.id, at(8)); // repost de quem não é seguido: fora do Seguindo
    await repost(ids.f1b!, f1.user.id, at(10)); // repostar o próprio post é permitido
    await repost(ids.f2b!, f1.user.id, at(11)); // empate de horário com o próprio f2b

    // f2b (post) e o repost de f1 têm o mesmo horário: o desempate é pelo id, o que torna a ordem
    // entre os dois imprevisível aqui; o teste compara esse par sem ordem.
    expectedFollowing = [
      `post:${ids.f2b}`,
      `repost:${ids.f2b}:${f1.user.id}`,
      `repost:${ids.f1b}:${f1.user.id}`,
      `post:${ids.f1b}`,
      `repost:${ids.f1a}:${f2.user.id}`,
      `repost:${ids.u1}:${f2.user.id}`,
      `post:${ids.v1}`,
      `repost:${ids.u1}:${f1.user.id}`,
      `post:${ids.f2a}`,
      `post:${ids.f1a}`,
    ];
  });
  after(() => api.close());

  /** Igualdade de ordem, aceitando qualquer ordem só dentro do par empatado (dois primeiros). */
  function assertFollowingOrder(keys: string[]) {
    assert.deepEqual([...keys.slice(0, 2)].sort(), [...expectedFollowing.slice(0, 2)].sort());
    assert.deepEqual(keys.slice(2), expectedFollowing.slice(2));
  }

  it('following: own posts, followed posts and followed reposts, newest activity first', async () => {
    const { items } = await allPages(feed(viewer, 'following', 50));
    assertFollowingOrder(items.map(keyOf));
  });

  for (const limit of [1, 2, 3, 4]) {
    it(`following paginated by ${limit}: no duplicates and no gaps`, async () => {
      const { items, pageSizes } = await allPages(feed(viewer, 'following', limit));
      const keys = items.map(keyOf);
      assert.equal(new Set(keys).size, keys.length, `duplicados: ${keys.join(', ')}`);
      assertFollowingOrder(keys);
      for (const size of pageSizes) assert.ok(size <= limit);
    });
  }

  it('repost items carry the reason; originals have reason null', async () => {
    const { items } = await allPages(feed(viewer, 'following', 50));
    const reposted = items.find((i) => keyOf(i) === `repost:${ids.u1}:${f2.user.id}`)!;
    assert.equal(reposted.id, ids.u1);
    assert.equal(reposted.content, 'u1');
    assert.equal(reposted.user.id, stranger.user.id);
    assert.equal(reposted.reason.type, 'repost');
    assert.deepEqual(Object.keys(reposted.reason.by).sort(), ['avatarUrl', 'id', 'name', 'username']);
    assert.equal(reposted.reason.by.username, f2.user.username);
    assert.equal(new Date(reposted.reason.at).getTime(), at(6).getTime());
    // O item do repost é o post completo, com contadores.
    assert.equal(reposted.repostCount, 2);
    assert.equal(typeof reposted.likeCount, 'number');

    const original = items.find((i) => keyOf(i) === `post:${ids.f1a}`)!;
    assert.equal(original.reason, null);
  });

  it('the same original appears once per reposter, never twice for the same one', async () => {
    const { items } = await allPages(feed(viewer, 'following', 2));
    const u1Items = items.filter((i) => i.id === ids.u1);
    // u1 é de quem o viewer não segue: só entra pelos dois reposts.
    assert.deepEqual(u1Items.map((i) => i.reason?.by.id).sort(), [f1.user.id, f2.user.id].sort());
  });

  it('general: every post and every repost, newest activity first', async () => {
    const mine = new Set(Object.values(ids));
    const { items } = await allPages(async (cursor) => {
      const page = await feed(viewer, 'general', 5)(cursor);
      // Só interessa até passar do post mais antigo deste teste.
      const last = page.items[page.items.length - 1];
      const lastAt = last ? new Date(last.reason?.at ?? last.createdAt).getTime() : 0;
      return lastAt < at(1).getTime() ? { ...page, nextCursor: null } : page;
    });
    const keys = items.filter((i) => mine.has(i.id)).map(keyOf);
    assert.equal(new Set(keys).size, keys.length);
    // Além do Seguindo, o general traz o post de quem o viewer não segue e o repost feito por ele.
    const expected = [
      expectedFollowing[0]!,
      expectedFollowing[1]!,
      `repost:${ids.f1b}:${f1.user.id}`,
      `post:${ids.f1b}`,
      `repost:${ids.f2a}:${stranger.user.id}`,
      `repost:${ids.f1a}:${f2.user.id}`,
      `repost:${ids.u1}:${f2.user.id}`,
      `post:${ids.v1}`,
      `repost:${ids.u1}:${f1.user.id}`,
      `post:${ids.f2a}`,
      `post:${ids.f1a}`,
      `post:${ids.u1}`,
    ];
    assert.deepEqual([...keys.slice(0, 2)].sort(), [...expected.slice(0, 2)].sort());
    assert.deepEqual(keys.slice(2), expected.slice(2));
  });

  it('following with no follows still shows your own posts and reposts', async () => {
    const loner = await registerUser(api.http, 'fdl');
    const own = await createPost(api, loner, { content: 'só meu' });
    const someoneElse = await createPost(api, stranger, { content: 'de outra pessoa' });
    await repost(someoneElse, loner.user.id);
    const { items } = await allPages(feed(loner, 'following', 20));
    assert.deepEqual(items.map(keyOf), [`repost:${someoneElse}:${loner.user.id}`, `post:${own}`]);
  });

  it("user posts include that user's reposts with the reason", async () => {
    const load = (type?: string, limit = 2) => async (cursor?: string) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (type) params.set('type', type);
      if (cursor) params.set('cursor', cursor);
      const res = await api.http('GET', `/users/${f1.user.id}/posts?${params}`, viewer.accessToken);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body as FeedPage;
    };
    const expected = [
      `repost:${ids.f2b}:${f1.user.id}`,
      `repost:${ids.f1b}:${f1.user.id}`,
      `post:${ids.f1b}`,
      `repost:${ids.u1}:${f1.user.id}`,
      `post:${ids.f1a}`,
    ];
    assert.deepEqual((await allPages(load())).items.map(keyOf), expected);
    assert.deepEqual((await allPages(load('post'))).items.map(keyOf), expected);
    // A aba de atividade mostra só as atividades do próprio usuário.
    assert.deepEqual((await allPages(load('activity'))).items, []);
  });

  it('game posts stay originals only', async () => {
    await ensureSyntheticGames();
    const [game] = await db.select().from(games).where(eq(games.igdbId, 900002));
    const gamePost = await createPost(api, f1, { content: 'sobre o jogo', gameId: game!.id });
    await repost(gamePost, f2.user.id);
    await repost(gamePost, viewer.user.id);
    const res = await api.http('GET', `/games/${game!.id}/posts?limit=50`, viewer.accessToken);
    assert.equal(res.status, 200);
    const mine = (res.body.items as Json[]).filter((i) => i.id === gamePost);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]!.reason, null);
    assert.equal(mine[0]!.repostCount, 2);
    assert.equal(mine[0]!.repostedByMe, true);
  });

  it('deleting the original drops its reposts from the feed', async () => {
    const gone = await createPost(api, stranger, { content: 'apagado' });
    await repost(gone, f1.user.id);
    const before = (await allPages(feed(viewer, 'following', 50))).items.filter((i) => i.id === gone);
    assert.equal(before.length, 1);
    await db.delete(posts).where(eq(posts.id, gone));
    const afterDelete = (await allPages(feed(viewer, 'following', 50))).items.filter((i) => i.id === gone);
    assert.deepEqual(afterDelete, []);
    assert.deepEqual(await db.select().from(reposts).where(inArray(reposts.postId, [gone])), []);
  });

  it('still accepts a cursor in the previous format (createdAt_id of a post)', async () => {
    const legacy = encodeCursor(at(9), ids.f1b!);
    const res = await api.http('GET', `/users/${f1.user.id}/posts?cursor=${legacy}`, viewer.accessToken);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual((res.body.items as Json[]).map(keyOf), [`repost:${ids.u1}:${f1.user.id}`, `post:${ids.f1a}`]);
  });

  it('rejects a malformed cursor with 400', async () => {
    const res = await api.http('GET', '/feed?cursor=nao-e-um-cursor', viewer.accessToken);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
  });
});
