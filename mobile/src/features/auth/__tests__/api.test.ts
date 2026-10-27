/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { accountApi } from '../account';
import { authApi, parseUser } from '../api';
import { api, sessionManager } from '../client';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(async () => {
  server.resetHandlers();
  await sessionManager.clear();
});
afterAll(() => server.close());

const userJson = {
  id: 'u1',
  username: 'ana',
  name: 'Ana',
  email: 'ana@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  dmPolicy: 'following',
};

describe('parseUser', () => {
  it('parses every field, the message policy included', () => {
    expect(parseUser(userJson)).toEqual({ ...userJson, dmPolicy: 'following' });
  });

  it('treats a missing or unknown policy as everyone', () => {
    const { dmPolicy: _policy, ...legacy } = userJson;
    expect(parseUser(legacy).dmPolicy).toBe('everyone');
    expect(parseUser({ ...userJson, dmPolicy: 'friends' }).dmPolicy).toBe('everyone');
    expect(parseUser({ ...userJson, dmPolicy: null }).dmPolicy).toBe('everyone');
  });

  it('reads optional strings defensively', () => {
    expect(parseUser({ id: 'u1', username: 'ana', email: 'a@x.com' })).toEqual({
      id: 'u1',
      username: 'ana',
      name: null,
      email: 'a@x.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      dmPolicy: 'everyone',
    });
  });
});

describe('authApi', () => {
  it('login, register and me carry the policy', async () => {
    const session = { user: { ...userJson, dmPolicy: 'nobody' }, accessToken: 'a', refreshToken: 'r' };
    server.use(
      http.post(`${apiBaseUrl}/auth/login`, () => HttpResponse.json(session)),
      http.post(`${apiBaseUrl}/auth/register`, () => HttpResponse.json(session, { status: 201 })),
      http.get(`${apiBaseUrl}/auth/me`, () => HttpResponse.json(userJson)),
    );

    await expect(authApi.login('ana', 'x')).resolves.toMatchObject({
      user: { id: 'u1', dmPolicy: 'nobody' },
      accessToken: 'a',
      refreshToken: 'r',
    });
    const registered = await authApi.register({
      username: 'ana',
      name: 'Ana',
      email: 'ana@example.com',
      password: 'longpassword',
    });
    expect(registered.user.dmPolicy).toBe('nobody');
    await expect(authApi.me(api)).resolves.toMatchObject({ dmPolicy: 'following' });
  });
});

describe('accountApi', () => {
  it('changePassword sends both passwords and the refresh token of this session', async () => {
    let body: unknown;
    let auth: string | null = null;
    server.use(
      http.post(`${apiBaseUrl}/auth/password`, async ({ request }) => {
        body = await request.json();
        auth = request.headers.get('authorization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await sessionManager.start({ accessToken: 'a1', refreshToken: 'r1' });

    await expect(accountApi.changePassword('antiga-123', 'nova-12345')).resolves.toBeUndefined();

    expect(auth).toBe('Bearer a1');
    expect(body).toEqual({ currentPassword: 'antiga-123', newPassword: 'nova-12345', refreshToken: 'r1' });
  });

  it('changePassword names the renewed token when the access token had to be refreshed', async () => {
    const tokens: unknown[] = [];
    server.use(
      http.post(`${apiBaseUrl}/auth/password`, async ({ request }) => {
        tokens.push(((await request.json()) as { refreshToken: string }).refreshToken);
        return request.headers.get('authorization') === 'Bearer a2'
          ? new HttpResponse(null, { status: 204 })
          : HttpResponse.json({ error: { code: 'unauthorized', message: 'x' } }, { status: 401 });
      }),
      http.post(`${apiBaseUrl}/auth/refresh`, () =>
        HttpResponse.json({ accessToken: 'a2', refreshToken: 'r2' }),
      ),
    );
    await sessionManager.start({ accessToken: 'a1', refreshToken: 'r1' });

    await accountApi.changePassword('antiga-123', 'nova-12345');

    expect(tokens).toEqual(['r1', 'r2']);
  });

  it('changePassword surfaces a wrong current password as invalid_password', async () => {
    server.use(
      http.post(`${apiBaseUrl}/auth/password`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_password', message: 'Senha atual incorreta' } },
          { status: 400 },
        ),
      ),
    );
    await sessionManager.start({ accessToken: 'a1', refreshToken: 'r1' });

    await expect(accountApi.changePassword('errada', 'nova-12345')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_password',
    });
  });

  it('deleteAccount DELETEs the own user with the password in the body', async () => {
    let body: unknown;
    server.use(
      http.delete(`${apiBaseUrl}/users/me`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await sessionManager.start({ accessToken: 'a1', refreshToken: 'r1' });

    await expect(accountApi.deleteAccount('minha-senha')).resolves.toBeUndefined();

    expect(body).toEqual({ password: 'minha-senha' });
  });

  it('deleteAccount surfaces a wrong password as invalid_password', async () => {
    server.use(
      http.delete(`${apiBaseUrl}/users/me`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_password', message: 'Senha atual incorreta' } },
          { status: 400 },
        ),
      ),
    );
    await sessionManager.start({ accessToken: 'a1', refreshToken: 'r1' });

    await expect(accountApi.deleteAccount('errada')).rejects.toMatchObject({
      status: 400,
      code: 'invalid_password',
    });
  });
});
