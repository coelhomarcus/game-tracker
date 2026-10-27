import type { TokenStore } from '@/lib/tokenStore';

import { ApiError, NetworkError } from '../errors';
import { SessionManager, type SessionTokens } from '../session';

function memoryStore(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    read: async () => store.value,
    write: async (token: string) => {
      store.value = token;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function refreshStarted(refreshCall: jest.Mock): Promise<void> {
  while (refreshCall.mock.calls.length === 0) await new Promise((r) => setImmediate(r));
}

const tokens = (n: number): SessionTokens => ({ accessToken: `a${n}`, refreshToken: `r${n}` });

function setup(initial: string | null = 'r1') {
  const store = memoryStore(initial);
  const refreshCall = jest.fn<Promise<SessionTokens>, [string]>();
  const session = new SessionManager(store, refreshCall);
  return { store, refreshCall, session };
}

describe('SessionManager', () => {
  it('start stores tokens and bumps generation', async () => {
    const { store, session } = setup(null);
    const before = session.generation;

    await session.start(tokens(1));

    expect(session.accessToken).toBe('a1');
    expect(store.value).toBe('r1');
    expect(session.generation).toBe(before + 1);
  });

  it('concurrent refreshes share one call', async () => {
    const { session, refreshCall } = setup();
    refreshCall.mockResolvedValue(tokens(2));

    const outcomes = await Promise.all([
      session.refreshAfterUnauthorized(null),
      session.refreshAfterUnauthorized(null),
      session.refreshAfterUnauthorized(null),
    ]);

    expect(outcomes).toEqual(['refreshed', 'refreshed', 'refreshed']);
    expect(refreshCall).toHaveBeenCalledTimes(1);
    expect(refreshCall).toHaveBeenCalledWith('r1');
  });

  it('persists the rotated refresh token and keeps the generation', async () => {
    const { session, store, refreshCall } = setup();
    refreshCall.mockResolvedValue(tokens(2));
    const before = session.generation;

    await session.restore();

    expect(session.accessToken).toBe('a2');
    expect(store.value).toBe('r2');
    expect(session.generation).toBe(before);
  });

  it('skips the server when another request already refreshed', async () => {
    const { session, refreshCall } = setup();
    refreshCall.mockResolvedValue(tokens(2));
    expect(await session.refreshAfterUnauthorized(null)).toBe('refreshed');
    expect(session.accessToken).toBe('a2');

    expect(await session.refreshAfterUnauthorized('a1')).toBe('refreshed');
    expect(refreshCall).toHaveBeenCalledTimes(1);
  });

  it('discards a refresh that finishes after clear', async () => {
    const { session, store, refreshCall } = setup();
    const pending = deferred<SessionTokens>();
    refreshCall.mockReturnValue(pending.promise);

    const outcome = session.restore();
    await refreshStarted(refreshCall);
    await session.clear();
    pending.resolve(tokens(2));

    expect(await outcome).toBe('discarded');
    expect(session.accessToken).toBeNull();
    expect(store.value).toBeNull();
  });

  it('does not end a newer session when a stale refresh is rejected', async () => {
    const { session, store, refreshCall } = setup();
    const onExpired = jest.fn();
    session.onExpired = onExpired;
    const pending = deferred<SessionTokens>();
    refreshCall.mockReturnValue(pending.promise);

    const outcome = session.restore();
    await refreshStarted(refreshCall);
    await session.start(tokens(9));
    pending.reject(new ApiError(401, 'unauthorized', 'x'));

    expect(await outcome).toBe('discarded');
    expect(session.accessToken).toBe('a9');
    expect(store.value).toBe('r9');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('invalid refresh token ends the session', async () => {
    const { session, store, refreshCall } = setup();
    const onExpired = jest.fn();
    session.onExpired = onExpired;
    refreshCall.mockRejectedValue(new ApiError(401, 'unauthorized', 'x'));

    expect(await session.restore()).toBe('invalid');
    expect(store.value).toBeNull();
    expect(session.accessToken).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('a 400 from refresh also ends the session', async () => {
    const { session, store, refreshCall } = setup();
    const onExpired = jest.fn();
    session.onExpired = onExpired;
    refreshCall.mockRejectedValue(new ApiError(400, 'bad_request', 'x'));

    expect(await session.restore()).toBe('invalid');
    expect(store.value).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('network failure keeps the session', async () => {
    const { session, store, refreshCall } = setup();
    const onExpired = jest.fn();
    session.onExpired = onExpired;
    refreshCall.mockRejectedValue(new NetworkError());

    expect(await session.restore()).toBe('unavailable');
    expect(store.value).toBe('r1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('a server error keeps the session', async () => {
    const { session, store, refreshCall } = setup();
    refreshCall.mockRejectedValue(new ApiError(503, 'unavailable', 'x'));

    expect(await session.restore()).toBe('unavailable');
    expect(store.value).toBe('r1');
  });

  it('no stored token', async () => {
    const { session, refreshCall } = setup(null);

    expect(await session.restore()).toBe('noSession');
    expect(refreshCall).not.toHaveBeenCalled();
  });

  it('rejected store read is noSession', async () => {
    const { session, store, refreshCall } = setup();
    store.read = () => Promise.reject(new Error('keystore'));

    expect(await session.restore()).toBe('noSession');
    expect(await session.refreshAfterUnauthorized(null)).toBe('noSession');
    expect(refreshCall).not.toHaveBeenCalled();
  });

  it('rejected store write or clear does not throw and state still updates', async () => {
    const { session, store, refreshCall } = setup();
    store.write = () => Promise.reject(new Error('keystore'));
    store.clear = () => Promise.reject(new Error('keystore'));
    refreshCall.mockResolvedValue(tokens(2));

    await session.start(tokens(1));
    expect(session.accessToken).toBe('a1');

    expect(await session.restore()).toBe('refreshed');
    expect(session.accessToken).toBe('a2');

    await expect(session.clear()).resolves.toBe('r2');
    expect(session.accessToken).toBeNull();
  });

  it('clear drops the session and returns the previous refresh token', async () => {
    const { session, store } = setup(null);
    await session.start(tokens(1));
    const before = session.generation;

    expect(await session.clear()).toBe('r1');
    expect(session.accessToken).toBeNull();
    expect(store.value).toBeNull();
    expect(session.generation).toBe(before + 1);
  });

  it('clear waits for a pending refresh-token write and wipes it', async () => {
    const { session, store, refreshCall } = setup();
    const write = deferred<void>();
    store.write = (token) => write.promise.then(() => void (store.value = token));
    refreshCall.mockResolvedValue(tokens(2));

    const outcome = session.restore();
    while (session.accessToken === null) await new Promise((r) => setImmediate(r));
    const cleared = session.clear();
    await new Promise((r) => setImmediate(r));
    write.resolve();

    expect(await cleared).toBe('r2');
    expect(await outcome).toBe('refreshed');
    expect(store.value).toBeNull();
    expect(session.accessToken).toBeNull();
  });

  it('clear waits for the write issued by start', async () => {
    const { session, store } = setup(null);
    const write = deferred<void>();
    store.write = (token) => write.promise.then(() => void (store.value = token));

    const started = session.start(tokens(1));
    const cleared = session.clear();
    await new Promise((r) => setImmediate(r));
    write.resolve();
    await started;

    expect(await cleared).toBe('r1');
    expect(store.value).toBeNull();
  });

  it('allows a new refresh after the previous one settled', async () => {
    const { session, refreshCall } = setup();
    refreshCall.mockResolvedValueOnce(tokens(2)).mockResolvedValueOnce(tokens(3));

    await session.refreshAfterUnauthorized(null);
    expect(await session.refreshAfterUnauthorized('a2')).toBe('refreshed');

    expect(refreshCall).toHaveBeenCalledTimes(2);
    expect(refreshCall).toHaveBeenLastCalledWith('r2');
    expect(session.accessToken).toBe('a3');
  });

  it('refreshes with the in-memory token when the store never persists', async () => {
    const { session, store, refreshCall } = setup(null);
    store.read = async () => null;
    refreshCall.mockResolvedValueOnce(tokens(2)).mockResolvedValueOnce(tokens(3));
    await session.start(tokens(1));

    expect(await session.refreshAfterUnauthorized('a1')).toBe('refreshed');
    expect(refreshCall).toHaveBeenLastCalledWith('r1');
    expect(session.accessToken).toBe('a2');

    expect(await session.refreshAfterUnauthorized('a2')).toBe('refreshed');
    expect(refreshCall).toHaveBeenLastCalledWith('r2');
    await expect(session.clear()).resolves.toBe('r3');
  });

  it('forgets the in-memory token on clear', async () => {
    const { session, store, refreshCall } = setup(null);
    store.read = async () => null;
    await session.start(tokens(1));
    await session.clear();

    expect(await session.restore()).toBe('noSession');
    expect(refreshCall).not.toHaveBeenCalled();
  });

  it('ends the session when a 401 finds no refresh token at all', async () => {
    const { session } = setup(null);
    const onExpired = jest.fn();
    session.onExpired = onExpired;
    session.accessToken = 'a1';

    expect(await session.refreshAfterUnauthorized('a1')).toBe('noSession');
    expect(session.accessToken).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('does not report expiry when no access token was set', async () => {
    const { session } = setup(null);
    const onExpired = jest.fn();
    session.onExpired = onExpired;

    expect(await session.refreshAfterUnauthorized(null)).toBe('noSession');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('exposes the refresh token of the session in memory', async () => {
    const { session, refreshCall } = setup(null);
    expect(session.currentRefreshToken).toBeNull();

    await session.start(tokens(1));
    expect(session.currentRefreshToken).toBe('r1');

    refreshCall.mockResolvedValue(tokens(2));
    await session.refreshAfterUnauthorized('a1');
    expect(session.currentRefreshToken).toBe('r2');

    await session.clear();
    expect(session.currentRefreshToken).toBeNull();
  });
});
