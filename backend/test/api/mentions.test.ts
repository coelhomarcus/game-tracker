// Menções (@usuario), notificações de resposta e a ordenação dos comentários.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { db } from '../../src/db';
import { comments } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;

const send = (method: string, p: string, user: TestUser | null, body?: unknown) =>
  api.http(method, p, user?.accessToken ?? null, body);

async function createPost(user: TestUser, content: string): Promise<Json> {
  const res = await send('POST', '/posts', user, { content });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function comment(user: TestUser, postId: string, content: string, parentCommentId?: string): Promise<Json> {
  const res = await send('POST', `/posts/${postId}/comments`, user, { content, parentCommentId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function inbox(user: TestUser): Promise<any[]> {
  const res = await send('GET', '/notifications', user);
  assert.equal(res.status, 200);
  return res.body.items;
}

/** As notificações do usuário sobre um post, como `tipo:ator` (a ordem não importa). */
async function about(user: TestUser, postId: string): Promise<string[]> {
  return (await inbox(user)).filter((n) => n.postId === postId).map((n) => `${n.type}:${n.actor.username}`).sort();
}

before(async () => {
  api = await startApi();
});
after(() => api.close());

describe('mentions in posts', () => {
  let author: TestUser;
  let b: TestUser;
  let c: TestUser;

  before(async () => {
    author = await registerUser(api.http, 'mpa');
    b = await registerUser(api.http, 'mpb');
    c = await registerUser(api.http, 'mpc');
  });

  it('notifies each mentioned existing user once, with the post, an excerpt and no comment', async () => {
    const content = `oi @${b.user.username.toUpperCase()} e @${b.user.username} e @${c.user.username}!`;
    const post = await createPost(author, content);
    for (const user of [b, c]) {
      const found = (await inbox(user)).filter((n) => n.type === 'mention');
      assert.equal(found.length, 1);
      assert.equal(found[0].postId, post.id);
      assert.equal(found[0].commentId, null);
      assert.equal(found[0].excerpt, content);
      assert.equal(found[0].actor.id, author.user.id);
      assert.equal(found[0].read, false);
    }
  });

  it('ignores unknown usernames, emails and the author mentioning themselves', async () => {
    const before = (await inbox(author)).length;
    const post = await createPost(author, `@nao_existe_${Date.now()} e ${b.user.username}@example.com e @${author.user.username}`);
    assert.deepEqual(await about(b, post.id), []);
    assert.deepEqual(await about(author, post.id), []);
    assert.equal((await inbox(author)).length, before);
  });

  it('does not notify on a post without mentions', async () => {
    const post = await createPost(author, `falando do ${b.user.username} sem arroba`);
    assert.deepEqual(await about(b, post.id), []);
  });

  it('a quote that mentions the quoted author sends only the quote notification, and other mentions still go out', async () => {
    const original = await createPost(b, 'original');
    const res = await send('POST', '/posts', author, { content: `concordo @${b.user.username} e @${c.user.username}`, quotedPostId: original.id });
    assert.equal(res.status, 201);
    assert.deepEqual(await about(b, res.body.id), [`quote:${author.user.username}`]);
    assert.deepEqual(await about(c, res.body.id), [`mention:${author.user.username}`]);
  });
});

describe('comment and reply notifications', () => {
  let postAuthor: TestUser; // dono do post
  let b: TestUser; // autor do comentário raiz
  let c: TestUser; // quem responde
  let d: TestUser; // só é mencionado
  let post: Json;
  let root: Json;

  before(async () => {
    postAuthor = await registerUser(api.http, 'rna');
    b = await registerUser(api.http, 'rnb');
    c = await registerUser(api.http, 'rnc');
    d = await registerUser(api.http, 'rnd');
    post = await createPost(postAuthor, 'post para comentar');
    root = await comment(b, post.id, 'comentário raiz de b');
  });

  it('a top-level comment sends a comment notification to the post author, with comment id and excerpt', async () => {
    const mine = (await inbox(postAuthor)).filter((n) => n.type === 'comment');
    assert.equal(mine.length, 1);
    assert.equal(mine[0].commentId, root.id);
    assert.equal(mine[0].postId, post.id);
    assert.equal(mine[0].excerpt, 'comentário raiz de b');
  });

  it('a reply sends reply to the comment author and comment to the post author', async () => {
    const reply = await comment(c, post.id, 'respondendo b', root.id);
    const forB = (await inbox(b)).filter((n) => n.commentId === reply.id);
    assert.deepEqual(forB.map((n) => n.type), ['reply']);
    assert.equal(forB[0].excerpt, 'respondendo b');
    assert.equal(forB[0].postId, post.id);
    const forOwner = (await inbox(postAuthor)).filter((n) => n.commentId === reply.id);
    assert.deepEqual(forOwner.map((n) => n.type), ['comment']);
    assert.deepEqual((await inbox(c)).filter((n) => n.commentId === reply.id), []);
  });

  it('when the parent comment author is the post author, only reply is sent (no second comment)', async () => {
    const ownerComment = await comment(postAuthor, post.id, 'comentário do dono');
    const reply = await comment(c, post.id, 'respondendo o dono', ownerComment.id);
    const forOwner = (await inbox(postAuthor)).filter((n) => n.commentId === reply.id);
    assert.deepEqual(forOwner.map((n) => n.type), ['reply']);
  });

  it('a reply by the post author notifies only the parent comment author', async () => {
    const reply = await comment(postAuthor, post.id, 'dono responde b', root.id);
    assert.deepEqual((await inbox(b)).filter((n) => n.commentId === reply.id).map((n) => n.type), ['reply']);
    assert.deepEqual((await inbox(postAuthor)).filter((n) => n.commentId === reply.id), []);
  });

  it('replying to your own comment does not notify you, but the post author still hears it', async () => {
    const reply = await comment(b, post.id, 'b responde b', root.id);
    assert.deepEqual((await inbox(b)).filter((n) => n.commentId === reply.id), []);
    assert.deepEqual((await inbox(postAuthor)).filter((n) => n.commentId === reply.id).map((n) => n.type), ['comment']);
  });

  it('a nested reply notifies the direct parent, not the thread root', async () => {
    const level1 = await comment(c, post.id, 'nível 1', root.id);
    const level2 = await comment(d, post.id, 'nível 2', level1.id);
    assert.deepEqual((await inbox(c)).filter((n) => n.commentId === level2.id).map((n) => n.type), ['reply']);
    assert.deepEqual((await inbox(b)).filter((n) => n.commentId === level2.id), []);
  });

  it('a mention in a comment sends mention with the comment id and a single notification per person', async () => {
    const mentioned = await comment(c, post.id, `olhem isso @${d.user.username} @${d.user.username.toUpperCase()}`);
    const forD = (await inbox(d)).filter((n) => n.commentId === mentioned.id);
    assert.deepEqual(forD.map((n) => n.type), ['mention']);
    assert.equal(forD[0].postId, post.id);
    assert.equal(forD[0].excerpt, `olhem isso @${d.user.username} @${d.user.username.toUpperCase()}`);
  });

  it('whoever already gets comment or reply for this comment gets no extra mention', async () => {
    // Menciona o dono do post (que já recebe "comment") e o autor do pai (que já recebe "reply").
    const reply = await comment(c, post.id, `@${postAuthor.user.username} @${b.user.username} e @${d.user.username}`, root.id);
    assert.deepEqual((await inbox(postAuthor)).filter((n) => n.commentId === reply.id).map((n) => n.type), ['comment']);
    assert.deepEqual((await inbox(b)).filter((n) => n.commentId === reply.id).map((n) => n.type), ['reply']);
    assert.deepEqual((await inbox(d)).filter((n) => n.commentId === reply.id).map((n) => n.type), ['mention']);
  });

  it('mentioning yourself or an unknown user in a comment notifies nobody extra', async () => {
    const reply = await comment(d, post.id, `@${d.user.username} @fantasma_${Date.now()}`);
    assert.deepEqual((await inbox(d)).filter((n) => n.commentId === reply.id), []);
  });

  it('deleting the comment removes its notifications', async () => {
    const reply = await comment(c, post.id, 'vai sumir', root.id);
    assert.equal((await inbox(b)).filter((n) => n.commentId === reply.id).length, 1);
    assert.equal((await send('DELETE', `/comments/${reply.id}`, c)).status, 204);
    assert.equal((await inbox(b)).filter((n) => n.commentId === reply.id).length, 0);
  });

  it('rejects a parent comment from another post and creates nothing', async () => {
    const other = await createPost(postAuthor, 'outro post');
    const res = await send('POST', `/posts/${other.id}/comments`, c, { content: `@${d.user.username}`, parentCommentId: root.id });
    assert.equal(res.status, 400);
    assert.deepEqual(await about(d, other.id), []);
  });
});

describe('notification payload', () => {
  let a: TestUser;
  let b: TestUser;

  before(async () => {
    a = await registerUser(api.http, 'npa');
    b = await registerUser(api.http, 'npb');
  });

  it('truncates the excerpt to 120 characters and collapses whitespace', async () => {
    const post = await createPost(a, 'post');
    const long = `${'palavra '.repeat(40)}fim`;
    const c1 = await comment(b, post.id, long);
    const mine = (await inbox(a)).find((n) => n.commentId === c1.id)!;
    assert.ok(mine.excerpt.length <= 120, `excerpt com ${mine.excerpt.length}`);
    assert.ok(mine.excerpt.endsWith('…'));
    assert.ok(mine.excerpt.startsWith('palavra palavra'));

    const c2 = await comment(b, post.id, '  linha um\n\n   linha   dois  ');
    assert.equal((await inbox(a)).find((n) => n.commentId === c2.id)!.excerpt, 'linha um linha dois');

    const exact = 'x'.repeat(120);
    const c3 = await comment(b, post.id, exact);
    assert.equal((await inbox(a)).find((n) => n.commentId === c3.id)!.excerpt, exact);
  });

  it('cuts the excerpt by graphemes, never inside an emoji', async () => {
    const post = await createPost(a, 'post');
    const family = '👨‍👩‍👧';
    const c1 = await comment(b, post.id, `${'x'.repeat(118)}${family.repeat(5)}`);
    const cut = (await inbox(a)).find((n) => n.commentId === c1.id)!;
    assert.equal(cut.excerpt, `${'x'.repeat(118)}${family}…`);

    // 120 graphemes made of 2-code-point emoji still fit as they are.
    const exact = '👍🏽'.repeat(120);
    const c2 = await comment(b, post.id, exact);
    assert.equal((await inbox(a)).find((n) => n.commentId === c2.id)!.excerpt, exact);
  });

  it('post-based notifications carry the post text; follows carry none; existing fields stay', async () => {
    const post = await createPost(a, 'texto do post curtido');
    await send('POST', `/posts/${post.id}/like`, b);
    await send('POST', `/users/${a.user.id}/follow`, b);
    const items = await inbox(a);
    const like = items.find((n) => n.type === 'like' && n.postId === post.id)!;
    assert.equal(like.excerpt, 'texto do post curtido');
    assert.equal(like.commentId, null);
    const follow = items.find((n) => n.type === 'follow')!;
    assert.equal(follow.excerpt, null);
    assert.equal(follow.postId, null);
    assert.equal(follow.commentId, null);
    for (const field of ['id', 'userId', 'actorId', 'type', 'postId', 'read', 'createdAt', 'actor']) {
      assert.ok(field in like, `faltou ${field}`);
    }
    assert.deepEqual(Object.keys(like.actor).sort(), ['avatarUrl', 'id', 'name', 'username']);
    // Os dados auxiliares usados só para montar o trecho não vazam.
    assert.ok(!('comment' in like) && !('post' in like));
  });
});

describe('comment sorting', () => {
  let owner: TestUser;
  let likers: TestUser[];
  let post: Json;
  const ids: Record<string, string> = {};

  /** Um comentário com data fixa (segundos desde a base) e o número de curtidas dado. */
  async function make(name: string, secs: number, nLikes: number, parent?: string) {
    const created = await comment(owner, post.id, name, parent ? ids[parent] : undefined);
    ids[name] = created.id;
    await db.update(comments).set({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, secs)) }).where(eq(comments.id, created.id));
    for (const liker of likers.slice(0, nLikes)) assert.equal((await send('POST', `/comments/${created.id}/like`, liker)).status, 204);
  }

  const order = (nodes: any[]) => nodes.map((n) => n.content);
  const list = async (query = '') => {
    const res = await send('GET', `/posts/${post.id}/comments${query}`, owner);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body as any[];
  };

  before(async () => {
    owner = await registerUser(api.http, 'cso');
    likers = [await registerUser(api.http, 'csl'), await registerUser(api.http, 'csm'), await registerUser(api.http, 'csn')];
    post = await createPost(owner, 'post com muitos comentários');
    // Raízes: r1 (0 curtidas, mais antigo), r2 (2), r3 (1), r4 (2, mais novo que r2).
    await make('r1', 10, 0);
    await make('r2', 20, 2);
    await make('r3', 30, 1);
    await make('r4', 40, 2);
    // Respostas de r1: a (1), b (0), c (3). Uma resposta de uma resposta: a1 (0) e a2 (1) sob a.
    await make('a', 11, 1, 'r1');
    await make('b', 12, 0, 'r1');
    await make('c', 13, 3, 'r1');
    await make('a1', 14, 0, 'a');
    await make('a2', 15, 1, 'a');
  });

  it('defaults to oldest first, as before', async () => {
    const tree = await list();
    assert.deepEqual(order(tree), ['r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(order(tree[0].replies), ['a', 'b', 'c']);
    assert.deepEqual(order(tree), order(await list('?sort=oldest')));
  });

  it('sort=newest reverses every sibling group', async () => {
    const tree = await list('?sort=newest');
    assert.deepEqual(order(tree), ['r4', 'r3', 'r2', 'r1']);
    assert.deepEqual(order(tree[3].replies), ['c', 'b', 'a']);
    assert.deepEqual(order(tree[3].replies[2].replies), ['a2', 'a1']);
  });

  it('sort=top orders each sibling group by likes desc, then oldest', async () => {
    const tree = await list('?sort=top');
    assert.deepEqual(order(tree), ['r2', 'r4', 'r3', 'r1'], 'r2 e r4 empatam em 2; r2 é mais antigo');
    const r1 = tree[3];
    assert.deepEqual(order(r1.replies), ['c', 'a', 'b']);
    assert.deepEqual(order(r1.replies[1].replies), ['a2', 'a1']);
    assert.deepEqual(r1.replies.map((n: Json) => n.likeCount), [3, 1, 0]);
  });

  it('keeps the response shape: counts, likedByMe, nested replies', async () => {
    const tree = await list('?sort=top');
    const r2 = tree[0];
    assert.equal(r2.likeCount, 2);
    assert.equal(r2.likedByMe, false);
    assert.deepEqual(r2.replies, []);
    assert.equal(r2.user.id, owner.user.id);
    const asLiker = (await send('GET', `/posts/${post.id}/comments?sort=top`, likers[0]!)).body as any[];
    assert.equal(asLiker[0].likedByMe, true);
  });

  it('rejects an unknown sort and a non-uuid post id keeps its 404', async () => {
    assert.equal((await send('GET', `/posts/${post.id}/comments?sort=hot`, owner)).status, 400);
    assert.equal((await send('GET', '/posts/nao-e-uuid/comments?sort=top', owner)).status, 404);
  });
});

describe('mention cap', () => {
  let author: TestUser;
  let people: TestUser[];

  before(async () => {
    author = await registerUser(api.http, 'mcap');
    people = [];
    for (let i = 0; i < 12; i++) people.push(await registerUser(api.http, `mc${i}`));
  });

  const handle = (p: TestUser) => `@${p.user.username}`;

  it('notifies only the first 10 distinct mentions of a post', async () => {
    const post = await createPost(author, people.map(handle).join(' '));
    const got: boolean[] = [];
    for (const p of people) got.push((await about(p, post.id)).length > 0);
    assert.deepEqual(got, [...Array(10).fill(true), false, false]);
  });

  it('notifies only the first 10 distinct mentions of a comment', async () => {
    const post = await createPost(author, 'sem menções');
    const created = await comment(author, post.id, people.map(handle).join(' '));
    for (const [i, p] of people.entries()) {
      const mine = (await inbox(p)).filter((n) => n.commentId === created.id);
      assert.equal(mine.length, i < 10 ? 1 : 0, `usuário ${i}`);
    }
  });

  it('a repeated mention does not use up the cap', async () => {
    const repeated = people.slice(0, 9).map((p) => `${handle(p)} ${handle(p).toUpperCase()}`).join(' ');
    const post = await createPost(author, `${repeated} ${handle(people[9]!)} ${handle(people[10]!)}`);
    const got: boolean[] = [];
    for (const p of people) got.push((await about(p, post.id)).length > 0);
    assert.deepEqual(got, [...Array(10).fill(true), false, false]);
  });
});
