import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { useSession } from '@/features/auth';

jest.mock('@/features/auth', () => {
  const { create } = jest.requireActual('zustand');
  return {
    ...jest.requireActual('@/features/auth'),
    useSession: create(() => ({ status: 'signedIn', user: null, bootstrap: jest.fn(), signOut: jest.fn() })),
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@/features/library/queries', () => ({
  useLibrary: () => ({ data: [], isPending: false, isError: false, isRefetching: false, refetch: jest.fn() }),
}));

jest.mock('@/features/notifications/queries', () => ({
  useNotifications: () => ({ data: { pages: [{ items: [], unreadCount: 0, nextCursor: null }], pageParams: [undefined] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(), isError: false, refetch: jest.fn() }),
  useUnreadCount: () => 0,
  useMarkAllRead: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/features/profiles/api', () => {
  const actual = jest.requireActual('@/features/profiles/api');
  const empty = () => Promise.resolve({ items: [], nextCursor: null });
  return { profilesApi: { ...actual.profilesApi, mutes: jest.fn(empty), blocks: jest.fn(empty) } };
});

const user = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  email: 'ana@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  dmPolicy: 'everyone' as const,
};

beforeEach(() => {
  useSession.setState({ status: 'signedIn', user });
});

const SUB_SCREENS = [
  ['Conta', 'E-mail'],
  ['Privacidade', 'Quem pode te mandar mensagem'],
  ['Notificações', 'Central de notificações'],
  ['Acessibilidade', 'Desativar vibração'],
  ['Biblioteca', 'Ordenar por'],
  ['Sobre', 'Versão'],
] as const;

test('/settings lands on the main settings screen under the "Configurações" header', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings' });

  expect(await screen.findByText('Ana Souza')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Configurações' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sair' })).toBeOnTheScreen();
});

test('the gear in the Perfil header opens the main settings screen and back returns to the profile', async () => {
  await renderRouter('./src/app', { initialUrl: '/profile' });

  await fireEvent.press(await screen.findByRole('button', { name: 'Configurações' }));
  expect(await screen.findByRole('button', { name: 'Acessibilidade' })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

  expect(await screen.findByRole('button', { name: 'Configurações' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Acessibilidade' })).toBeNull();
});

test.each(SUB_SCREENS)('%s opens its sub-screen and back returns to the main screen', async (row, content) => {
  await renderRouter('./src/app', { initialUrl: '/profile' });
  await act(async () => router.push('/settings' as Href));

  await fireEvent.press(await screen.findByRole('button', { name: row }));
  expect(await screen.findByText(content)).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: row })).toBeOnTheScreen();

  await act(async () => router.back());

  expect(await screen.findByRole('button', { name: 'Sair' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Configurações' })).toBeOnTheScreen();
});

test('the header back button on a sub-screen returns to the main screen', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings/library' });
  expect(await screen.findByText('Ordenar por')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

  expect(await screen.findByRole('button', { name: 'Sair' })).toBeOnTheScreen();
});

test('Editar perfil in Conta opens the profile editor', async () => {
  await renderRouter('./src/app', { initialUrl: '/settings/account' });

  await fireEvent.press(await screen.findByRole('button', { name: 'Editar perfil' }));
  expect(await screen.findByRole('button', { name: 'Salvar' })).toBeOnTheScreen();
});

test.each([
  ['Conta', 'Trocar senha', 'Senha atual'],
  ['Conta', 'Excluir conta', 'Continuar'],
  ['Privacidade', 'Contas silenciadas', 'Você não silenciou ninguém'],
  ['Privacidade', 'Contas bloqueadas', 'Você não bloqueou ninguém'],
] as const)('%s → %s opens under its own header and back returns', async (section, row, content) => {
  await renderRouter('./src/app', { initialUrl: '/settings' });

  await fireEvent.press(await screen.findByRole('button', { name: section }));
  await fireEvent.press(await screen.findByRole('button', { name: row }));
  expect(await screen.findByText(content)).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: row })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));

  expect(await screen.findByRole('header', { name: section })).toBeOnTheScreen();
});
