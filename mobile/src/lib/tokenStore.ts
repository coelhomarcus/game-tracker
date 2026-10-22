import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'gametracker.refreshToken';

export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

const webStore: TokenStore = {
  async read() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  async write(token) {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      // Storage unavailable: behave as if nothing was persisted.
    }
  },
  async clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  },
};

const nativeStore: TokenStore = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};

export function createTokenStore(platform: string): TokenStore {
  return platform === 'web' ? webStore : nativeStore;
}

export const tokenStore: TokenStore = createTokenStore(Platform.OS);
