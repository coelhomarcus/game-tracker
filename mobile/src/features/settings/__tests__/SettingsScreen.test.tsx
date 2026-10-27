import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useChatStore, type PendingMessage } from '@/features/chat/chatStore';
import { colors } from '@/theme/tokens';

import { SettingsScreen } from '../SettingsScreen';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const signOut = jest.fn().mockResolvedValue(undefined);
const user = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  email: 'ana@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
};

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <SettingsScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', user, signOut });
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
  it('shows who is signed in', async () => {
    await renderSettings();

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
  });

  it('falls back to the username when the account has no name', async () => {
    useSession.setState({ user: { ...user, name: null } });
    await renderSettings();

    expect(screen.getByText('ana')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
  });

  it.each([
    ['Conta', '/settings/account'],
    ['Notificações', '/settings/notifications'],
    ['Acessibilidade', '/settings/accessibility'],
    ['Biblioteca', '/settings/library'],
    ['Sobre', '/settings/about'],
  ])('opens %s', async (label, href) => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: label }));

    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('keeps the removed rows out until the backend supports them', async () => {
    await renderSettings();

    for (const label of ['Privacidade', 'Alterar senha', 'Excluir conta']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('draws Sair in the danger tone and without a chevron', async () => {
    await renderSettings();

    const sair = screen.getByRole('button', { name: 'Sair' });
    expect(screen.getByText('Sair')).toHaveStyle({ color: colors.danger });
    expect(sair).toHaveStyle({ minHeight: 48 });
    expect(within(sair).queryByTestId('settings-chevron')).toBeNull();
    // The navigation rows do have one.
    expect(
      within(screen.getByRole('button', { name: 'Biblioteca' })).getByTestId('settings-chevron'),
    ).toBeOnTheScreen();
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

  it('keeps the count it read when the dialog opened', async () => {
    useChatStore.setState({ drafts: { c1: 'oi' } });
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await act(async () => {
      useChatStore.setState({ drafts: { c1: 'oi', c2: 'a', c3: 'b' } });
    });

    expect(
      screen.getByText('Você tem uma mensagem escrita e não enviada. Ela será descartada.'),
    ).toBeOnTheScreen();
  });

  it('reads the count again when the dialog is reopened after cancelling', async () => {
    useChatStore.setState({ drafts: { c1: 'oi' } });
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continuar no app' }));
    await act(async () => {
      useChatStore.setState({ drafts: { c1: 'oi', c2: 'a' } });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(
      screen.getByText('Você tem 2 mensagens escritas e não enviadas. Elas serão descartadas.'),
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
});
