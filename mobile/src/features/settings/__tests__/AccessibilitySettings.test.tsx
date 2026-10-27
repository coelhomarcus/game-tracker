import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePreferences } from '@/lib/preferences';

import { AccessibilitySettings } from '../AccessibilitySettings';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const initial = usePreferences.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  usePreferences.setState(initial, true);
});

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AccessibilitySettings />
    </SafeAreaProvider>,
  );
}

async function stored(): Promise<Record<string, unknown>> {
  const raw = await AsyncStorage.getItem('preferences');
  return (JSON.parse(raw ?? '{}') as { state: Record<string, unknown> }).state;
}

describe('AccessibilitySettings', () => {
  it('shows both switches off by default, each with its helper', async () => {
    await renderSettings();

    expect(screen.getByRole('switch', { name: 'Desativar vibração', checked: false })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Exigir texto alternativo', checked: false })).toBeOnTheScreen();
    expect(screen.getByText('Desliga a vibração ao tocar em botões e abas.')).toBeOnTheScreen();
    expect(
      screen.getByText('Pede uma descrição antes de publicar posts com imagens.'),
    ).toBeOnTheScreen();
  });

  it('turns haptics off and back on from the switch, persisting the choice', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('switch', { name: 'Desativar vibração' }));

    expect(usePreferences.getState().hapticsEnabled).toBe(false);
    expect(screen.getByRole('switch', { name: 'Desativar vibração', checked: true })).toBeOnTheScreen();
    await expect(stored()).resolves.toMatchObject({ hapticsEnabled: false });

    await fireEvent.press(screen.getByRole('switch', { name: 'Desativar vibração' }));

    expect(usePreferences.getState().hapticsEnabled).toBe(true);
    await expect(stored()).resolves.toMatchObject({ hapticsEnabled: true });
  });

  it('reflects the stored value after a restart', async () => {
    await AsyncStorage.setItem(
      'preferences',
      JSON.stringify({ state: { hapticsEnabled: false, requireAltText: true }, version: 0 }),
    );
    await usePreferences.persist.rehydrate();
    await renderSettings();

    expect(screen.getByRole('switch', { name: 'Desativar vibração', checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Exigir texto alternativo', checked: true })).toBeOnTheScreen();
  });

  it('requires alt text from the switch, persisting the choice', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('switch', { name: 'Exigir texto alternativo' }));

    expect(usePreferences.getState().requireAltText).toBe(true);
    expect(usePreferences.getState().hapticsEnabled).toBe(true);
    await expect(stored()).resolves.toMatchObject({ requireAltText: true });
  });
});
