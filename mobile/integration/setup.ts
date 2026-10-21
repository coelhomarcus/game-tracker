// Runs before every integration test file, ahead of any app module, so `@/lib/env` reads the
// API URL set here.
import '@/test-utils/nodeFetch';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** Accepts no connections: requests made while the suites are skipped can never reach a server. */
const UNREACHABLE_URL = 'http://127.0.0.1:1';

const backend = process.env.GT_BACKEND?.trim();

// The suites create and edit data, so they only run against a local disposable test API
// (`npm run dev:test` in backend/), never a development or production one.
if (backend) {
  let url: URL;
  try {
    url = new URL(backend);
  } catch {
    throw new Error(`GT_BACKEND is not a URL: ${backend}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`GT_BACKEND must be an http: or https: URL, not "${url.protocol}".`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      'GT_BACKEND must point at the local test API (e.g. http://localhost:3100), ' +
        `not "${url.hostname}".`,
    );
  }
  // The app adds `/api` itself (and the realtime socket uses the bare origin).
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error(
      'GT_BACKEND must be the API origin without a path (e.g. http://localhost:3100, no /api), ' +
        `not "${backend}".`,
    );
  }
}

// Always overwritten: an inherited EXPO_PUBLIC_API_URL must never be used by these suites.
process.env.EXPO_PUBLIC_API_URL = backend || UNREACHABLE_URL;

// Native secure storage, in memory. The map lives in this file's scope, so a module registry
// reset (an app "restart" in the tests) keeps the stored refresh token, like the device would.
const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockSecureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockSecureStore.delete(key);
  },
}));

// Node 26 warns when the global `localStorage` getter is touched without --localstorage-file.
// Native has no localStorage.
Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
