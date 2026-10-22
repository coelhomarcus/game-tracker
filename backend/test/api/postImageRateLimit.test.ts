// Limite de envios de imagem de post por usuário (POST_IMAGE_RATE_LIMIT_MAX, lido a cada requisição).
// Fica em arquivo próprio porque cada arquivo de teste roda em um processo separado: o limite baixo
// daqui não pode afetar as outras suítes, e o contador em memória começa zerado.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { registerUser, type TestUser } from '../helpers/client';
import { png, upload } from '../helpers/image';
import { startApi, type TestApi } from '../helpers/server';

describe('POST /posts/images rate limit', () => {
  let api: TestApi;
  let a: TestUser;
  let b: TestUser;
  const LIMIT = 3;

  const send = (user: TestUser | null) =>
    api.http('POST', '/posts/images', user?.accessToken ?? null, undefined, upload('image', png(8, 8), 'image/png'));

  before(async () => {
    process.env.POST_IMAGE_RATE_LIMIT_MAX = String(LIMIT);
    api = await startApi();
    a = await registerUser(api.http, 'rla');
    b = await registerUser(api.http, 'rlb');
  });
  after(async () => {
    delete process.env.POST_IMAGE_RATE_LIMIT_MAX;
    await api.close();
  });

  it('answers 429 once a user passes the limit, with the standard error body', async () => {
    for (let i = 0; i < LIMIT; i++) assert.equal((await send(a)).status, 201, `envio ${i + 1}`);
    const blocked = await send(a);
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, 'rate_limited');
    assert.equal((await send(a)).status, 429);
  });

  it('counts per user: another account is not affected', async () => {
    assert.equal((await send(b)).status, 201);
  });

  it('requests without a token are refused with 401 and do not use up anyone quota', async () => {
    for (let i = 0; i < LIMIT + 1; i++) assert.equal((await send(null)).status, 401);
    assert.equal((await send(b)).status, 201);
  });

  it('does not limit the other post endpoints', async () => {
    for (let i = 0; i < LIMIT + 2; i++) {
      assert.equal((await api.http('POST', '/posts', a.accessToken, { content: `post ${i}` })).status, 201);
    }
  });
});
