// PATCH /users/me e uploads de avatar e banner.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

/** PNG de verdade (cor sólida), gerado sem dependências. */
function png(w: number, h: number): Buffer {
  const crc = (buf: Buffer) => {
    let crcv = ~0;
    for (const b of buf) {
      let c = (crcv ^ b) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcv = (crcv >>> 8) ^ c;
    }
    return ~crcv >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x80)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function upload(field: string, bytes: Buffer, type: string, name = 'f.png'): FormData {
  const f = new FormData();
  f.append(field, new Blob([new Uint8Array(bytes)], { type }), name);
  return f;
}

describe('profile and uploads', () => {
  let api: TestApi;
  let a: TestUser;
  let b: TestUser;

  const me = async (u: TestUser = a) => (await api.http('GET', '/auth/me', u.accessToken)).body;
  const post = (path: string, u: TestUser | null, form: FormData) => api.http('POST', path, u?.accessToken ?? null, undefined, form);

  before(async () => {
    api = await startApi();
    a = await registerUser(api.http, 'pa');
    b = await registerUser(api.http, 'pb');
  });
  after(() => api.close());

  it('PATCH {} is valid and does not change nothing', async () => {
    assert.equal((await api.http('PATCH', '/users/me', a.accessToken, {})).status, 204);
  });

  it('changes only the that was sent', async () => {
    assert.equal((await api.http('PATCH', '/users/me', a.accessToken, { bio: 'Olá' })).status, 204);
    const m = await me();
    assert.equal(m.bio, 'Olá');
    assert.equal(m.name, 'pa');
  });

  it('bio empty clears the bio', async () => {
    assert.equal((await api.http('PATCH', '/users/me', a.accessToken, { bio: '' })).status, 204);
    assert.ok(!(await me()).bio);
  });

  it('username repeated returns 409 and does not changes nothing', async () => {
    const r = await api.http('PATCH', '/users/me', a.accessToken, { username: b.user.username, name: 'Outro' });
    assert.equal(r.status, 409);
    assert.equal((await me()).name, 'pa');
  });

  it('keep the own username is not conflict', async () => {
    assert.equal((await api.http('PATCH', '/users/me', a.accessToken, { username: a.user.username })).status, 204);
  });

  it('two simultaneous changes for the same username: one wins (204), the other is 409 (never 500)', async () => {
    const target = `race_${Date.now().toString(36)}`;
    const results = await Promise.all([a, b].map((u) => api.http('PATCH', '/users/me', u.accessToken, { username: target })));
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [204, 409], `recebeu ${statuses}`);
  });

  it('limit validation (bio 281, short/invalid username, empty name)', async () => {
    for (const body of [{ bio: 'x'.repeat(281) }, { username: 'ab' }, { username: 'com espaço' }, { name: '' }]) {
      assert.equal((await api.http('PATCH', '/users/me', a.accessToken, body)).status, 400, JSON.stringify(body).slice(0, 40));
    }
  });

  it('avatar valid: returns URL, becomes JPEG and appears in /auth/me', async () => {
    const r = await post('/users/me/avatar', a, upload('avatar', png(900, 300), 'image/png'));
    assert.equal(r.status, 200);
    assert.match(r.body.avatarUrl, /\/uploads\/avatars\/.+\.jpg$/);
    const img = await fetch(r.body.avatarUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');
    assert.equal((await me()).avatarUrl, r.body.avatarUrl);
  });

  it('banner valid: returns URL in /uploads/banners', async () => {
    const r = await post('/users/me/banner', a, upload('banner', png(600, 600), 'image/png'));
    assert.equal(r.status, 200);
    assert.match(r.body.bannerUrl, /\/uploads\/banners\/.+\.jpg$/);
  });

  it('switch the avatar deletes the file old and returns another URL', async () => {
    const first = (await me()).avatarUrl;
    const r = await post('/users/me/avatar', a, upload('avatar', png(50, 50), 'image/png'));
    assert.notEqual(r.body.avatarUrl, first);
    await new Promise((res) => setTimeout(res, 200));
    assert.equal((await fetch(first)).status, 404, 'arquivo antigo removido');
  });

  it('the non-image file (MIME) is 400', async () => {
    const r = await post('/users/me/avatar', a, upload('avatar', Buffer.from('texto'), 'text/plain', 'a.txt'));
    assert.equal(r.status, 400);
  });

  it('corrupted bytes with an image MIME are 400 (not 500)', async () => {
    const r = await post('/users/me/avatar', a, upload('avatar', Buffer.from('isto nao e um png'), 'image/png'));
    assert.equal(r.status, 400, `recebeu ${r.status} ${JSON.stringify(r.body)}`);
    assert.equal(r.body.error.code, 'validation_error');
  });

  it('missing file is 400', async () => {
    assert.equal((await post('/users/me/avatar', a, new FormData())).status, 400);
  });

  it('file above 8 MiB is 400', async () => {
    const big = Buffer.concat([png(10, 10), Buffer.alloc(9 * 1024 * 1024)]);
    assert.equal((await post('/users/me/avatar', a, upload('avatar', big, 'image/png'))).status, 400);
  });

  it('field with the wrong name is 400', async () => {
    assert.equal((await post('/users/me/avatar', a, upload('foto', png(10, 10), 'image/png'))).status, 400);
  });

  it('upload without authentication: 401', async () => {
    assert.equal((await post('/users/me/avatar', null, upload('avatar', png(10, 10), 'image/png'))).status, 401);
  });
});
