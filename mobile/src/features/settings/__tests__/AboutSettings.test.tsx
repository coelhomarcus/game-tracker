import * as Clipboard from 'expo-clipboard';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useToast } from '@/lib/toast';

import { AboutSettings } from '../AboutSettings';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

let mockConfig: { version?: string; android?: { versionCode?: number } } | null = null;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockConfig;
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderAbout() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AboutSettings />
    </SafeAreaProvider>,
  );
}

function mockPlatformConstants(constants: Record<string, unknown>) {
  jest.spyOn(Platform, 'constants', 'get').mockReturnValue(constants as typeof Platform.constants);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig = { version: '2.4.0', android: { versionCode: 123 } };
  jest.replaceProperty(Platform, 'OS', 'android');
  mockPlatformConstants({ Release: '14' });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AboutSettings', () => {
  it('shows the app name, its description and the version with the build', async () => {
    await renderAbout();

    expect(screen.getByText('GameTracker')).toBeOnTheScreen();
    expect(screen.getByText('2.4.0 (123)')).toBeOnTheScreen();
  });

  it('copies the build info and says so', async () => {
    await renderAbout();

    await fireEvent.press(screen.getByRole('button', { name: /Versão/ }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('GameTracker 2.4.0 (123) · Android 14');
    expect(useToast.getState().message).toBe('Informações copiadas');
  });

  it('shows only the version when the build number is missing', async () => {
    mockConfig = { version: '2.4.0' };
    await renderAbout();

    expect(screen.getByText('2.4.0')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Versão/ }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('GameTracker 2.4.0 · Android 14');
    expect(useToast.getState().message).toBe('Informações copiadas');
  });

  it('copes with no app config at all', async () => {
    mockConfig = null;
    await renderAbout();

    expect(screen.getByText('—')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Versão/ }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('GameTracker — · Android 14');
    expect(useToast.getState().message).toBe('Informações copiadas');
  });

  it('falls back to the API level when the system gives no release name', async () => {
    mockPlatformConstants({});
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    await renderAbout();

    await fireEvent.press(screen.getByRole('button', { name: /Versão/ }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('GameTracker 2.4.0 (123) · Android 34');
  });

  it('tells the user when the copy fails', async () => {
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    await renderAbout();

    await fireEvent.press(screen.getByRole('button', { name: /Versão/ }));

    expect(useToast.getState().message).toBe('Não foi possível copiar.');
  });
});
