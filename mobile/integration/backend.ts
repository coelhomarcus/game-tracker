// Helpers for the suites that run the app's real API layer against the disposable test API.
//
//   cd backend && npm run test:seed && npm run dev:test
//   cd mobile && GT_BACKEND=http://localhost:3100 npm run test:integration
//
// Without GT_BACKEND every suite is skipped. `integration/setup.ts` points the app's
// `@/lib/env` at GT_BACKEND before any app module loads.
import { io, type Socket } from 'socket.io-client';

import { sessionManager, useSession, type User } from '@/features/auth';
import type { RegisterInput } from '@/features/auth/api';
import { ApiError } from '@/lib/http/errors';
import { tokenStore } from '@/lib/tokenStore';

/** The test API origin, without `/api`; null when the suites are skipped. */
export const backendUrl: string | null = process.env.GT_BACKEND?.trim() || null;

/** Games cached by `npm run test:seed`: the suites never reach IGDB. */
export const FIXTURE_GAME_ONE = 900001;
export const FIXTURE_GAME_TWO = 900002;

export const PASSWORD = 'senha-fixture-123';

const HOW_TO_RUN =
  'needs the test API: in backend/ run `npm run test:seed` and `npm run dev:test`, then ' +
  '`GT_BACKEND=http://localhost:3100 npm run test:integration` in mobile/';

/** `describe` when GT_BACKEND is set; otherwise one visible skipped test that says how to run. */
export function describeBackend(name: string, fn: () => void): void {
  if (backendUrl) {
    describe(name, fn);
    return;
  }
  describe.skip(name, () => {
    it(HOW_TO_RUN, () => undefined);
  });
}

let counter = 0;

/** Unique across runs and workers, so reruns against the same test database never collide. */
export function uniqueSuffix(): string {
  counter += 1;
  const random = Math.floor(Math.random() * 36 ** 3).toString(36);
  return `${Date.now().toString(36)}${counter.toString(36)}${random}`;
}

/** A valid registration for a new user; `prefix` must be short (usernames take 30 chars). */
export function newUserInput(prefix = 'int'): RegisterInput {
  const s = uniqueSuffix();
  return {
    name: 'Integração',
    username: `${prefix}_${s}`,
    email: `${prefix}_${s}@example.test`,
    password: PASSWORD,
  };
}

export type SignedInUser = {
  user: User;
  input: RegisterInput;
  accessToken: string;
  refreshToken: string;
};

/**
 * Registers a new user through the app's own `useSession().signUp`. The shared `api` client then
 * acts as this user until the next sign-up or sign-in.
 */
export async function signUpFresh(prefix = 'int'): Promise<SignedInUser> {
  const input = newUserInput(prefix);
  await useSession.getState().signUp(input);
  const { status, user } = useSession.getState();
  const refreshToken = await tokenStore.read();
  const { accessToken } = sessionManager;
  if (status !== 'signedIn' || !user || !accessToken || !refreshToken) {
    throw new Error(`sign-up of ${input.username} did not leave a signed-in session`);
  }
  return { user, input, accessToken, refreshToken };
}

export type AppInstance = {
  useSession: typeof import('@/features/auth').useSession;
  sessionManager: typeof import('@/features/auth').sessionManager;
  api: typeof import('@/features/auth').api;
  apiBaseUrl: string;
};

/** Runs `load` in a fresh module registry; `apiUrl` overrides the server for that registry. */
function inFreshRegistry<T>(load: () => T, apiUrl?: string): T {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) process.env.EXPO_PUBLIC_API_URL = apiUrl;
  try {
    let loaded: { value: T } | undefined;
    jest.isolateModules(() => {
      loaded = { value: load() };
    });
    if (!loaded) throw new Error('the app modules did not load');
    return loaded.value;
  } finally {
    process.env.EXPO_PUBLIC_API_URL = previous;
  }
}

/* eslint-disable @typescript-eslint/no-require-imports */
function loadSession(): AppInstance {
  const auth = require('@/features/auth') as typeof import('@/features/auth');
  const env = require('@/lib/env') as typeof import('@/lib/env');
  return {
    useSession: auth.useSession,
    sessionManager: auth.sessionManager,
    api: auth.api,
    apiBaseUrl: env.apiBaseUrl,
  };
}

/**
 * Loads the session modules again in a fresh module registry, like a new app process: nothing in
 * memory survives, only what the secure store holds. `apiUrl` overrides the server for this
 * instance only.
 */
export function restartApp(apiUrl?: string): AppInstance {
  return inFreshRegistry(loadSession, apiUrl);
}

/** The app's feature API modules, all bound to one app instance's session. */
function loadFeatures() {
  return {
    app: loadSession(),
    feed: (require('@/features/feed/api') as typeof import('@/features/feed/api')).feedApi,
    games: (require('@/features/games/api') as typeof import('@/features/games/api')).gamesApi,
    library: (require('@/features/library/api') as typeof import('@/features/library/api'))
      .libraryApi,
    profiles: (require('@/features/profiles/api') as typeof import('@/features/profiles/api'))
      .profilesApi,
    notifications: (
      require('@/features/notifications/api') as typeof import('@/features/notifications/api')
    ).notificationsApi,
    push: (require('@/features/push/api') as typeof import('@/features/push/api')).pushApi,
  };
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** A signed-in user with an app instance of their own, for tests where two people take turns. */
export type Account = Omit<SignedInUser, 'accessToken' | 'refreshToken'> &
  ReturnType<typeof loadFeatures>;

/**
 * Registers a new user in an app instance of its own (a fresh module registry, like another
 * phone), so several accounts can act side by side through the app's real feature API modules.
 * Only the secure store is shared with the other instances, and nothing here restores from it.
 */
export async function signUpAccount(prefix = 'int'): Promise<Account> {
  const features = inFreshRegistry(loadFeatures);
  const input = newUserInput(prefix);
  await features.app.useSession.getState().signUp(input);
  const { status, user } = features.app.useSession.getState();
  if (status !== 'signedIn' || !user) {
    throw new Error(`sign-up of ${input.username} did not leave a signed-in session`);
  }
  return { ...features, user, input };
}

/**
 * Awaits a call that must fail with the backend's error envelope and returns that error. An app
 * instance from `signUpAccount` has its own copy of the `ApiError` class, so it is matched by name.
 */
export async function apiErrorOf(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ApiError) return error;
    if (error instanceof Error && error.name === 'ApiError' && 'status' in error) {
      return error as ApiError;
    }
    throw error;
  }
  throw new Error('expected the call to fail with an ApiError, but it succeeded');
}

/** Polls `condition` (it may fetch) until it holds; fails with `reason` after `timeoutMs`. */
export async function eventually(
  condition: () => boolean | Promise<boolean>,
  { timeoutMs = 12_000, reason }: { timeoutMs?: number; reason?: string | (() => string) } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      const text = typeof reason === 'function' ? reason() : reason;
      throw new Error(text ?? `condition not met in ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const openSockets = new Set<Socket>();

/**
 * A raw Socket.IO connection authenticated as one user (the app's chat socket is a singleton, and
 * a test with two users needs two connections). Close it with `closeSockets` in `afterEach`.
 */
export async function connectSocket(accessToken: string): Promise<Socket> {
  if (!backendUrl) throw new Error('GT_BACKEND is not set');
  const socket = io(backendUrl, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
  openSockets.add(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (error) => reject(error));
  });
  return socket;
}

/** Emits `event` and resolves with the server's ACK; rejects if none arrives in `timeoutMs`. */
export function emitWithAck<T = Record<string, unknown>>(
  socket: Socket,
  event: string,
  payload: unknown,
  timeoutMs = 10_000,
): Promise<T> {
  return socket.timeout(timeoutMs).emitWithAck(event, payload) as Promise<T>;
}

export function closeSockets(): void {
  for (const socket of openSockets) socket.disconnect();
  openSockets.clear();
}
