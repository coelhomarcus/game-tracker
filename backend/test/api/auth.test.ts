// Sessão: refresh de uso único, rotação e a corrida de renovações simultâneas.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { registerUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

describe('auth: session', () => {
  let api: TestApi;
  before(async () => {
    api = await startApi();
  });
  after(() => api.close());

  const refresh = (refreshToken: string) => api.http('POST', '/auth/refresh', null, { refreshToken });

  it('refresh rotates: returns new tokens and invalidates the old one (single use)', async () => {
    const u = await registerUser(api.http, 'au');
    const first = await refresh(u.refreshToken);
    assert.equal(first.status, 200);
    assert.notEqual(first.body.refreshToken, u.refreshToken);
    assert.ok(first.body.accessToken);

    const reused = await refresh(u.refreshToken);
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'invalid_refresh_token');
  });

  it('the new refresh token continues working', async () => {
    const u = await registerUser(api.http, 'au');
    const first = await refresh(u.refreshToken);
    assert.equal((await refresh(first.body.refreshToken)).status, 200);
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser(api.http, 'au');
    assert.equal((await api.http('POST', '/auth/logout', null, { refreshToken: u.refreshToken })).status, 204);
    assert.equal((await refresh(u.refreshToken)).status, 401);
  });

  it('the access token opens /auth/me and an invalid token is 401', async () => {
    const u = await registerUser(api.http, 'au');
    const me = await api.http('GET', '/auth/me', u.accessToken);
    assert.equal(me.status, 200);
    assert.equal(me.body.id, u.user.id);
    assert.equal((await api.http('GET', '/auth/me', 'token-invalido')).status, 401);
    assert.equal((await api.http('GET', '/auth/me', null)).status, 401);
  });

  it('wrong-password login returns 401, and user or and-mail repeated does not registers of new', async () => {
    const u = await registerUser(api.http, 'au');
    const wrong = await api.http('POST', '/auth/login', null, { identifier: u.user.username, password: 'senha-errada-1' });
    assert.equal(wrong.status, 401);
    const ok = await api.http('POST', '/auth/login', null, { identifier: u.user.email, password: 'senha-teste-123' });
    assert.equal(ok.status, 200, 'login por e-mail');
    const dup = await api.http('POST', '/auth/register', null, {
      username: u.user.username,
      name: 'x',
      email: `outro_${u.user.email}`,
      password: 'senha-teste-123',
    });
    assert.ok([400, 409].includes(dup.status), `repetido recebeu ${dup.status}`);
  });

  it('race: 8 simultaneous refreshes with the same token issue at most one session (25 rounds)', async () => {
    const u = await registerUser(api.http, 'race');
    let token = u.refreshToken;
    for (let round = 0; round < 25; round++) {
      const results = await Promise.all(Array.from({ length: 8 }, () => refresh(token)));
      const wins = results.filter((r) => r.status === 200);
      assert.ok(wins.length <= 1, `rodada ${round}: ${wins.length} sessões válidas para o mesmo token`);
      assert.equal(wins.length, 1, `rodada ${round}: nenhuma renovação funcionou`);
      token = wins[0]!.body.refreshToken;
    }
  });
});
