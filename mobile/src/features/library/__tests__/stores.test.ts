import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSession } from '@/features/auth';

import { useLibraryFilter } from '../filterStore';
import { useLibraryPrefs } from '../prefsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const STORAGE_KEY = 'library.sort';

function stored(sort: string) {
  return JSON.stringify({ state: { sort }, version: 0 });
}

describe('useLibraryFilter', () => {
  beforeEach(() => {
    useLibraryFilter.getState().clear();
    useSession.setState({ status: 'signedIn', user: null });
  });

  it('starts empty and updates each field', () => {
    expect(useLibraryFilter.getState()).toMatchObject({
      query: '',
      status: null,
      platformKey: null,
    });
    useLibraryFilter.getState().setQuery('hades');
    useLibraryFilter.getState().setStatus('playing');
    useLibraryFilter.getState().setPlatform('pc');
    expect(useLibraryFilter.getState()).toMatchObject({
      query: 'hades',
      status: 'playing',
      platformKey: 'pc',
    });
    useLibraryFilter.getState().clear();
    expect(useLibraryFilter.getState()).toMatchObject({
      query: '',
      status: null,
      platformKey: null,
    });
  });

  it('is cleared when the session becomes signedOut', () => {
    useLibraryFilter.getState().setQuery('zelda');
    useLibraryFilter.getState().setStatus('completed');
    useSession.setState({ status: 'signedOut', user: null });
    expect(useLibraryFilter.getState()).toMatchObject({
      query: '',
      status: null,
      platformKey: null,
    });
  });

  it('is kept while the session stays signed in', () => {
    useLibraryFilter.getState().setQuery('zelda');
    useSession.setState({ status: 'signedIn', user: null });
    expect(useLibraryFilter.getState().query).toBe('zelda');
  });
});

describe('useLibraryPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useLibraryPrefs.setState({ sort: 'recent' });
  });

  it('defaults to recent', () => {
    expect(useLibraryPrefs.getState().sort).toBe('recent');
  });

  it('reads a stored sort', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, stored('rating'));
    await useLibraryPrefs.persist.rehydrate();
    expect(useLibraryPrefs.getState().sort).toBe('rating');
  });

  it('falls back to recent for an unknown stored sort', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, stored('bogus'));
    await useLibraryPrefs.persist.rehydrate();
    expect(useLibraryPrefs.getState().sort).toBe('recent');
  });

  it('writes the sort when it changes', async () => {
    useLibraryPrefs.getState().setSort('mostPlayed');
    await new Promise((resolve) => setImmediate(resolve));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string).state).toEqual({ sort: 'mostPlayed' });
  });
});
