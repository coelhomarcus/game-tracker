import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { useSession } from '@/features/auth';
import { useConversations } from '@/features/chat/queries';
import { colors } from '@/theme/tokens';

jest.mock('@/features/auth', () => {
  const { create } = jest.requireActual('zustand');
  return {
    ...jest.requireActual('@/features/auth'),
    useSession: create(() => ({ status: 'restoring', user: null, bootstrap: jest.fn(), signOut: jest.fn() })),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/features/library/queries', () => ({
  useLibrary: () => ({ data: [], isPending: false, isError: false, isRefetching: false, refetch: jest.fn() }),
}));

jest.mock('@/features/notifications/queries', () => ({
  useNotifications: () => ({
    data: { pages: [{ items: [], unreadCount: 0, nextCursor: null }], pageParams: [undefined] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
    isError: false,
    refetch: jest.fn(),
  }),
  useUnreadCount: () => 0,
  useUnreadCountQuery: () => ({ data: 0 }),
  notificationListsKey: ['notifications', 'list'],
  useMarkAllRead: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/features/chat/queries', () => {
  const actual = jest.requireActual('@/features/chat/queries');
  return { ...actual, useConversations: jest.fn(actual.useConversations) };
});

const actualUseConversations = jest.requireActual('@/features/chat/queries').useConversations;

afterEach(() => {
  jest.mocked(useConversations).mockReset();
  jest.mocked(useConversations).mockImplementation(actualUseConversations);
});

type Status = 'restoring' | 'signedOut' | 'signedIn' | 'unreachable';

const bootstrap = jest.fn();
const signOut = jest.fn();

function setStatus(status: Status) {
  useSession.setState({ status, user: null, bootstrap, signOut });
}

function renderApp(initialUrl: string) {
  return renderRouter('./src/app', { initialUrl });
}

beforeEach(() => {
  bootstrap.mockReset();
  signOut.mockReset();
});

test('signed out lands on login', async () => {
  setStatus('signedOut');
  await renderApp('/library');
  expect(await screen.findByText('E-mail ou username')).toBeOnTheScreen();
});

// The icon-only bottom bar renders one `tab` per route, labelled with its title.
const tabButtons = () => screen.findAllByRole('tab', { name: /^(Início|Biblioteca|Explorar|Mensagens|Perfil)(,|$)/ });

test('signed in shows the five tabs in order', async () => {
  setStatus('signedIn');
  await renderApp('/');
  const buttons = await tabButtons();
  expect(buttons.map((button) => String(button.props.accessibilityLabel))).toEqual([
    'Início',
    'Biblioteca',
    'Explorar',
    'Mensagens',
    'Perfil',
  ]);
});

test('the Mensagens tab names and shows the unread conversations', async () => {
  jest.mocked(useConversations).mockReturnValue({
    data: [{ unread: true }, { unread: true }, { unread: false }],
  } as unknown as ReturnType<typeof useConversations>);
  setStatus('signedIn');
  await renderApp('/');
  const tab = await screen.findByRole('tab', { name: 'Mensagens, 2 não lidas' });
  expect(within(tab).getByText('2')).toBeOnTheScreen();
});

test('signed in cannot open login', async () => {
  setStatus('signedIn');
  await renderApp('/login');
  expect(await screen.findByRole('tab', { name: 'Início', selected: true })).toBeOnTheScreen();
});

test('restoring shows a spinner and runs bootstrap once', async () => {
  setStatus('restoring');
  await renderApp('/');
  expect(await screen.findByLabelText('Carregando')).toBeOnTheScreen();
  expect(bootstrap).toHaveBeenCalledTimes(1);
});

test('unreachable offers retry and sign out', async () => {
  setStatus('unreachable');
  await renderApp('/');
  expect(await screen.findByText('Não foi possível conectar')).toBeOnTheScreen();
  expect(screen.getByText('Sua sessão está guardada. Verifique a conexão e tente de novo.')).toBeOnTheScreen();
  bootstrap.mockClear();

  await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(bootstrap).toHaveBeenCalledTimes(1);

  const signOutButton = screen.getByRole('button', { name: 'Sair da conta' });
  expect(signOutButton).toHaveStyle({ backgroundColor: colors.bgContrast50, borderColor: colors.borderLow });
  await fireEvent.press(signOutButton);
  expect(signOut).toHaveBeenCalledTimes(1);
});

test('bell opens notifications', async () => {
  setStatus('signedIn');
  await renderApp('/');
  await fireEvent.press(await screen.findByRole('button', { name: 'Notificações' }));
  expect(await screen.findByText('Nenhuma notificação ainda')).toBeOnTheScreen();
});

test('the Perfil header has the settings button next to the bell', async () => {
  setStatus('signedIn');
  await renderApp('/profile');
  expect(await screen.findByRole('button', { name: 'Configurações' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
  expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Sair da conta' })).toBeNull();
});

test('retry shows progress and ignores taps while the restore is pending', async () => {
  setStatus('unreachable');
  await renderApp('/');
  await screen.findByText('Não foi possível conectar');
  let finish!: () => void;
  bootstrap.mockReset();
  bootstrap.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

  await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(bootstrap).toHaveBeenCalledTimes(1);

  await act(async () => finish());
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(bootstrap).toHaveBeenCalledTimes(2);
});

test('double-tapping the bell opens notifications only once', async () => {
  setStatus('signedIn');
  const app = await renderApp('/');
  const bell = await screen.findByRole('button', { name: 'Notificações' });
  await fireEvent.press(bell);
  await fireEvent.press(bell);
  expect(await screen.findByText('Nenhuma notificação ainda')).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/notifications');

  await act(async () => router.back());
  expect(app.getPathname()).toBe('/');
});

test('the library header adds a game by opening explore', async () => {
  setStatus('signedIn');
  const app = await renderApp('/library');
  expect(await screen.findByRole('button', { name: 'Adicionar jogo' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
  await fireEvent.press(screen.getByRole('button', { name: 'Adicionar jogo' }));
  expect(await screen.findByRole('tab', { name: 'Explorar', selected: true })).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/explore');
});

test('the bottom bar switches tabs', async () => {
  setStatus('signedIn');
  const app = await renderApp('/');
  await fireEvent.press(await screen.findByRole('tab', { name: 'Biblioteca' }));
  expect(await screen.findByRole('tab', { name: 'Biblioteca', selected: true })).toBeOnTheScreen();
  expect(app.getPathname()).toBe('/library');
});
