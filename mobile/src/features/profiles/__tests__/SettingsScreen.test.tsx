import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useChatStore, type PendingMessage } from '@/features/chat/chatStore';
import { useLibraryPrefs } from '@/features/library/prefsStore';

import { SettingsScreen } from '../SettingsScreen';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

let mockVersion: string | undefined = '1.4.2';
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockVersion === undefined ? null : { version: mockVersion };
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const signOut = jest.fn().mockResolvedValue(undefined);

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SettingsScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVersion = '1.4.2';
  useLibraryPrefs.setState({ sort: 'recent' });
  useSession.setState({ status: 'signedIn', signOut });
  useChatStore.getState().clear();
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
  useChatStore.getState().clear();
});

function pendingMessage(clientMessageId: string, status: PendingMessage['status']) {
  return { clientMessageId, content: 'oi', createdAt: new Date(), status } as PendingMessage;
}

describe('SettingsScreen', () => {
  it('opens the profile editor', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Editar perfil' }));

    expect(mockPush).toHaveBeenCalledWith('/me/edit');
  });

  it('asks before signing out and keeps the session when the user stays', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(screen.getByText('Sair da conta?')).toBeOnTheScreen();
    expect(signOut).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Continuar no app' }));

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.queryByText('Sair da conta?')).toBeNull();
  });

  it('has no message in the sign-out dialog when nothing is unsent', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(screen.queryByText(/não enviada/)).toBeNull();
  });

  it('warns about one unsent draft before signing out', async () => {
    useChatStore.setState({ drafts: { c1: 'oi', c2: '   ' } });
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(
      screen.getByText('Você tem uma mensagem escrita e não enviada. Ela será descartada.'),
    ).toBeOnTheScreen();
  });

  it('warns about every unsent draft and pending message in plural', async () => {
    useChatStore.setState({
      drafts: { c1: 'oi' },
      pending: { c2: [pendingMessage('a', 'failed'), pendingMessage('b', 'uncertain')] },
    });
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(
      screen.getByText('Você tem 3 mensagens escritas e não enviadas. Elas serão descartadas.'),
    ).toBeOnTheScreen();
  });

  it('counts a lone pending message as one unsent message', async () => {
    useChatStore.setState({ pending: { c1: [pendingMessage('a', 'sending')] } });
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(
      screen.getByText('Você tem uma mensagem escrita e não enviada. Ela será descartada.'),
    ).toBeOnTheScreen();
  });

  it('signs out after the confirmation', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    // The dialog's destructive action shares the label with the row that opened it.
    const confirm = screen.getAllByRole('button', { name: 'Sair' });
    await fireEvent.press(confirm[confirm.length - 1]);

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Sair da conta?')).toBeNull();
  });

  it('shows the five sorts with the stored one selected and changes the preference', async () => {
    await renderSettings();

    expect(screen.getByText('Ordenar por')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Adicionados recentemente', selected: true }),
    ).toBeOnTheScreen();
    for (const label of [
      'Adicionados há mais tempo',
      'Mais horas registradas',
      'Minha nota',
      'Nome A–Z',
    ]) {
      expect(screen.getByRole('button', { name: label, selected: false })).toBeOnTheScreen();
    }

    await fireEvent.press(screen.getByRole('button', { name: 'Minha nota' }));

    expect(useLibraryPrefs.getState().sort).toBe('rating');
    expect(screen.getByRole('button', { name: 'Minha nota', selected: true })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Adicionados recentemente', selected: false }),
    ).toBeOnTheScreen();
  });

  it('shows the app name and the version from the app config', async () => {
    await renderSettings();

    expect(screen.getByText('Sobre')).toBeOnTheScreen();
    expect(screen.getByText('GameTracker')).toBeOnTheScreen();
    expect(screen.getByText('Versão 1.4.2')).toBeOnTheScreen();
  });

  it('shows a dash when the config has no version', async () => {
    mockVersion = undefined;
    await renderSettings();

    expect(screen.getByText('Versão —')).toBeOnTheScreen();
  });
});
