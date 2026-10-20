import * as SecureStore from 'expo-secure-store';

import { createTokenStore } from '../tokenStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// The jest-expo (node) environment has no working localStorage, so install an
// in-memory one that implements the same methods the web store calls.
function installLocalStorage() {
  const data = new Map<string, string>();
  const stub = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  return stub;
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test('web: round-trips through localStorage', async () => {
  const store = createTokenStore('web');
  await store.write('a.b');
  expect(await store.read()).toBe('a.b');
  await store.clear();
  expect(await store.read()).toBeNull();
});

test('web: storage that throws behaves as empty and never rejects', async () => {
  const denied = () => {
    throw new Error('denied');
  };
  jest.spyOn(localStorage, 'getItem').mockImplementation(denied);
  jest.spyOn(localStorage, 'setItem').mockImplementation(denied);
  jest.spyOn(localStorage, 'removeItem').mockImplementation(denied);
  const store = createTokenStore('web');
  await expect(store.write('a.b')).resolves.toBeUndefined();
  await expect(store.read()).resolves.toBeNull();
  await expect(store.clear()).resolves.toBeUndefined();
});

test('native: uses SecureStore with the fixed key', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('x.y');
  const store = createTokenStore('android');
  await store.write('x.y');
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('gametracker.refreshToken', 'x.y');
  expect(await store.read()).toBe('x.y');
  expect(SecureStore.getItemAsync).toHaveBeenCalledWith('gametracker.refreshToken');
  await store.clear();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('gametracker.refreshToken');
});
