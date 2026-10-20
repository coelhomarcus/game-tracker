import { ApiError, NetworkError } from '@/lib/http/errors';
import { queryClient } from '@/lib/queryClient';

import { authApi } from '../api';
import { api, sessionManager } from '../client';
import { useSession } from '../session';

jest.mock('../api', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    me: jest.fn(),
  },
}));

jest.mock('../client', () => ({
  api: {},
  sessionManager: {
    start: jest.fn(),
    restore: jest.fn(),
    clear: jest.fn(),
    onExpired: undefined,
  },
}));

jest.mock('@/lib/queryClient', () => ({ queryClient: { clear: jest.fn() } }));

const mocked = {
  authApi: jest.mocked(authApi),
  session: jest.mocked(sessionManager),
  queryClear: jest.mocked(queryClient.clear),
};

const ana = {
  id: 'u1',
  username: 'ana',
  name: 'Ana',
  email: 'ana@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
};
const tokens = { accessToken: 'access', refreshToken: 'refresh' };

// Captured at import time: the module's handler is installed while it loads.
const expire = sessionManager.onExpired;
const initial = useSession.getState();

beforeEach(() => {
  jest.resetAllMocks();
  useSession.setState(initial, true);
});

describe('bootstrap', () => {
  test('bootstrap with a valid token signs in', async () => {
    mocked.session.restore.mockResolvedValue('refreshed');
    mocked.authApi.me.mockResolvedValue(ana);

    await useSession.getState().bootstrap();

    expect(mocked.authApi.me).toHaveBeenCalledWith(api);
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user?.username).toBe('ana');
  });

  test('bootstrap without a token signs out', async () => {
    mocked.session.restore.mockResolvedValue('noSession');

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().user).toBeNull();
  });

  test('bootstrap with a rejected token signs out', async () => {
    mocked.session.restore.mockResolvedValue('invalid');

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('signedOut');
  });

  test('bootstrap offline keeps the token', async () => {
    mocked.session.restore.mockResolvedValue('unavailable');

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('unreachable');
    expect(mocked.session.clear).not.toHaveBeenCalled();
  });

  test('bootstrap leaves the status alone when the restore was discarded', async () => {
    mocked.session.restore.mockResolvedValue('discarded');

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('restoring');
    expect(mocked.authApi.me).not.toHaveBeenCalled();
  });

  test('bootstrap signs out when the profile request is unauthorized', async () => {
    mocked.session.restore.mockResolvedValue('refreshed');
    mocked.authApi.me.mockRejectedValue(new ApiError(401, 'unauthorized', 'Unauthorized'));

    await useSession.getState().bootstrap();

    expect(mocked.session.clear).toHaveBeenCalledTimes(1);
    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().user).toBeNull();
  });

  test('bootstrap leaves the status alone when the profile request was cancelled', async () => {
    mocked.session.restore.mockResolvedValue('refreshed');
    mocked.authApi.me.mockRejectedValue(new ApiError(0, 'cancelled', 'x'));

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('restoring');
    expect(mocked.session.clear).not.toHaveBeenCalled();
  });

  test('bootstrap is unreachable when the profile request has no network', async () => {
    mocked.session.restore.mockResolvedValue('refreshed');
    mocked.authApi.me.mockRejectedValue(new NetworkError());

    await useSession.getState().bootstrap();

    expect(useSession.getState().status).toBe('unreachable');
    expect(useSession.getState().user).toBeNull();
    expect(mocked.session.clear).not.toHaveBeenCalled();
  });
});

describe('signIn and signUp', () => {
  test('signIn starts the session', async () => {
    mocked.authApi.login.mockResolvedValue({ user: ana, ...tokens });

    await useSession.getState().signIn('ana', 'secret');

    expect(mocked.authApi.login).toHaveBeenCalledWith('ana', 'secret');
    expect(mocked.session.start).toHaveBeenCalledWith(tokens);
    expect(useSession.getState().status).toBe('signedIn');
    expect(useSession.getState().user).toEqual(ana);
  });

  test('signIn rethrows the error and stays signed out', async () => {
    const error = new ApiError(401, 'invalid_credentials', 'Invalid credentials');
    mocked.authApi.login.mockRejectedValue(error);
    useSession.setState({ status: 'signedOut' });

    await expect(useSession.getState().signIn('ana', 'wrong')).rejects.toBe(error);

    expect(mocked.session.start).not.toHaveBeenCalled();
    expect(useSession.getState().status).toBe('signedOut');
  });

  test('signUp starts the session', async () => {
    const input = { username: 'ana', name: 'Ana', email: 'ana@example.com', password: 'secret' };
    mocked.authApi.register.mockResolvedValue({ user: ana, ...tokens });

    await useSession.getState().signUp(input);

    expect(mocked.authApi.register).toHaveBeenCalledWith(input);
    expect(mocked.session.start).toHaveBeenCalledWith(tokens);
    expect(useSession.getState().status).toBe('signedIn');
  });

  test('signUp rethrows the error and stays signed out', async () => {
    const error = new ApiError(409, 'conflict', 'Conflict');
    mocked.authApi.register.mockRejectedValue(error);
    useSession.setState({ status: 'signedOut' });

    await expect(
      useSession
        .getState()
        .signUp({ username: 'ana', name: 'Ana', email: 'ana@example.com', password: 'secret' }),
    ).rejects.toBe(error);

    expect(useSession.getState().status).toBe('signedOut');
  });
});

describe('signOut', () => {
  test('signOut clears locally even if the server call fails', async () => {
    useSession.setState({ status: 'signedIn', user: ana });
    mocked.session.clear.mockResolvedValue('refresh');
    mocked.authApi.logout.mockRejectedValue(new NetworkError());

    await useSession.getState().signOut();

    expect(mocked.session.clear).toHaveBeenCalled();
    expect(mocked.authApi.logout).toHaveBeenCalledWith('refresh');
    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().user).toBeNull();
    expect(mocked.queryClear).toHaveBeenCalled();
  });

  test('signOut skips the server call when there was no stored token', async () => {
    useSession.setState({ status: 'signedIn', user: ana });
    mocked.session.clear.mockResolvedValue(null);

    await useSession.getState().signOut();

    expect(mocked.authApi.logout).not.toHaveBeenCalled();
    expect(useSession.getState().status).toBe('signedOut');
  });
});

describe('session expiry', () => {
  test('onExpired signs out and clears cached queries', () => {
    useSession.setState({ status: 'signedIn', user: ana });

    expire?.();

    expect(useSession.getState().status).toBe('signedOut');
    expect(useSession.getState().user).toBeNull();
    expect(mocked.queryClear).toHaveBeenCalled();
  });
});
