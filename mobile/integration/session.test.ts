import { api, sessionManager, useSession } from '@/features/auth';
import { authApi } from '@/features/auth/api';
import { tokenStore } from '@/lib/tokenStore';

import { apiErrorOf, describeBackend, newUserInput, restartApp, signUpFresh } from './backend';

/** Counts session expirations while keeping the app's own handler. */
function countExpirations(session: { onExpired?: () => void }) {
  const original = session.onExpired;
  let count = 0;
  session.onExpired = () => {
    count += 1;
    original?.();
  };
  return {
    get count() {
      return count;
    },
    restore() {
      session.onExpired = original;
    },
  };
}

describeBackend('session against the test API', () => {
  it('signs up and in, and maps the envelope errors (409, 401, 400)', async () => {
    const input = newUserInput('int');
    await useSession.getState().signUp(input);
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe(input.username);
    expect(sessionManager.accessToken).not.toBeNull();
    expect(await tokenStore.read()).not.toBeNull();

    expect(await apiErrorOf(useSession.getState().signUp(input))).toMatchObject({
      status: 409,
      code: 'conflict',
    });
    expect(await apiErrorOf(authApi.login(input.username, 'senha-errada'))).toMatchObject({
      status: 401,
      code: 'invalid_credentials',
    });
    expect(
      await apiErrorOf(authApi.register({ ...newUserInput('int'), username: 'x' })),
    ).toMatchObject({ status: 400, code: 'validation_error' });

    // The same account signs in again, by e-mail, and gets a new session. (Access tokens issued
    // in the same second are identical; refresh tokens never are.)
    const firstRefresh = await tokenStore.read();
    await useSession.getState().signIn(input.email, input.password);
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe(input.username);
    expect(await tokenStore.read()).not.toBe(firstRefresh);
    expect(await authApi.me(api)).toMatchObject({ username: input.username });
  });

  it('multiple simultaneous 401 responses: one refresh, all calls succeed', async () => {
    const input = newUserInput('conc');
    const registered = await authApi.register(input);
    // An access token the server rejects (as if expired) plus the real refresh token.
    await sessionManager.start({ accessToken: 'expirado', refreshToken: registered.refreshToken });
    const expirations = countExpirations(sessionManager);

    try {
      const results = await Promise.all(Array.from({ length: 8 }, () => authApi.me(api)));

      expect(results.map((user) => user.username)).toEqual(Array(8).fill(input.username));
      // A second refresh with the same token would have been rejected and expired the session.
      expect(expirations.count).toBe(0);
      expect(sessionManager.accessToken).not.toBe('expirado');
      const rotated = await tokenStore.read();
      expect(rotated).not.toBeNull();
      expect(rotated).not.toBe(registered.refreshToken);
    } finally {
      expirations.restore();
    }

    // The rotated-out refresh token is rejected if used again.
    expect(await apiErrorOf(authApi.refresh(registered.refreshToken))).toMatchObject({
      status: 401,
      code: 'invalid_refresh_token',
    });
  });

  it('restoration: valid session, then logout revokes it on the server', async () => {
    const { input, refreshToken: saved } = await signUpFresh('rest');

    // A new process: only the stored refresh token survives.
    const app = restartApp();
    await app.useSession.getState().bootstrap();
    expect(app.useSession.getState().status).toBe('signedIn');
    expect(app.useSession.getState().user?.username).toBe(input.username);
    const current = await tokenStore.read();
    expect(current).not.toBeNull();
    expect(current).not.toBe(saved);

    await app.useSession.getState().signOut();
    expect(app.useSession.getState().status).toBe('signedOut');
    expect(app.sessionManager.accessToken).toBeNull();
    expect(await tokenStore.read()).toBeNull();

    // The token the session held at sign-out was revoked on the server.
    expect(await apiErrorOf(authApi.refresh(current!))).toMatchObject({
      status: 401,
      code: 'invalid_refresh_token',
    });
  });

  it('refresh token revoked: restore signs out and clears the storage', async () => {
    const registered = await authApi.register(newUserInput('rev'));
    await authApi.logout(registered.refreshToken);
    await tokenStore.write(registered.refreshToken);

    const app = restartApp();
    const expirations = countExpirations(app.sessionManager);
    try {
      await app.useSession.getState().bootstrap();

      expect(app.useSession.getState().status).toBe('signedOut');
      expect(await tokenStore.read()).toBeNull();
      expect(expirations.count).toBe(1);
    } finally {
      expirations.restore();
    }
  });

  it('unreachable server: unavailable restoration preserves the token', async () => {
    await tokenStore.write('qualquer.token');

    const app = restartApp('http://127.0.0.1:1');
    expect(app.apiBaseUrl).toBe('http://127.0.0.1:1/api');
    await app.useSession.getState().bootstrap();

    expect(app.useSession.getState().status).toBe('unreachable');
    expect(await tokenStore.read()).toBe('qualquer.token');
  });
});
