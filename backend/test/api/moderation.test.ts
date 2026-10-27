// Silenciar e bloquear: endpoints, listas, flags do perfil e o filtro do conteúdo em cada lugar
// onde ele aparece (feeds, perfil, conversa, buscas e notificações).
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { blocks, follows, games, mutes } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { ensureSyntheticGames } from '../helpers/seed';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;

const send = (method: string, p: string, user: TestUser | null, body?: unknown) =>
  api.http(method, p, user?.accessToken ?? null, body);

async function ok(method: string, p: string, user: TestUser, body?: unknown): Promise<Json> {
  const res = await send(method, p, user, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${p}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

async function createPost(user: TestUser, body: Json): Promise<string> {
  const res = await send('POST', '/posts', user, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

async function comment(user: TestUser, postId: string, content: string, parentCommentId?: string): Promise<string> {
  const res = await send('POST', `/posts/${postId}/comments`, user, { content, parentCommentId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

const status = async (method: string, p: string, user: TestUser) => (await send(method, p, user)).status;

/** Chave de um item de linha do tempo: o post e, num repost, quem repostou. */
const key = (item: Json) => (item.reason ? `${item.id}<-${item.reason.by.id}` : item.id);
const keys = (items: Json[]) => items.map(key);

const feed = async (user: TestUser, scope: 'general' | 'following') =>
  keys((await ok('GET', `/feed?scope=${scope}&limit=50`, user)).items);
const userPosts = async (viewer: TestUser, owner: TestUser, query = '') =>
  (await ok('GET', `/users/${owner.user.id}/posts?limit=50${query}`, viewer)).items as Json[];
const searchPosts = async (user: TestUser, q: string) =>
  ((await ok('GET', `/posts/search?q=${encodeURIComponent(q)}&limit=50`, user)).items as Json[]).map((p) => p.id);
const searchUsers = async (user: TestUser, q: string) =>
  ((await ok('GET', `/users/search?q=${encodeURIComponent(q)}`, user)) as unknown as Json[]).map((u) => u.id);
const notifications = async (user: TestUser) => (await ok('GET', '/notifications', user)) as Json;
const actorsOf = (body: Json) => (body.items as Json[]).map((n) => n.actor.id);

/** Os ids de toda a árvore de comentários de um post. */
async function commentIds(user: TestUser, postId: string): Promise<string[]> {
  const tree = (await ok('GET', `/posts/${postId}/comments`, user)) as unknown as Json[];
  const out: string[] = [];
  const walk = (nodes: Json[]) => {
    for (const node of nodes) {
      out.push(node.id);
      walk(node.replies);
    }
  };
  walk(tree);
  return out;
}

async function follows_(a: TestUser, b: TestUser) {
  const row = await db.query.follows.findFirst({
    where: and(eq(follows.followerId, a.user.id), eq(follows.followingId, b.user.id)),
  });
  return row !== undefined;
}

before(async () => {
  await ensureSyntheticGames();
  api = await startApi();
});
after(() => api.close());

describe('mute and block endpoints', () => {
  let a: TestUser;
  let b: TestUser;

  before(async () => {
    a = await registerUser(api.http, 'mea');
    b = await registerUser(api.http, 'meb');
  });

  for (const action of ['mute', 'block'] as const) {
    it(`${action}: 204 and idempotent both ways`, async () => {
      assert.equal(await status('POST', `/users/${b.user.id}/${action}`, a), 204);
      assert.equal(await status('POST', `/users/${b.user.id}/${action}`, a), 204);
      const table = action === 'mute' ? mutes : blocks;
      const owner = action === 'mute' ? mutes.muterId : blocks.blockerId;
      const rows = await db.select().from(table).where(eq(owner, a.user.id));
      assert.equal(rows.length, 1);
      assert.equal(await status('DELETE', `/users/${b.user.id}/${action}`, a), 204);
      assert.equal(await status('DELETE', `/users/${b.user.id}/${action}`, a), 204);
      assert.equal((await db.select().from(table).where(eq(owner, a.user.id))).length, 0);
    });

    it(`${action}: 400 on self, 404 on unknown or malformed ids`, async () => {
      for (const method of ['POST', 'DELETE']) {
        const self = await send(method, `/users/${a.user.id}/${action}`, a);
        assert.equal(self.status, 400);
        assert.equal(self.body.error.code, 'invalid_operation');
        assert.equal(await status(method, `/users/${randomUUID()}/${action}`, a), 404);
        assert.equal(await status(method, `/users/nao-e-uuid/${action}`, a), 404);
      }
    });

    it(`${action}: requires auth`, async () => {
      assert.equal((await send('POST', `/users/${b.user.id}/${action}`, null)).status, 401);
    });
  }
});

describe('mute and block lists', () => {
  let owner: TestUser;
  let p1: TestUser;
  let p2: TestUser;
  let p3: TestUser;

  before(async () => {
    owner = await registerUser(api.http, 'mlo');
    p1 = await registerUser(api.http, 'ml1');
    p2 = await registerUser(api.http, 'ml2');
    p3 = await registerUser(api.http, 'ml3');
    // p2 e p3 no mesmo milissegundo: o cursor precisa dos microssegundos.
    const at = ['2026-04-01T10:00:00.100000Z', '2026-04-01T10:00:00.200100Z', '2026-04-01T10:00:00.200200Z'];
    for (const [i, person] of [p1, p2, p3].entries()) {
      await ok('POST', `/users/${person.user.id}/mute`, owner);
      await ok('POST', `/users/${person.user.id}/block`, owner);
      await db
        .update(mutes)
        .set({ createdAt: sql`${at[i]}::timestamptz` })
        .where(and(eq(mutes.muterId, owner.user.id), eq(mutes.mutedId, person.user.id)));
      await db
        .update(blocks)
        .set({ createdAt: sql`${at[i]}::timestamptz` })
        .where(and(eq(blocks.blockerId, owner.user.id), eq(blocks.blockedId, person.user.id)));
    }
    // A lista é de quem silenciou/bloqueou: o que outra pessoa fez não entra.
    await ok('POST', `/users/${p3.user.id}/mute`, p1);
    await ok('POST', `/users/${p3.user.id}/block`, p1);
  });

  for (const list of ['mutes', 'blocks'] as const) {
    it(`/me/${list}: newest first, user summaries`, async () => {
      const body = await ok('GET', `/users/me/${list}`, owner);
      assert.equal(body.nextCursor, null);
      assert.deepEqual(
        body.items.map((i: Json) => i.id),
        [p3.user.id, p2.user.id, p1.user.id],
      );
      assert.deepEqual(Object.keys(body.items[0]).sort(), ['avatarUrl', 'id', 'name', 'username']);
      assert.equal(body.items[0].username, p3.user.username);
    });

    it(`/me/${list}: pages with a keyset cursor without gaps or repeats`, async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const body: Json = await ok('GET', `/users/me/${list}?limit=1${cursor ? `&cursor=${cursor}` : ''}`, owner);
        assert.equal(body.items.length, 1);
        seen.push(body.items[0].id);
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      assert.deepEqual(seen, [p3.user.id, p2.user.id, p1.user.id]);
    });

    it(`/me/${list}: invalid cursor is 400, empty list for someone who did nothing`, async () => {
      assert.equal((await send('GET', `/users/me/${list}?cursor=lixo`, owner)).status, 400);
      const empty = await ok('GET', `/users/me/${list}`, p2);
      assert.deepEqual(empty, { items: [], nextCursor: null });
    });
  }

  it('unmuting and unblocking removes the person from the lists', async () => {
    await ok('DELETE', `/users/${p2.user.id}/mute`, owner);
    await ok('DELETE', `/users/${p1.user.id}/block`, owner);
    const muted = await ok('GET', '/users/me/mutes', owner);
    const blocked = await ok('GET', '/users/me/blocks', owner);
    assert.deepEqual(muted.items.map((i: Json) => i.id), [p3.user.id, p1.user.id]);
    assert.deepEqual(blocked.items.map((i: Json) => i.id), [p3.user.id, p2.user.id]);
  });
});

describe('block and follows', () => {
  let a: TestUser;
  let b: TestUser;

  before(async () => {
    a = await registerUser(api.http, 'bfa');
    b = await registerUser(api.http, 'bfb');
    await ok('POST', `/users/${b.user.id}/follow`, a);
    await ok('POST', `/users/${a.user.id}/follow`, b);
  });

  it('blocking removes the follows in both directions', async () => {
    assert.ok(await follows_(a, b));
    assert.ok(await follows_(b, a));
    await ok('POST', `/users/${b.user.id}/block`, a);
    assert.equal(await follows_(a, b), false);
    assert.equal(await follows_(b, a), false);
  });

  it('new follows are refused with 403 blocked, from either side', async () => {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ] as const) {
      const res = await send('POST', `/users/${to.user.id}/follow`, from);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'blocked');
    }
    assert.equal(await follows_(a, b), false);
    assert.equal(await follows_(b, a), false);
  });

  it('unblocking does not restore the follows, but following works again', async () => {
    await ok('DELETE', `/users/${b.user.id}/block`, a);
    assert.equal(await follows_(a, b), false);
    assert.equal(await follows_(b, a), false);
    assert.equal(await status('POST', `/users/${a.user.id}/follow`, b), 204);
    assert.ok(await follows_(b, a));
  });

  it('muting keeps the follows and does not prevent following', async () => {
    await ok('POST', `/users/${b.user.id}/mute`, a);
    assert.ok(await follows_(b, a));
    assert.equal(await status('POST', `/users/${b.user.id}/follow`, a), 204);
    assert.equal(await status('POST', `/users/${a.user.id}/follow`, b), 204);
    assert.ok(await follows_(a, b));
  });
});

describe('profile flags and blocked profile tabs', () => {
  let a: TestUser;
  let b: TestUser;
  let gameId: string;

  before(async () => {
    a = await registerUser(api.http, 'pfa');
    b = await registerUser(api.http, 'pfb');
    await ok('PATCH', '/users/me', b, { bio: 'bio de b' });
    gameId = (await db.query.games.findFirst({ where: eq(games.igdbId, 900001) }))!.id;
    // Conteúdo de b em cada aba: post, comentário, registro de jogo, favorito, seguidor e seguido.
    const post = await createPost(b, { content: 'post de b no perfil' });
    await comment(b, post, 'comentário de b');
    await ok('POST', '/game-entries', b, { igdbId: 900001, platform: 'PC', status: 'playing' });
    await ok('POST', `/games/${gameId}/favorite`, b);
    const other = await registerUser(api.http, 'pfo');
    await ok('POST', `/users/${other.user.id}/follow`, b);
    await ok('POST', `/users/${b.user.id}/follow`, other);
    // E o mesmo do lado de a, para conferir o outro sentido.
    const postA = await createPost(a, { content: 'post de a no perfil' });
    await comment(a, postA, 'comentário de a');
    await ok('POST', `/users/${other.user.id}/follow`, a);
  });

  const profile = async (viewer: TestUser, owner: TestUser) => ok('GET', `/users/${owner.user.id}`, viewer);

  it('starts with every flag false, also on my own profile', async () => {
    for (const [viewer, owner] of [
      [a, b],
      [b, a],
      [a, a],
    ] as const) {
      const p = await profile(viewer, owner);
      assert.equal(p.isMutedByMe, false);
      assert.equal(p.isBlockedByMe, false);
      assert.equal(p.blocksMe, false);
    }
  });

  it('isMutedByMe is only visible to the muter', async () => {
    await ok('POST', `/users/${b.user.id}/mute`, a);
    assert.equal((await profile(a, b)).isMutedByMe, true);
    const seenByMuted = await profile(b, a);
    assert.equal(seenByMuted.isMutedByMe, false);
    assert.equal(seenByMuted.blocksMe, false);
    assert.equal(seenByMuted.isBlockedByMe, false);
    // O perfil de quem foi silenciado continua com os posts.
    assert.equal((await userPosts(a, b)).length > 0, true);
    await ok('DELETE', `/users/${b.user.id}/mute`, a);
  });

  it('a block sets isBlockedByMe for the blocker and blocksMe for the blocked', async () => {
    await ok('POST', `/users/${b.user.id}/block`, a);
    const byBlocker = await profile(a, b);
    assert.equal(byBlocker.isBlockedByMe, true);
    assert.equal(byBlocker.blocksMe, false);
    const byBlocked = await profile(b, a);
    assert.equal(byBlocked.isBlockedByMe, false);
    assert.equal(byBlocked.blocksMe, true);
  });

  it('a blocked profile still returns bio and counts', async () => {
    const p = await profile(a, b);
    assert.equal(p.bio, 'bio de b');
    assert.equal(p.followerCount, 1);
    assert.equal(p.followingCount, 1);
    assert.equal(p.gameEntryCount, 1);
  });

  it('every tab of the profile is empty, for both sides', async () => {
    for (const [viewer, owner] of [
      [a, b],
      [b, a],
    ] as const) {
      const base = `/users/${owner.user.id}`;
      for (const tab of ['posts', 'posts?filter=media', 'posts?type=activity', 'comments', 'followers', 'following']) {
        const body = await ok('GET', `${base}/${tab}`, viewer);
        assert.deepEqual(body, { items: [], nextCursor: null }, `${tab} de ${owner.user.username}`);
      }
      assert.deepEqual(await ok('GET', `${base}/game-entries`, viewer), []);
      assert.deepEqual(await ok('GET', `${base}/favorites`, viewer), []);
    }
  });

  it('the owner still sees their own tabs while blocking or blocked', async () => {
    assert.equal((await userPosts(b, b)).length > 0, true);
    assert.equal((await userPosts(a, a)).length > 0, true);
    assert.equal(((await ok('GET', `/users/${b.user.id}/game-entries`, b)) as unknown as Json[]).length, 1);
  });

  it('unblocking restores the tabs', async () => {
    await ok('DELETE', `/users/${b.user.id}/block`, a);
    assert.equal((await userPosts(a, b)).length > 0, true);
    assert.equal((await ok('GET', `/users/${b.user.id}/comments`, a)).items.length, 1);
    assert.equal((await ok('GET', `/users/${b.user.id}/followers`, a)).items.length, 1);
    assert.equal(((await ok('GET', `/users/${b.user.id}/favorites`, a)) as unknown as Json[]).length, 1);
    const p = await profile(a, b);
    assert.equal(p.isBlockedByMe, false);
    assert.equal(p.blocksMe, false);
  });
});

describe('block hides content in both directions', () => {
  // a bloqueia b; c é um terceiro que interage com os dois.
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  const word = `palavra${randomUUID().slice(0, 6)}`;
  let gameId: string;
  let postA: string;
  let postB: string;
  let postC: string;
  let quoteOfB: string;
  let quoteOfA: string;
  let commentA: string;
  let commentB: string;
  let replyToB: string;
  let replyToReplyToB: string;
  let commentCOnB: string;

  before(async () => {
    a = await registerUser(api.http, 'bha');
    b = await registerUser(api.http, 'bhb');
    c = await registerUser(api.http, 'bhc');
    gameId = (await db.query.games.findFirst({ where: eq(games.igdbId, 900002) }))!.id;

    for (const [from, to] of [
      [a, c],
      [b, c],
      [a, b],
      [b, a],
    ] as const) {
      await ok('POST', `/users/${to.user.id}/follow`, from);
    }

    postA = await createPost(a, { content: `de a ${word}`, gameId });
    postB = await createPost(b, { content: `de b ${word}`, gameId });
    postC = await createPost(c, { content: `de c ${word}`, gameId });
    await ok('POST', `/posts/${postB}/repost`, c);
    await ok('POST', `/posts/${postA}/repost`, c);
    quoteOfB = await createPost(c, { content: 'c cita b', quotedPostId: postB });
    quoteOfA = await createPost(c, { content: 'c cita a', quotedPostId: postA });

    // Conversa no post de c: a e b comentam; c responde b e alguém responde a resposta.
    commentA = await comment(a, postC, 'a comenta');
    commentB = await comment(b, postC, 'b comenta');
    replyToB = await comment(c, postC, 'c responde b', commentB);
    replyToReplyToB = await comment(a, postC, 'a responde c', replyToB);
    commentCOnB = await comment(c, postB, 'c comenta no post de b');

    // Notificações antigas, de antes do bloqueio, nos dois sentidos.
    await ok('POST', `/posts/${postA}/like`, b);
    await ok('POST', `/posts/${postB}/like`, a);
    // Curtidos e salvos de a com o post de b.
    await ok('POST', `/posts/${postB}/bookmark`, a);
    await ok('POST', `/posts/${postA}/bookmark`, b);

    await ok('POST', `/users/${b.user.id}/block`, a);
  });

  it('For you feed hides the other side posts and reposts of them, for both sides', async () => {
    const forA = await feed(a, 'general');
    assert.ok(!forA.includes(postB));
    assert.ok(!forA.includes(`${postB}<-${c.user.id}`));
    assert.ok(forA.includes(postC));
    assert.ok(forA.includes(`${postA}<-${c.user.id}`));
    const forB = await feed(b, 'general');
    assert.ok(!forB.includes(postA));
    assert.ok(!forB.includes(`${postA}<-${c.user.id}`));
    assert.ok(forB.includes(`${postB}<-${c.user.id}`));
  });

  it('Following feed hides them too', async () => {
    const forA = await feed(a, 'following');
    assert.ok(forA.includes(postC));
    assert.ok(forA.includes(postA));
    assert.ok(!forA.includes(postB));
    assert.ok(!forA.includes(`${postB}<-${c.user.id}`));
    const forB = await feed(b, 'following');
    assert.ok(!forB.includes(postA));
    assert.ok(!forB.includes(`${postA}<-${c.user.id}`));
  });

  it('a quote of the other side renders as removed, everywhere a post is hydrated', async () => {
    const items = (await ok('GET', '/feed?scope=general&limit=50', a)).items as Json[];
    const quote = items.find((p) => p.id === quoteOfB)!;
    assert.ok(quote, 'a citação de c continua no feed');
    assert.equal(quote.quotedPost, null);
    assert.equal(quote.quotedPostId, null);
    assert.equal(quote.quotedPostRemoved, true);
    // Link direto da citação e o perfil de c.
    const direct = await ok('GET', `/posts/${quoteOfB}`, a);
    assert.equal(direct.quotedPost, null);
    assert.equal(direct.quotedPostRemoved, true);
    // Simétrico: b não vê a citação de a.
    const forB = await ok('GET', `/posts/${quoteOfA}`, b);
    assert.equal(forB.quotedPost, null);
    assert.equal(forB.quotedPostRemoved, true);
    // Quem não tem bloqueio vê a citação normal.
    const forC = await ok('GET', `/posts/${quoteOfB}`, c);
    assert.equal(forC.quotedPost.id, postB);
    assert.equal(forC.quotedPostRemoved, false);
  });

  it("a third party's profile hides reposts of the other side", async () => {
    const forA = keys(await userPosts(a, c));
    assert.ok(!forA.includes(`${postB}<-${c.user.id}`));
    assert.ok(forA.includes(`${postA}<-${c.user.id}`));
    assert.ok(forA.includes(postC));
    const forB = keys(await userPosts(b, c));
    assert.ok(!forB.includes(`${postA}<-${c.user.id}`));
    assert.ok(forB.includes(`${postB}<-${c.user.id}`));
  });

  it('thread comments of the other side disappear with their whole subtree', async () => {
    const forA = await commentIds(a, postC);
    assert.deepEqual(forA, [commentA]);
    const forB = await commentIds(b, postC);
    // b vê o próprio comentário e a resposta de c; a resposta de a (bloqueado) some.
    assert.deepEqual(forB, [commentB, replyToB]);
    const forC = await commentIds(c, postC);
    assert.deepEqual(forC.sort(), [commentA, commentB, replyToB, replyToReplyToB].sort());
  });

  it("a third party's comments tab hides comments on the other side's posts", async () => {
    const forA = ((await ok('GET', `/users/${c.user.id}/comments?limit=50`, a)).items as Json[]).map((i) => i.id);
    assert.ok(!forA.includes(commentCOnB));
    assert.ok(forA.includes(replyToB));
    const forC = ((await ok('GET', `/users/${c.user.id}/comments?limit=50`, c)).items as Json[]).map((i) => i.id);
    assert.ok(forC.includes(commentCOnB));
  });

  it('post search hides the other side', async () => {
    assert.deepEqual((await searchPosts(a, word)).sort(), [postA, postC].sort());
    assert.deepEqual((await searchPosts(b, word)).sort(), [postB, postC].sort());
    assert.deepEqual((await searchPosts(c, word)).sort(), [postA, postB, postC].sort());
  });

  it('game posts hide the other side', async () => {
    const forA = ((await ok('GET', `/games/${gameId}/posts?limit=50`, a)).items as Json[]).map((p) => p.id);
    assert.ok(forA.includes(postA) && forA.includes(postC));
    assert.ok(!forA.includes(postB));
    const forB = ((await ok('GET', `/games/${gameId}/posts?limit=50`, b)).items as Json[]).map((p) => p.id);
    assert.ok(!forB.includes(postA));
  });

  it('people search hides the other side', async () => {
    assert.deepEqual(await searchUsers(a, b.user.username), []);
    assert.deepEqual(await searchUsers(b, a.user.username), []);
    assert.deepEqual(await searchUsers(c, b.user.username), [b.user.id]);
  });

  it('followers lists hide the other side', async () => {
    const forA = ((await ok('GET', `/users/${c.user.id}/followers`, a)).items as Json[]).map((u) => u.id);
    assert.deepEqual(forA, [a.user.id]);
    const forC = ((await ok('GET', `/users/${c.user.id}/followers`, c)).items as Json[]).map((u) => u.id);
    assert.deepEqual(forC.sort(), [a.user.id, b.user.id].sort());
  });

  it('likes and bookmarks lists hide the other side posts', async () => {
    const liked = ((await ok('GET', '/users/me/likes?limit=50', a)).items as Json[]).map((p) => p.id);
    assert.ok(!liked.includes(postB));
    const savedA = ((await ok('GET', '/users/me/bookmarks?limit=50', a)).items as Json[]).map((p) => p.id);
    assert.ok(!savedA.includes(postB));
    const savedB = ((await ok('GET', '/users/me/bookmarks?limit=50', b)).items as Json[]).map((p) => p.id);
    assert.ok(!savedB.includes(postA));
  });

  it('notifications from the other side disappear (old ones and new ones), also from the unread count', async () => {
    const before = await notifications(a);
    assert.ok(!actorsOf(before).includes(b.user.id));
    assert.ok(!actorsOf(await notifications(b)).includes(a.user.id));
    // Uma ação nova do outro lado durante o bloqueio não notifica (interagir com o post é recusado;
    // mencionar continua possível, e a menção não vira notificação).
    await createPost(b, { content: `oi @${a.user.username}` });
    const afterComment = await notifications(a);
    assert.ok(!actorsOf(afterComment).includes(b.user.id));
    assert.equal(afterComment.unreadCount, before.unreadCount);
    assert.equal(afterComment.unreadCount, (afterComment.items as Json[]).filter((n) => !n.read).length);
  });

  it('unblocking restores everything except the follows', async () => {
    await ok('DELETE', `/users/${b.user.id}/block`, a);
    const forA = await feed(a, 'general');
    assert.ok(forA.includes(postB));
    assert.ok(forA.includes(`${postB}<-${c.user.id}`));
    assert.ok((await feed(b, 'general')).includes(postA));
    assert.equal((await ok('GET', `/posts/${quoteOfB}`, a)).quotedPost.id, postB);
    assert.deepEqual((await commentIds(a, postC)).sort(), [commentA, commentB, replyToB, replyToReplyToB].sort());
    assert.deepEqual((await searchPosts(a, word)).sort(), [postA, postB, postC].sort());
    assert.deepEqual(await searchUsers(a, b.user.username), [b.user.id]);
    assert.ok(actorsOf(await notifications(a)).includes(b.user.id));
    assert.ok(((await ok('GET', '/users/me/likes?limit=50', a)).items as Json[]).some((p) => p.id === postB));
    assert.equal(await follows_(a, b), false);
    assert.equal(await follows_(b, a), false);
    // Seguindo de a: b não volta, porque o follow não foi refeito.
    assert.ok(!(await feed(a, 'following')).includes(postB));
  });
});

describe('mute is one-sided and silent', () => {
  // m silencia x; y é um terceiro.
  let m: TestUser;
  let x: TestUser;
  let y: TestUser;
  const word = `mudo${randomUUID().slice(0, 6)}`;
  let postX: string;
  let postY: string;
  let postM: string;
  let quoteOfX: string;
  let commentX: string;

  before(async () => {
    m = await registerUser(api.http, 'mum');
    x = await registerUser(api.http, 'mux');
    y = await registerUser(api.http, 'muy');
    for (const [from, to] of [
      [m, x],
      [m, y],
      [x, m],
    ] as const) {
      await ok('POST', `/users/${to.user.id}/follow`, from);
    }
    postX = await createPost(x, { content: `de x ${word}` });
    postY = await createPost(y, { content: `de y ${word}` });
    postM = await createPost(m, { content: `de m ${word}` });
    await ok('POST', `/posts/${postX}/repost`, y);
    await ok('POST', `/posts/${postX}/repost`, x);
    await ok('POST', `/posts/${postY}/repost`, x);
    quoteOfX = await createPost(y, { content: 'y cita x', quotedPostId: postX });
    commentX = await comment(x, postY, 'x comenta no post de y');
    // Notificação antiga, de antes do silêncio.
    await ok('POST', `/posts/${postM}/like`, x);

    await ok('POST', `/users/${x.user.id}/mute`, m);
  });

  it('the muter stops seeing the muted posts and reposts in both feeds', async () => {
    for (const scope of ['following', 'general'] as const) {
      const items = await feed(m, scope);
      assert.ok(!items.includes(postX), scope);
      assert.ok(!items.includes(`${postX}<-${y.user.id}`), scope);
      assert.ok(!items.includes(`${postX}<-${x.user.id}`), scope);
      assert.ok(!items.includes(`${postY}<-${x.user.id}`), scope);
      assert.ok(items.includes(postY), scope);
      assert.ok(items.includes(postM), scope);
      assert.ok(items.includes(quoteOfX), scope);
    }
  });

  it('a quote of a muted person is still shown', async () => {
    const quote = await ok('GET', `/posts/${quoteOfX}`, m);
    assert.equal(quote.quotedPost.id, postX);
    assert.equal(quote.quotedPostRemoved, false);
  });

  it("a third party's profile hides reposts of the muted person", async () => {
    const items = keys(await userPosts(m, y));
    assert.ok(!items.includes(`${postX}<-${y.user.id}`));
    assert.ok(items.includes(postY));
  });

  it("the muted person's profile and direct links still work", async () => {
    const items = keys(await userPosts(m, x));
    assert.ok(items.includes(postX));
    assert.ok(items.includes(`${postX}<-${x.user.id}`));
    assert.ok(items.includes(`${postY}<-${x.user.id}`));
    assert.equal((await ok('GET', `/posts/${postX}`, m)).id, postX);
    assert.equal((await ok('GET', `/users/${x.user.id}`, m)).isMutedByMe, true);
    assert.ok((await commentIds(m, postY)).includes(commentX));
    assert.deepEqual(await searchUsers(m, x.user.username), [x.user.id]);
  });

  it('post search hides the muted person', async () => {
    assert.deepEqual((await searchPosts(m, word)).sort(), [postM, postY].sort());
  });

  it('the muted person sees nothing different', async () => {
    const forX = await feed(x, 'following');
    assert.ok(forX.includes(postM));
    assert.deepEqual((await searchPosts(x, word)).sort(), [postM, postX, postY].sort());
    assert.ok(keys(await userPosts(x, m)).includes(postM));
    assert.deepEqual(await searchUsers(x, m.user.username), [m.user.id]);
    const profile = await ok('GET', `/users/${m.user.id}`, x);
    assert.equal(profile.isMutedByMe, false);
    assert.equal(profile.blocksMe, false);
    assert.equal(profile.isBlockedByMe, false);
    // x continua podendo seguir/interagir, e m continua seguindo x.
    assert.equal(await status('POST', `/users/${m.user.id}/follow`, x), 204);
    assert.ok(await follows_(m, x));
  });

  it('the muter stops getting notifications from the muted person', async () => {
    const before = await notifications(m);
    assert.ok(!actorsOf(before).includes(x.user.id), 'a notificação antiga some');
    await comment(x, postM, 'x comenta no post de m');
    const after = await notifications(m);
    assert.ok(!actorsOf(after).includes(x.user.id));
    assert.equal(after.unreadCount, before.unreadCount);
    // A pessoa silenciada continua recebendo as notificações de quem a silenciou.
    await ok('POST', `/posts/${postX}/like`, m);
    assert.ok(actorsOf(await notifications(x)).includes(m.user.id));
  });

  it('unmuting restores the feeds and the old notifications', async () => {
    await ok('DELETE', `/users/${x.user.id}/mute`, m);
    const items = await feed(m, 'following');
    assert.ok(items.includes(postX));
    assert.ok(items.includes(`${postX}<-${y.user.id}`));
    assert.ok(actorsOf(await notifications(m)).includes(x.user.id));
  });
});

describe('interactions across a block are refused', () => {
  // a bloqueia b; c é um terceiro. Tudo vale nos dois sentidos.
  let a: TestUser;
  let b: TestUser;
  let c: TestUser;
  let postA: string;
  let postB: string;
  let postC: string;
  let commentA: string;
  let commentB: string;
  let gameId: string;

  const expectBlocked = async (method: string, p: string, user: TestUser, body?: unknown) => {
    const res = await send(method, p, user, body);
    assert.equal(res.status, 403, `${method} ${p}: ${res.status} ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error.code, 'blocked');
  };

  before(async () => {
    a = await registerUser(api.http, 'iba');
    b = await registerUser(api.http, 'ibb');
    c = await registerUser(api.http, 'ibc');
    gameId = (await db.query.games.findFirst({ where: eq(games.igdbId, 900001) }))!.id;
    postA = await createPost(a, { content: 'post de a' });
    postB = await createPost(b, { content: 'post de b' });
    postC = await createPost(c, { content: 'post de c' });
    commentA = await comment(a, postC, 'a comenta no post de c');
    commentB = await comment(b, postC, 'b comenta no post de c');
    // Antes do bloqueio: a curtiu, repostou e salvou o post de b (desfazer continua valendo).
    await ok('POST', `/posts/${postB}/like`, a);
    await ok('POST', `/posts/${postB}/repost`, a);
    await ok('POST', `/posts/${postB}/bookmark`, a);
    // Os dois estão jogando o mesmo jogo.
    await ok('POST', '/game-entries', a, { igdbId: 900001, platform: 'PC', status: 'playing' });
    await ok('POST', '/game-entries', b, { igdbId: 900001, platform: 'PC', status: 'playing' });
    await ok('POST', `/users/${b.user.id}/block`, a);
  });

  it("a direct link to the other side's post is 404, for both sides", async () => {
    assert.equal(await status('GET', `/posts/${postB}`, a), 404);
    assert.equal(await status('GET', `/posts/${postA}`, b), 404);
    assert.equal(await status('GET', `/posts/${postB}`, c), 200);
    assert.equal(await status('GET', `/posts/${postA}`, a), 200);
  });

  it("liking, reposting and bookmarking the other side's post is 403 blocked", async () => {
    for (const [user, post] of [
      [a, postB],
      [b, postA],
    ] as const) {
      for (const action of ['like', 'repost', 'bookmark']) await expectBlocked('POST', `/posts/${post}/${action}`, user);
    }
  });

  it('undoing an earlier like, repost or bookmark still works', async () => {
    for (const action of ['like', 'repost', 'bookmark']) {
      assert.equal(await status('DELETE', `/posts/${postB}/${action}`, a), 204);
    }
  });

  it("commenting on the other side's post is 403 blocked", async () => {
    await expectBlocked('POST', `/posts/${postB}/comments`, a, { content: 'oi' });
    await expectBlocked('POST', `/posts/${postA}/comments`, b, { content: 'oi' });
  });

  it("replying to the other side's comment is 403 blocked; a third party's thread still accepts comments", async () => {
    await expectBlocked('POST', `/posts/${postC}/comments`, a, { content: 'resposta', parentCommentId: commentB });
    await expectBlocked('POST', `/posts/${postC}/comments`, b, { content: 'resposta', parentCommentId: commentA });
    assert.equal((await send('POST', `/posts/${postC}/comments`, a, { content: 'no post de c' })).status, 201);
  });

  it("quoting the other side's post is 403 blocked", async () => {
    await expectBlocked('POST', '/posts', a, { content: 'citação', quotedPostId: postB });
    await expectBlocked('POST', '/posts', b, { content: 'citação', quotedPostId: postA });
    assert.equal((await send('POST', '/posts', c, { content: 'citação', quotedPostId: postB })).status, 201);
  });

  it("the game players list hides the other side", async () => {
    const players = async (user: TestUser) =>
      ((await ok('GET', `/games/${gameId}/players?status=playing&limit=20`, user)) as unknown as Json[]).map((p) => p.user.id);
    const forA = await players(a);
    assert.ok(forA.includes(a.user.id));
    assert.ok(!forA.includes(b.user.id));
    assert.ok(!(await players(b)).includes(a.user.id));
    const forC = await players(c);
    assert.ok(forC.includes(a.user.id) && forC.includes(b.user.id));
  });

  it('a block row created behind the service still refuses the follow (single-statement insert)', async () => {
    // Bloqueio gravado direto no banco, sem passar pelo serviço que apaga os follows.
    await db.insert(blocks).values({ blockerId: c.user.id, blockedId: b.user.id });
    await expectBlocked('POST', `/users/${c.user.id}/follow`, b);
    await expectBlocked('POST', `/users/${b.user.id}/follow`, c);
    assert.equal(await follows_(b, c), false);
    assert.equal(await follows_(c, b), false);
    await db.delete(blocks).where(and(eq(blocks.blockerId, c.user.id), eq(blocks.blockedId, b.user.id)));
    assert.equal(await status('POST', `/users/${c.user.id}/follow`, b), 204);
    assert.equal(await status('POST', `/users/${c.user.id}/follow`, b), 204);
    assert.ok(await follows_(b, c));
  });

  it('unblocking allows every interaction again', async () => {
    await ok('DELETE', `/users/${b.user.id}/block`, a);
    assert.equal(await status('GET', `/posts/${postB}`, a), 200);
    for (const action of ['like', 'repost', 'bookmark']) {
      assert.equal(await status('POST', `/posts/${postB}/${action}`, a), 204);
    }
    assert.equal((await send('POST', `/posts/${postA}/comments`, b, { content: 'oi' })).status, 201);
    assert.equal(
      (await send('POST', `/posts/${postC}/comments`, a, { content: 'resposta', parentCommentId: commentB })).status,
      201,
    );
    assert.equal((await send('POST', '/posts', b, { content: 'citação', quotedPostId: postA })).status, 201);
  });
});
