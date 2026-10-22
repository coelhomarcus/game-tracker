/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import type { TokenStore } from '@/lib/tokenStore';

import { createApiClient } from '../apiClient';
import { ApiError } from '../errors';
import { request } from '../request';
import { SessionManager, type SessionTokens } from '../session';

const BASE = 'http://test/api';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function memoryStore(): TokenStore {
  let value: string | null = null;
  return {
    read: async () => value,
    write: async (token) => {
      value = token;
    },
    clear: async () => {
      value = null;
    },
  };
}

async function setup() {
  const session = new SessionManager(memoryStore(), (refreshToken) =>
    request<SessionTokens>(BASE, '/auth/refresh', { method: 'POST', body: { refreshToken } }),
  );
  await session.start({ accessToken: 'a1', refreshToken: 'r1' });
  return { session, api: createApiClient(session, BASE) };
}

const unauthorized = () =>
  HttpResponse.json({ error: { code: 'unauthorized', message: 'no' } }, { status: 401 });

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('createApiClient', () => {
  it('retries once after a successful refresh', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/feed`, ({ request: req }) => {
        const auth = req.headers.get('authorization');
        seen.push(auth);
        return auth === 'Bearer a2' ? HttpResponse.json({ items: [1] }) : unauthorized();
      }),
      http.post(`${BASE}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' }),
      ),
    );
    const { api } = await setup();

    await expect(api.get('/feed')).resolves.toEqual({ items: [1] });
    expect(seen).toEqual(['Bearer a1', 'Bearer a2']);
  });

  it('refreshes with the in-memory token when the store never persists', async () => {
    const refreshBodies: unknown[] = [];
    server.use(
      http.get(`${BASE}/feed`, ({ request: req }) =>
        req.headers.get('authorization') === 'Bearer a2'
          ? HttpResponse.json({ ok: true })
          : unauthorized(),
      ),
      http.post(`${BASE}/auth/refresh`, async ({ request: req }) => {
        refreshBodies.push(await req.json());
        return HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' });
      }),
    );
    const blackHole: TokenStore = {
      read: async () => null,
      write: async () => undefined,
      clear: async () => undefined,
    };
    const session = new SessionManager(blackHole, (refreshToken) =>
      request<SessionTokens>(BASE, '/auth/refresh', { method: 'POST', body: { refreshToken } }),
    );
    await session.start({ accessToken: 'a1', refreshToken: 'r1' });
    const api = createApiClient(session, BASE);

    await expect(api.get('/feed')).resolves.toEqual({ ok: true });
    expect(refreshBodies).toEqual([{ refreshToken: 'r1' }]);
  });

  it('parallel 401s refresh once', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${BASE}/feed`, ({ request: req }) =>
        req.headers.get('authorization') === 'Bearer a2'
          ? HttpResponse.json({ ok: true })
          : unauthorized(),
      ),
      http.post(`${BASE}/auth/refresh`, async () => {
        refreshes += 1;
        await delay(20);
        return HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' });
      }),
    );
    const { api } = await setup();

    const results = await Promise.all([api.get('/feed'), api.get('/feed'), api.get('/feed')]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });

  it('does not loop', async () => {
    let refreshes = 0;
    let gets = 0;
    server.use(
      http.get(`${BASE}/feed`, () => {
        gets += 1;
        return unauthorized();
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' });
      }),
    );
    const { api } = await setup();

    await expect(api.get('/feed')).rejects.toMatchObject({ name: 'ApiError', status: 401 });
    expect(refreshes).toBe(1);
    expect(gets).toBe(2);
  });

  it('rethrows the original 401 when the refresh token is invalid', async () => {
    server.use(
      http.get(`${BASE}/feed`, unauthorized),
      http.post(`${BASE}/auth/refresh`, unauthorized),
    );
    const { api, session } = await setup();

    await expect(api.get('/feed')).rejects.toMatchObject({ status: 401, code: 'unauthorized' });
    expect(session.accessToken).toBeNull();
  });

  it('rejects with cancelled when the session changes while a request is in flight', async () => {
    server.use(
      http.get(`${BASE}/feed`, async () => {
        await delay(20);
        return HttpResponse.json({ ok: true });
      }),
    );
    const { api, session } = await setup();

    const pending = api.get('/feed');
    await session.clear();

    const error: unknown = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'cancelled' });
  });

  it('does not refresh for a 401 that arrives after the session changed', async () => {
    let refreshes = 0;
    server.use(
      http.get(`${BASE}/feed`, async () => {
        await delay(20);
        return unauthorized();
      }),
      http.post(`${BASE}/auth/refresh`, () => {
        refreshes += 1;
        return HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' });
      }),
    );
    const { api, session } = await setup();

    const pending = api.get('/feed');
    await session.start({ accessToken: 'b1', refreshToken: 'rb1' });

    await expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    expect(refreshes).toBe(0);
  });

  it('sends bodies, query strings and the Bearer for each method', async () => {
    const calls: string[] = [];
    const bodies: unknown[] = [];
    for (const method of ['post', 'put', 'patch'] as const) {
      server.use(
        http[method](`${BASE}/things`, async ({ request: req }) => {
          calls.push(`${req.method} ${req.headers.get('authorization')}`);
          bodies.push(await req.json());
          return HttpResponse.json({ ok: true });
        }),
      );
    }
    server.use(
      http.delete(`${BASE}/things`, ({ request: req }) => {
        calls.push(`${req.method} ${new URL(req.url).search}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { api } = await setup();

    await api.post('/things', { n: 1 });
    await api.put('/things', { n: 2 });
    await api.patch('/things', { n: 3 });
    await expect(api.delete('/things', { query: { q: 'x' } })).resolves.toBeUndefined();

    expect(calls).toEqual(['POST Bearer a1', 'PUT Bearer a1', 'PATCH Bearer a1', 'DELETE ?q=x']);
    expect(bodies).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });
});
