import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useLibraryPrefs } from '@/features/library/prefsStore';

import { LibrarySettings } from '../LibrarySettings';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

beforeEach(() => {
  useLibraryPrefs.setState({ sort: 'recent' });
});

describe('LibrarySettings', () => {
  it('shows the five sorts as radio rows with the stored one checked, and changes the preference', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <LibrarySettings />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Ordenar por')).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Adicionados recentemente', checked: true }),
    ).toBeOnTheScreen();
    for (const label of [
      'Adicionados há mais tempo',
      'Mais horas registradas',
      'Minha nota',
      'Nome A–Z',
    ]) {
      expect(screen.getByRole('radio', { name: label, checked: false })).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByRole('radio', { name: 'Minha nota' }));

    expect(useLibraryPrefs.getState().sort).toBe('rating');
    expect(screen.getByRole('radio', { name: 'Minha nota', checked: true })).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Adicionados recentemente', checked: false }),
    ).toBeOnTheScreen();
  });
});
