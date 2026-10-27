import AsyncStorage from '@react-native-async-storage/async-storage';

import { usePreferences } from '@/lib/preferences';

const initial = usePreferences.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  usePreferences.setState(initial, true);
});

async function stored(): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem('preferences');
  return (JSON.parse(raw ?? '{}') as { state: Record<string, unknown> }).state;
}

describe('preferences', () => {
  it('shows replies in line, oldest first, until the user chooses', () => {
    expect(usePreferences.getState()).toMatchObject({
      hapticsEnabled: true,
      requireAltText: false,
      threadView: 'linear',
      threadSort: 'oldest',
    });
  });

  it('keeps the thread view and order the user chose', async () => {
    usePreferences.getState().setThreadView('tree');
    usePreferences.getState().setThreadSort('top');

    expect(usePreferences.getState()).toMatchObject({ threadView: 'tree', threadSort: 'top' });
    await expect(stored()).resolves.toEqual({
      hapticsEnabled: true,
      requireAltText: false,
      threadView: 'tree',
      threadSort: 'top',
    });
  });

  it('reads the stored choices back', async () => {
    await AsyncStorage.setItem(
      'preferences',
      JSON.stringify({
        state: { hapticsEnabled: false, threadView: 'tree', threadSort: 'newest' },
        version: 0,
      }),
    );
    await usePreferences.persist.rehydrate();

    expect(usePreferences.getState()).toMatchObject({
      hapticsEnabled: false,
      threadView: 'tree',
      threadSort: 'newest',
    });
  });

  it('falls back to the defaults for missing or unknown stored values', async () => {
    await AsyncStorage.setItem(
      'preferences',
      JSON.stringify({ state: { hapticsEnabled: false, threadView: 'grid' }, version: 0 }),
    );
    await usePreferences.persist.rehydrate();

    expect(usePreferences.getState()).toMatchObject({
      hapticsEnabled: false,
      threadView: 'linear',
      threadSort: 'oldest',
    });
  });

  it('persists the alt text requirement', async () => {
    usePreferences.getState().setRequireAltText(true);

    expect(usePreferences.getState().requireAltText).toBe(true);
    await expect(stored()).resolves.toMatchObject({ requireAltText: true, hapticsEnabled: true });
  });

  it('reads the stored alt text requirement back', async () => {
    await AsyncStorage.setItem(
      'preferences',
      JSON.stringify({ state: { requireAltText: true }, version: 0 }),
    );
    await usePreferences.persist.rehydrate();

    expect(usePreferences.getState().requireAltText).toBe(true);
  });

  it('ignores a stored alt text requirement that is not a boolean', async () => {
    await AsyncStorage.setItem(
      'preferences',
      JSON.stringify({ state: { requireAltText: 'yes' }, version: 0 }),
    );
    await usePreferences.persist.rehydrate();

    expect(usePreferences.getState().requireAltText).toBe(false);
  });
});
