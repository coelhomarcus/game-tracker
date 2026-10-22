// GET /posts/search: busca por texto, escape de curingas, ordem e paginação.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;
let a: TestUser;
let b: TestUser;

const search = (user: TestUser | null, query: string) => api.http('GET', `/posts/search${query}`, user?.accessToken ?? null);
const q = (term: string, extra = '') => `?q=${encodeURIComponent(term)}${extra}`;
const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function createPost(user: TestUser, content: string, extra: Json = {}): Promise<Json> {
  const res = await api.http('POST', '/posts', user.accessToken, { content, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

const idsOf = (res: Json) => res.body.items.map((p: Json) => p.id);

before(async () => {
  api = await startApi();
  a = await registerUser(api.http, 'sra');
  b = await registerUser(api.http, 'srb');
});
after(() => api.close());

describe('GET /posts/search', () => {
  it('requires auth', async () => {
    assert.equal((await search(null, q('abc'))).status, 401);
  });

  it('validates q: missing, too short, too long, only blanks', async () => {
    for (const query of ['', '?q=', '?q=a', '?q=%20a%20', `?q=${'x'.repeat(101)}`, '?q=%20%20%20%20']) {
      const res = await search(a, query);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'validation_error', query);
    }
  });

  it('trims q before measuring it, and accepts 2 and 100 characters', async () => {
    assert.equal((await search(a, q('ab'))).status, 200);
    assert.equal((await search(a, q('x'.repeat(100)))).status, 200);
    assert.equal((await search(a, '?q=%20%20ab%20%20')).status, 200);
    assert.equal((await search(a, `?q=%20${'x'.repeat(100)}%20`)).status, 200);
  });

  it('finds posts by part of the text, ignoring case, with full post objects', async () => {
    const tag = unique('zebra');
    const mine = await createPost(a, `Jogando ${tag.toUpperCase()} hoje`);
    await createPost(b, 'nada a ver com isso');
    const res = await search(b, q(tag.slice(2, -1)));
    assert.equal(res.status, 200);
    assert.deepEqual(idsOf(res), [mine.id]);
    assert.equal(res.body.nextCursor, null);
    const item = res.body.items[0];
    for (const key of ['id', 'content', 'user', 'likeCount', 'commentCount', 'likedByMe', 'repostCount', 'repostedByMe', 'bookmarkedByMe', 'images', 'quotedPost', 'reason']) {
      assert.ok(key in item, `falta ${key}`);
    }
    assert.equal(item.user.id, a.user.id);
    assert.equal(item.reason, null);
    assert.equal(item.likedByMe, false);
  });

  it('is viewer aware (likedByMe) and finds quotes of other posts', async () => {
    const tag = unique('quotey');
    const original = await createPost(a, `original ${tag}`);
    assert.equal((await api.http('POST', `/posts/${original.id}/like`, b.accessToken)).status, 204);
    const quote = await createPost(b, `citando ${tag}`, { quotedPostId: original.id });
    const res = await search(b, q(tag));
    assert.deepEqual(idsOf(res), [quote.id, original.id]);
    assert.equal(res.body.items[0].quotedPost.id, original.id);
    assert.equal(res.body.items[1].likedByMe, true);
    assert.equal((await search(a, q(tag))).body.items[1].likedByMe, false);
  });

  it('treats % _ and \\ as literal characters', async () => {
    const tag = unique('esc');
    const pct = await createPost(a, `${tag} 100% certo`);
    const under = await createPost(a, `${tag} snake_case`);
    const slash = await createPost(a, `${tag} caminho a\\b`);
    const plain = await createPost(a, `${tag} 100x certo snakeXcase aXb`);
    const ids = async (term: string) => idsOf(await search(a, q(term)));
    assert.deepEqual(await ids(tag + ' 100%'), [pct.id]);
    assert.deepEqual(await ids(tag + ' snake_case'), [under.id]);
    assert.deepEqual(await ids(`${tag} caminho a\\b`), [slash.id]);
    assert.deepEqual(await ids(`${tag} caminho a\\`), [slash.id]);
    assert.deepEqual(await ids(tag + ' %%'), []);
    assert.deepEqual(await ids(tag + ' __'), []);
    assert.ok(!(await ids(tag + ' 100% c')).includes(plain.id));
    assert.deepEqual((await ids(`${tag} 100x`)), [plain.id]);
  });

  it('returns an empty page for a term that matches nothing', async () => {
    const res = await search(a, q(unique('nada-nada-')));
    assert.deepEqual(res.body, { items: [], nextCursor: null });
  });

  it('is newest first and pages by cursor with microsecond precision, never repeating or skipping', async () => {
    const tag = unique('micro');
    const made: Json[] = [];
    for (let i = 0; i < 5; i++) made.push(await createPost(a, `${tag} n${i}`));
    // Os cinco no mesmo milissegundo, diferenciados só pelos microssegundos (n2 o mais novo).
    const micros = [100, 400, 500, 300, 200];
    for (const [i, post] of made.entries()) {
      await db.execute(sql`update posts set created_at = ${`2030-01-01T00:00:00.123${micros[i]}Z`}::timestamptz where id = ${post.id}`);
    }
    const expected = [2, 1, 3, 4, 0].map((i) => made[i]!.id);

    assert.deepEqual(idsOf(await search(a, q(tag))), expected);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: Json = await search(a, q(tag, `&limit=1${cursor ? `&cursor=${cursor}` : ''}`));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.items.length, 1);
      seen.push(...idsOf(res));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    assert.deepEqual(seen, expected);
    assert.equal(pages, 5);
  });

  it('uses the page size and returns a null cursor on the last page', async () => {
    const tag = unique('sz');
    for (let i = 0; i < 5; i++) await createPost(a, `${tag} n${i}`);
    const full = idsOf(await search(a, q(tag)));
    assert.equal(full.length, 5);
    const first = await search(a, q(tag, '&limit=2'));
    assert.equal(first.body.items.length, 2);
    assert.ok(first.body.nextCursor);
    const last = await search(a, q(tag, '&limit=5'));
    assert.equal(last.body.items.length, 5);
    assert.equal(last.body.nextCursor, null);
  });

  it('rejects a malformed cursor, an impossible date and a bad limit', async () => {
    const impossible = Buffer.from(JSON.stringify({ at: '2026-02-30T00:00:00Z', id: '00000000-0000-4000-8000-000000000000', kind: 'post' })).toString('base64url');
    for (const extra of ['&cursor=nope', `&cursor=${impossible}`, '&limit=0', '&limit=51']) {
      assert.equal((await search(a, q('abc', extra))).status, 400, extra);
    }
  });
});
