// Biblioteca: contrato do PATCH (omitido = manter, null = limpar, valor = substituir) e privacidade
// das anotações pessoais.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { registerUser, type TestUser } from '../helpers/client';
import { ensureSyntheticGames } from '../helpers/seed';
import { startApi, type TestApi } from '../helpers/server';

const OPTIONAL = ['hoursPlayed', 'rating', 'notes', 'startedAt', 'finishedAt'] as const;

describe('game-entries: PATCH tri-state', () => {
  let api: TestApi;
  let user: TestUser;
  let id: string;

  const patch = (body: unknown) => api.http('PATCH', `/game-entries/${id}`, user.accessToken, body);
  const get = async () =>
    (await api.http('GET', '/game-entries/me?igdbId=900001', user.accessToken)).body.find((e: { id: string }) => e.id === id);

  before(async () => {
    await ensureSyntheticGames();
    api = await startApi();
    user = await registerUser(api.http, 'pc');
    const created = await api.http('POST', '/game-entries', user.accessToken, {
      igdbId: 900001,
      platform: 'PC',
      status: 'completed',
      startedAt: '2026-01-05',
      finishedAt: '2026-01-20',
      hoursPlayed: 12.5,
      rating: 9,
      notes: 'nota',
    });
    assert.equal(created.status, 201);
    id = created.body.id;
  });
  after(() => api.close());

  it('PATCH {} is valid and changes nothing (legacy client)', async () => {
    assert.equal((await patch({})).status, 200);
    const e = await get();
    assert.equal(e.hoursPlayed, '12.5');
    assert.equal(e.rating, 9);
    assert.equal(e.notes, 'nota');
    assert.equal(e.startedAt, '2026-01-05T00:00:00.000Z');
  });

  it('omitted field keeps the remaining values', async () => {
    assert.equal((await patch({ platform: 'Switch' })).status, 200);
    const e = await get();
    assert.equal(e.platform, 'Switch');
    assert.equal(e.rating, 9);
    assert.equal(e.hoursPlayed, '12.5');
  });

  it('value replaces', async () => {
    await patch({ hoursPlayed: 20, rating: 7, notes: 'outra', startedAt: '2026-02-01' });
    const e = await get();
    assert.equal(e.hoursPlayed, '20.0');
    assert.equal(e.rating, 7);
    assert.equal(e.notes, 'outra');
    assert.equal(e.startedAt, '2026-02-01T00:00:00.000Z');
  });

  it('zero hours is the value, not absence', async () => {
    await patch({ hoursPlayed: 0 });
    assert.equal((await get()).hoursPlayed, '0.0');
  });

  for (const field of OPTIONAL) {
    it(`null limpa ${field} sem tocar nos outros`, async () => {
      await patch({ hoursPlayed: 5, rating: 6, notes: 'x', startedAt: '2026-03-01', finishedAt: '2026-03-09' });
      const r = await patch({ [field]: null });
      assert.equal(r.status, 200);
      const e = await get();
      assert.equal(e[field], null, `${field} deveria ser null`);
      for (const other of OPTIONAL.filter((f) => f !== field)) {
        assert.notEqual(e[other], null, `${other} não deveria ser limpo`);
      }
      assert.ok(e.startedAt === null || !String(e.startedAt).startsWith('1970'), 'data não vira 1970');
    });
  }

  it('null in everything at once clears all the optional', async () => {
    const r = await patch({ hoursPlayed: null, rating: null, notes: null, startedAt: null, finishedAt: null });
    assert.equal(r.status, 200);
    const e = await get();
    assert.deepEqual([e.hoursPlayed, e.rating, e.notes, e.startedAt, e.finishedAt], [null, null, null, null, null]);
    assert.equal(e.platform, 'Switch');
    assert.equal(e.status, 'completed');
  });

  it('platform and status rejects null', async () => {
    assert.equal((await patch({ platform: null })).status, 400);
    assert.equal((await patch({ status: null })).status, 400);
  });

  it('rating outside of 1–10 continues rejected', async () => {
    assert.equal((await patch({ rating: 0 })).status, 400);
    assert.equal((await patch({ rating: 11 })).status, 400);
  });

  it('the reply of the PATCH reflects the state saved', async () => {
    await patch({ rating: 4 });
    const r = await patch({ rating: null });
    assert.equal(r.body.rating, null);
  });
});

describe('game-entries: private notes', () => {
  let api: TestApi;
  before(async () => {
    await ensureSyntheticGames();
    api = await startApi();
  });
  after(() => api.close());

  it('only the owner sees `notes` in GET /users/:id/game-entries; the rest of the entry is public', async () => {
    const owner = await registerUser(api.http, 'pv_dono');
    const other = await registerUser(api.http, 'pv_outro');
    const created = await api.http('POST', '/game-entries', owner.accessToken, {
      igdbId: 900001,
      platform: 'PC',
      status: 'completed',
      hoursPlayed: 3,
      rating: 8,
      notes: 'anotação pessoal',
    });
    assert.equal(created.status, 201);

    const asOwner = await api.http('GET', `/users/${owner.user.id}/game-entries`, owner.accessToken);
    assert.equal(asOwner.body[0].notes, 'anotação pessoal', 'o dono continua vendo as próprias anotações');

    const asOther = await api.http('GET', `/users/${owner.user.id}/game-entries`, other.accessToken);
    assert.equal(asOther.status, 200);
    assert.equal(asOther.body.length, 1);
    assert.equal('notes' in asOther.body[0], false, 'outra pessoa não pode ver as anotações');
    assert.equal(asOther.body[0].rating, 8, 'o restante do registro continua público');

    const filtered = await api.http('GET', `/users/${owner.user.id}/game-entries?status=completed`, other.accessToken);
    assert.equal('notes' in filtered.body[0], false, 'o filtro por status também não vaza');

    const mine = await api.http('GET', '/game-entries/me', owner.accessToken);
    assert.equal(mine.body[0].notes, 'anotação pessoal');
  });

  it('edit the entry from another user returns 404 (does not reveals that exists)', async () => {
    const owner = await registerUser(api.http, 'pv_dono');
    const other = await registerUser(api.http, 'pv_outro');
    const created = await api.http('POST', '/game-entries', owner.accessToken, { igdbId: 900001, platform: 'PC' });
    const r = await api.http('PATCH', `/game-entries/${created.body.id}`, other.accessToken, { rating: 1 });
    assert.equal(r.status, 404);
  });
});
