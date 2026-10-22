// Reposts, salvos, citações, imagens de post e exclusão de posts e comentários.
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { bookmarks, commentLikes, comments, likes, notifications, postImages, posts, reposts } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { png, upload } from '../helpers/image';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;

const send = (method: string, p: string, user: TestUser | null, body?: unknown, form?: FormData) =>
  api.http(method, p, user?.accessToken ?? null, body, form);

async function createPost(user: TestUser, body: Json): Promise<Json> {
  const res = await send('POST', '/posts', user, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function getPost(id: string, viewer: TestUser): Promise<Json> {
  const res = await send('GET', `/posts/${id}`, viewer);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

async function notificationsOf(user: TestUser, type: string): Promise<Json[]> {
  const res = await send('GET', '/notifications', user);
  return (res.body.items as Json[]).filter((n) => n.type === type);
}

/** Sobe uma imagem pela API e devolve `{ url, width, height }`. */
async function uploadImage(user: TestUser, w = 40, h = 30): Promise<Json> {
  const res = await send('POST', '/posts/images', user, undefined, upload('image', png(w, h), 'image/png'));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const fileOf = (url: string) => path.join(process.cwd(), 'uploads', 'posts', url.split('/').pop()!);

before(async () => {
  api = await startApi();
});
after(() => api.close());

describe('repost', () => {
  let author: TestUser;
  let b: TestUser;
  let postId: string;

  before(async () => {
    author = await registerUser(api.http, 'rpa');
    b = await registerUser(api.http, 'rpb');
    postId = (await createPost(author, { content: 'para repostar' })).id;
  });

  it('reposts, is idempotent, and notifies the author exactly once', async () => {
    assert.equal((await send('POST', `/posts/${postId}/repost`, b)).status, 204);
    assert.equal((await send('POST', `/posts/${postId}/repost`, b)).status, 204);
    const post = await getPost(postId, b);
    assert.equal(post.repostCount, 1);
    assert.equal(post.repostedByMe, true);
    assert.equal((await getPost(postId, author)).repostedByMe, false);

    const notes = await notificationsOf(author, 'repost');
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.actor.id, b.user.id);
    assert.equal(notes[0]!.postId, postId);
  });

  it('the repost shows in the feed of a follower with the reason', async () => {
    const follower = await registerUser(api.http, 'rpf');
    assert.equal((await send('POST', `/users/${b.user.id}/follow`, follower)).status, 204);
    const feed = (await send('GET', '/feed?limit=50', follower)).body;
    const item = (feed.items as Json[]).find((i) => i.id === postId);
    assert.ok(item, 'repost ausente do feed');
    assert.equal(item.reason.type, 'repost');
    assert.equal(item.reason.by.id, b.user.id);
  });

  it('unreposts, idempotently, and the post leaves the feed again', async () => {
    const follower = await registerUser(api.http, 'rpg');
    assert.equal((await send('POST', `/users/${b.user.id}/follow`, follower)).status, 204);
    assert.equal((await send('DELETE', `/posts/${postId}/repost`, b)).status, 204);
    assert.equal((await send('DELETE', `/posts/${postId}/repost`, b)).status, 204);
    const post = await getPost(postId, b);
    assert.equal(post.repostCount, 0);
    assert.equal(post.repostedByMe, false);
    const feed = (await send('GET', '/feed?limit=50', follower)).body;
    assert.equal((feed.items as Json[]).some((i) => i.id === postId), false);
  });

  it('a self-repost is allowed and never notifies', async () => {
    const own = (await createPost(author, { content: 'meu próprio' })).id;
    assert.equal((await send('POST', `/posts/${own}/repost`, author)).status, 204);
    assert.equal((await getPost(own, author)).repostCount, 1);
    const notes = (await notificationsOf(author, 'repost')).filter((n) => n.postId === own);
    assert.deepEqual(notes, []);
  });

  it('requires auth and a real post', async () => {
    assert.equal((await send('POST', `/posts/${postId}/repost`, null)).status, 401);
    assert.equal((await send('DELETE', `/posts/${postId}/repost`, null)).status, 401);
    assert.equal((await send('POST', `/posts/${randomUUID()}/repost`, b)).status, 404);
    assert.equal((await send('DELETE', `/posts/${randomUUID()}/repost`, b)).status, 404);
    assert.equal((await send('POST', '/posts/nao-e-uuid/repost', b)).status, 404);
  });
});

describe('bookmark', () => {
  let author: TestUser;
  let b: TestUser;
  let c: TestUser;
  let ids: string[];

  const list = (user: TestUser | null, query = '') => send('GET', `/users/me/bookmarks${query}`, user);

  before(async () => {
    author = await registerUser(api.http, 'bka');
    b = await registerUser(api.http, 'bkb');
    c = await registerUser(api.http, 'bkc');
    ids = [];
    for (const text of ['um', 'dois', 'três']) ids.push((await createPost(author, { content: text })).id);
  });

  it('bookmarks and unbookmarks idempotently, with counts and the viewer flag', async () => {
    const id = ids[0]!;
    assert.equal((await send('POST', `/posts/${id}/bookmark`, b)).status, 204);
    assert.equal((await send('POST', `/posts/${id}/bookmark`, b)).status, 204);
    const asB = await getPost(id, b);
    assert.equal(asB.bookmarkCount, 1);
    assert.equal(asB.bookmarkedByMe, true);
    assert.equal((await getPost(id, c)).bookmarkedByMe, false);

    assert.equal((await send('DELETE', `/posts/${id}/bookmark`, b)).status, 204);
    assert.equal((await send('DELETE', `/posts/${id}/bookmark`, b)).status, 204);
    const after = await getPost(id, b);
    assert.equal(after.bookmarkCount, 0);
    assert.equal(after.bookmarkedByMe, false);
  });

  it('does not notify anyone', async () => {
    assert.equal((await send('POST', `/posts/${ids[1]}/bookmark`, c)).status, 204);
    assert.equal(await db.$count(notifications, eq(notifications.actorId, c.user.id)), 0);
    await send('DELETE', `/posts/${ids[1]}/bookmark`, c);
  });

  it('lists only my bookmarks, newest bookmark first, as full posts', async () => {
    const reader = await registerUser(api.http, 'bkr');
    // Salva fora da ordem de criação dos posts: 3º, 1º, 2º.
    for (const i of [2, 0, 1]) {
      assert.equal((await send('POST', `/posts/${ids[i]}/bookmark`, reader)).status, 204);
    }
    await send('POST', `/posts/${ids[0]}/bookmark`, c);
    const res = await list(reader);
    assert.equal(res.status, 200);
    assert.deepEqual((res.body.items as Json[]).map((p) => p.id), [ids[1], ids[0], ids[2]]);
    assert.equal(res.body.nextCursor, null);
    const first = res.body.items[0] as Json;
    for (const field of ['user', 'content', 'repostCount', 'quoteCount', 'bookmarkCount', 'bookmarkedByMe', 'repostedByMe', 'likedByMe', 'images', 'quotedPost']) {
      assert.ok(field in first, `campo ${field} sumiu`);
    }
    assert.equal(first.bookmarkedByMe, true);
    assert.equal(first.user.id, author.user.id);
    // Os salvos são privados: quem não salvou nada recebe uma lista vazia.
    assert.deepEqual((await list(await registerUser(api.http, 'bkn'))).body, { items: [], nextCursor: null });
  });

  it('pages with a cursor, without gaps or repeats, even within the same millisecond', async () => {
    const reader = await registerUser(api.http, 'bkp');
    for (const id of ids) assert.equal((await send('POST', `/posts/${id}/bookmark`, reader)).status, 204);
    // Os três salvos no mesmo milissegundo, só os microssegundos diferem.
    const stamps = ['2026-03-01 10:00:00.123100+00', '2026-03-01 10:00:00.123300+00', '2026-03-01 10:00:00.123200+00'];
    for (const [i, id] of ids.entries()) {
      await db.execute(
        sql`update bookmarks set created_at = ${stamps[i]}::timestamptz where post_id = ${id} and user_id = ${reader.user.id}`,
      );
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 6; i++) {
      const res: Json = await list(reader, `?limit=1${cursor ? `&cursor=${cursor}` : ''}`);
      assert.equal(res.status, 200);
      seen.push(...(res.body.items as Json[]).map((p) => p.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    assert.deepEqual(seen, [ids[1], ids[2], ids[0]]);
  });

  it('a bookmarked post that gets deleted disappears from the list', async () => {
    const reader = await registerUser(api.http, 'bkd');
    const doomed = (await createPost(author, { content: 'efêmero' })).id;
    await send('POST', `/posts/${doomed}/bookmark`, reader);
    assert.equal(((await list(reader)).body.items as Json[]).length, 1);
    assert.equal((await send('DELETE', `/posts/${doomed}`, author)).status, 204);
    assert.deepEqual((await list(reader)).body.items, []);
  });

  it('requires auth, a real post and a valid cursor', async () => {
    assert.equal((await send('POST', `/posts/${ids[0]}/bookmark`, null)).status, 401);
    assert.equal((await send('DELETE', `/posts/${ids[0]}/bookmark`, null)).status, 401);
    assert.equal((await list(null)).status, 401);
    assert.equal((await send('POST', `/posts/${randomUUID()}/bookmark`, b)).status, 404);
    assert.equal((await send('DELETE', `/posts/${randomUUID()}/bookmark`, b)).status, 404);
    const bad = await list(b, '?cursor=nao-e-um-cursor');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'validation_error');
    assert.equal((await list(b, '?limit=0')).status, 400);
  });
});

describe('quote posts', () => {
  let author: TestUser;
  let quoter: TestUser;
  let original: Json;

  before(async () => {
    author = await registerUser(api.http, 'qta');
    quoter = await registerUser(api.http, 'qtb');
    original = await createPost(author, { content: 'original a citar' });
  });

  it('creates a quote with the quoted summary, counts it and notifies the author', async () => {
    const quote = await createPost(quoter, { content: 'concordo', quotedPostId: original.id });
    assert.equal(quote.quotedPostId, original.id);
    assert.equal(quote.quotedPost.id, original.id);
    assert.equal(quote.quotedPost.content, 'original a citar');
    assert.equal(quote.quotedPost.user.id, author.user.id);
    assert.equal(quote.user.id, quoter.user.id);
    assert.equal(quote.repostCount, 0);

    assert.equal((await getPost(original.id, author)).quoteCount, 1);
    const notes = await notificationsOf(author, 'quote');
    assert.equal(notes.length, 1);
    assert.equal(notes[0]!.actor.id, quoter.user.id);
    // A notificação abre a citação, que é o post novo.
    assert.equal(notes[0]!.postId, quote.id);
  });

  it('a self-quote works and never notifies', async () => {
    const self = await createPost(author, { content: 'me citando', quotedPostId: original.id });
    assert.equal(self.quotedPost.id, original.id);
    assert.equal((await notificationsOf(author, 'quote')).some((n) => n.postId === self.id), false);
    assert.equal((await getPost(original.id, author)).quoteCount, 2);
  });

  it('rejects a quote of a post that does not exist or a malformed id', async () => {
    assert.equal((await send('POST', '/posts', quoter, { content: 'x', quotedPostId: randomUUID() })).status, 404);
    assert.equal((await send('POST', '/posts', quoter, { content: 'x', quotedPostId: 'abc' })).status, 400);
  });

  it('deleting the original leaves the quote with quotedPost null', async () => {
    const orig = await createPost(author, { content: 'vai sumir' });
    const quote = await createPost(quoter, { content: 'citação órfã', quotedPostId: orig.id });
    assert.equal((await send('DELETE', `/posts/${orig.id}`, author)).status, 204);
    const after = await getPost(quote.id, quoter);
    assert.equal(after.quotedPost, null);
    assert.equal(after.quotedPostId, null);
  });
});

describe('post images', () => {
  let user: TestUser;
  let other: TestUser;

  before(async () => {
    user = await registerUser(api.http, 'pia');
    other = await registerUser(api.http, 'pib');
  });

  it('uploads one image: JPEG under /uploads/posts, with the real size', async () => {
    const img = await uploadImage(user, 600, 300);
    assert.match(img.url, new RegExp(`^${api.baseUrl}/uploads/posts/[0-9a-f-]{36}\\.jpg$`));
    assert.equal(img.width, 600);
    assert.equal(img.height, 300);
    const res = await fetch(img.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Object.keys(img).sort(), ['height', 'url', 'width']);
  });

  it('resizes to at most 2000px on the long side, keeping the ratio', async () => {
    const wide = await uploadImage(user, 3000, 1500);
    assert.deepEqual([wide.width, wide.height], [2000, 1000]);
    const tall = await uploadImage(user, 800, 2400);
    assert.deepEqual([tall.width, tall.height], [667, 2000]);
  });

  it('rejects uploads without auth, without a file, wrong field, non-image and corrupt bytes', async () => {
    assert.equal((await send('POST', '/posts/images', null, undefined, upload('image', png(10, 10), 'image/png'))).status, 401);
    assert.equal((await send('POST', '/posts/images', user, undefined, new FormData())).status, 400);
    assert.equal((await send('POST', '/posts/images', user, undefined, upload('foto', png(10, 10), 'image/png'))).status, 400);
    assert.equal((await send('POST', '/posts/images', user, undefined, upload('image', Buffer.from('texto'), 'text/plain', 'a.txt'))).status, 400);
    assert.equal((await send('POST', '/posts/images', user, undefined, upload('image', Buffer.from('nao e png'), 'image/png'))).status, 400);
  });

  it('creates a post with images in the given order, and every read returns them', async () => {
    const [i1, i2, i3] = [await uploadImage(user, 40, 20), await uploadImage(user, 50, 25), await uploadImage(user, 60, 30)];
    const created = await createPost(user, {
      content: 'com fotos',
      images: [
        { url: i1.url, width: i1.width, height: i1.height, alt: 'primeira' },
        { url: i2.url, width: i2.width, height: i2.height },
        { url: i3.url, width: i3.width, height: i3.height, alt: 'terceira' },
      ],
    });
    const expected = [
      { url: i1.url, width: 40, height: 20, alt: 'primeira' },
      { url: i2.url, width: 50, height: 25, alt: null },
      { url: i3.url, width: 60, height: 30, alt: 'terceira' },
    ];
    assert.deepEqual(created.images, expected);
    assert.equal(created.imageUrl, i1.url);
    assert.deepEqual((await getPost(created.id, other)).images, expected);

    const rows = await db.select().from(postImages).where(eq(postImages.postId, created.id)).orderBy(postImages.position);
    assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);

    const profile = (await send('GET', `/users/${user.user.id}/posts?limit=50`, other)).body.items as Json[];
    assert.deepEqual(profile.find((p) => p.id === created.id)!.images, expected);
  });

  it('accepts exactly four images and rejects five', async () => {
    const img = await uploadImage(user);
    const entry = { url: img.url, width: img.width, height: img.height };
    const four = await createPost(user, { content: 'quatro', images: [entry, entry, entry, entry] });
    assert.equal(four.images.length, 4);
    const five = await send('POST', '/posts', user, { content: 'cinco', images: [entry, entry, entry, entry, entry] });
    assert.equal(five.status, 400);
    assert.equal(five.body.error.code, 'validation_error');
  });

  it('rejects image urls this API did not issue', async () => {
    const good = await uploadImage(user);
    const sized = { width: 10, height: 10 };
    const uuid = randomUUID();
    const foreign = [
      `https://evil.example/uploads/posts/${uuid}.jpg`,
      `${api.baseUrl.replace('127.0.0.1', 'localhost')}/uploads/posts/${uuid}.jpg`,
      `${api.baseUrl}/uploads/avatars/${uuid}.jpg`,
      `${api.baseUrl}/uploads/posts/../avatars/${uuid}.jpg`,
      `${api.baseUrl}/uploads/posts/${uuid}.jpg`, // formato certo, mas nunca emitida
      `${good.url}?x=1`,
      `${good.url}/extra`,
      `${api.baseUrl}/uploads/posts/${uuid}.png`,
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1.jpg',
      'nao-e-url',
    ];
    for (const url of foreign) {
      const res = await send('POST', '/posts', user, { content: 'x', images: [{ url, ...sized }] });
      assert.equal(res.status, 400, `aceitou ${url}`);
    }
    // Uma boa e uma estrangeira: o post inteiro é recusado e nada é criado.
    const mixed = await send('POST', '/posts', user, {
      content: 'misto',
      images: [
        { url: good.url, ...sized },
        { url: foreign[0], ...sized },
      ],
    });
    assert.equal(mixed.status, 400);
    assert.equal(await db.$count(posts, eq(posts.content, 'misto')), 0);
  });

  it('rejects bad sizes, an oversize alt, and imageUrl together with images', async () => {
    const img = await uploadImage(user);
    const entry = { url: img.url, width: img.width, height: img.height };
    assert.equal((await send('POST', '/posts', user, { content: 'x', images: [{ ...entry, width: 0 }] })).status, 400);
    assert.equal((await send('POST', '/posts', user, { content: 'x', images: [{ ...entry, alt: 'a'.repeat(1001) }] })).status, 400);
    assert.equal((await send('POST', '/posts', user, { content: 'x', imageUrl: img.url, images: [entry] })).status, 400);
  });

  it('an empty list is the same as no images', async () => {
    const none = await createPost(user, { content: 'sem fotos', images: [] });
    assert.deepEqual(none.images, []);
    assert.equal(none.imageUrl, null);
  });

  it('legacy imageUrl is accepted when it is an issued image, and becomes images[0] with a row', async () => {
    const img = await uploadImage(user, 40, 30);
    const legacy = await createPost(user, { content: 'legado', imageUrl: img.url });
    assert.equal(legacy.imageUrl, img.url);
    assert.deepEqual(legacy.images, [{ url: img.url, width: 40, height: 30, alt: null }]);
    const rows = await db.select().from(postImages).where(eq(postImages.postId, legacy.id));
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0]!.url, rows[0]!.position, rows[0]!.width, rows[0]!.height], [img.url, 0, 40, 30]);
    assert.deepEqual((await getPost(legacy.id, other)).images, legacy.images);
  });

  it('legacy imageUrl rejects any url this API did not issue', async () => {
    const good = await uploadImage(user);
    const uuid = randomUUID();
    for (const url of [
      'https://images.igdb.com/a.jpg',
      'https://evil.example/uploads/posts/' + uuid + '.jpg',
      `${api.baseUrl}/uploads/posts/${uuid}.jpg`, // formato certo, nunca emitida
      `${good.url}?x=1`,
      'nao-e-url',
    ]) {
      const res = await send('POST', '/posts', user, { content: 'legado ruim', imageUrl: url });
      assert.equal(res.status, 400, `aceitou ${url}`);
    }
    assert.equal(await db.$count(posts, eq(posts.content, 'legado ruim')), 0);
  });

  it('the file name check needs a literal dot before jpg', async () => {
    const good = await uploadImage(user);
    // Uma cópia com "X" no lugar do ponto existe de fato no disco: só a regex a recusa.
    const sibling = fileOf(good.url).replace(/.jpg$/, 'Xjpg');
    fs.copyFileSync(fileOf(good.url), sibling);
    try {
      const url = good.url.replace(/.jpg$/, 'Xjpg');
      assert.equal((await send('POST', '/posts', user, { content: 'ponto', images: [{ url, width: 10, height: 10 }] })).status, 400);
      assert.equal((await send('POST', '/posts', user, { content: 'ponto', imageUrl: url })).status, 400);
    } finally {
      fs.rmSync(sibling, { force: true });
    }
  });
});

describe('delete post', () => {
  let author: TestUser;
  let b: TestUser;

  before(async () => {
    author = await registerUser(api.http, 'dpa');
    b = await registerUser(api.http, 'dpb');
  });

  it('only the author deletes: 403 for others, 404 when missing, 401 without auth', async () => {
    const post = await createPost(author, { content: 'protegido' });
    assert.equal((await send('DELETE', `/posts/${post.id}`, b)).status, 403);
    assert.equal((await getPost(post.id, author)).id, post.id);
    assert.equal((await send('DELETE', `/posts/${post.id}`, null)).status, 401);
    assert.equal((await send('DELETE', `/posts/${randomUUID()}`, author)).status, 404);
    assert.equal((await send('DELETE', '/posts/nao-e-uuid', author)).status, 404);
    assert.equal((await send('DELETE', `/posts/${post.id}`, author)).status, 204);
    assert.equal((await send('GET', `/posts/${post.id}`, author)).status, 404);
    assert.equal((await send('DELETE', `/posts/${post.id}`, author)).status, 404);
  });

  it('removes everything that hangs from the post', async () => {
    const img = await uploadImage(author);
    const post = await createPost(author, {
      content: 'cheio',
      images: [{ url: img.url, width: img.width, height: img.height }],
    });
    await send('POST', `/posts/${post.id}/like`, b);
    const comment = (await send('POST', `/posts/${post.id}/comments`, b, { content: 'oi' })).body;
    await send('POST', `/comments/${comment.id}/like`, author);
    await send('POST', `/posts/${post.id}/repost`, b);
    await send('POST', `/posts/${post.id}/bookmark`, b);
    const quote = await createPost(b, { content: 'citando', quotedPostId: post.id });

    assert.equal((await send('DELETE', `/posts/${post.id}`, author)).status, 204);

    assert.equal(await db.$count(likes, eq(likes.postId, post.id)), 0);
    assert.equal(await db.$count(comments, eq(comments.postId, post.id)), 0);
    assert.equal(await db.$count(commentLikes, eq(commentLikes.commentId, comment.id)), 0);
    assert.equal(await db.$count(reposts, eq(reposts.postId, post.id)), 0);
    assert.equal(await db.$count(bookmarks, eq(bookmarks.postId, post.id)), 0);
    assert.equal(await db.$count(postImages, eq(postImages.postId, post.id)), 0);
    assert.equal(await db.$count(notifications, eq(notifications.postId, post.id)), 0);
    // A citação sobrevive, só perde a referência.
    assert.equal((await getPost(quote.id, b)).quotedPost, null);
    // O arquivo da imagem some junto.
    assert.equal(fs.existsSync(fileOf(img.url)), false);
  });

  it('keeps an image file that another post still uses', async () => {
    const img = await uploadImage(author);
    const entry = { url: img.url, width: img.width, height: img.height };
    const first = await createPost(author, { content: 'a', images: [entry] });
    const second = await createPost(author, { content: 'b', images: [entry] });
    assert.equal((await send('DELETE', `/posts/${first.id}`, author)).status, 204);
    assert.equal(fs.existsSync(fileOf(img.url)), true);
    assert.equal((await fetch(img.url)).status, 200);
    assert.equal((await send('DELETE', `/posts/${second.id}`, author)).status, 204);
    assert.equal(fs.existsSync(fileOf(img.url)), false);
  });
});

describe('delete comment', () => {
  let author: TestUser;
  let commenter: TestUser;
  let other: TestUser;
  let postId: string;

  const addComment = async (user: TestUser, content: string, parentCommentId?: string) => {
    const res = await send('POST', `/posts/${postId}/comments`, user, { content, parentCommentId });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.id as string;
  };

  before(async () => {
    author = await registerUser(api.http, 'dca');
    commenter = await registerUser(api.http, 'dcb');
    other = await registerUser(api.http, 'dcc');
    postId = (await createPost(author, { content: 'comentado' })).id;
  });

  it('only the comment author deletes it (even the post author cannot)', async () => {
    const id = await addComment(commenter, 'meu');
    assert.equal((await send('DELETE', `/comments/${id}`, other)).status, 403);
    assert.equal((await send('DELETE', `/comments/${id}`, author)).status, 403);
    assert.equal((await send('DELETE', `/comments/${id}`, null)).status, 401);
    assert.equal(await db.$count(comments, eq(comments.id, id)), 1);
    assert.equal((await send('DELETE', `/comments/${id}`, commenter)).status, 204);
    assert.equal(await db.$count(comments, eq(comments.id, id)), 0);
    assert.equal((await send('DELETE', `/comments/${id}`, commenter)).status, 404);
  });

  it('is 404 for an unknown or malformed id', async () => {
    assert.equal((await send('DELETE', `/comments/${randomUUID()}`, commenter)).status, 404);
    assert.equal((await send('DELETE', '/comments/nao-e-uuid', commenter)).status, 404);
  });

  it('cascades to the replies at every depth, and the count drops', async () => {
    const before = (await getPost(postId, author)).commentCount;
    const root = await addComment(commenter, 'raiz');
    const reply = await addComment(other, 'resposta', root);
    const deep = await addComment(author, 'resposta da resposta', reply);
    const sibling = await addComment(other, 'irmão');
    assert.equal((await getPost(postId, author)).commentCount, before + 4);

    assert.equal((await send('DELETE', `/comments/${root}`, commenter)).status, 204);

    assert.equal(await db.$count(comments, inArray(comments.id, [root, reply, deep])), 0);
    assert.equal(await db.$count(comments, eq(comments.id, sibling)), 1);
    assert.equal((await getPost(postId, author)).commentCount, before + 1);
    const tree = (await send('GET', `/posts/${postId}/comments`, author)).body as Json[];
    assert.equal(tree.some((c) => c.id === root), false);
  });
});
