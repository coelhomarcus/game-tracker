import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { useSession } from '@/features/auth';
import type { Game } from '@/features/games/types';
import type { GameEntry } from '@/features/library/types';

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

const mockGameData: Game = {
  id: 'g1',
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  summary: null,
  screenshots: [],
  platforms: ['PC', 'PS5'],
  genres: [],
  isFavoritedByMe: false,
};

const mockEntry: GameEntry = {
  id: 'e1',
  platform: 'PC',
  status: 'playing',
  startedAt: null,
  finishedAt: null,
  hoursPlayed: null,
  rating: null,
  notes: null,
  createdAt: new Date(2026, 2, 5, 12),
  game: mockGameData,
};

const mockCreate = jest.fn();

jest.mock('@/features/games/queries', () => ({
  useMyFavorites: () => ({ data: [] }),
  useGame: () => ({ data: mockGameData, isPending: false, isError: false, error: null, refetch: jest.fn() }),
}));

jest.mock('@/features/library/queries', () => ({
  useLibrary: () => ({ data: [mockEntry], isPending: false, isError: false, isRefetching: false, refetch: jest.fn() }),
  useCreateEntry: () => ({ mutateAsync: mockCreate }),
  useUpdateEntry: () => ({ mutateAsync: jest.fn() }),
}));

beforeEach(() => {
  useSession.setState({ status: 'signedIn' });
});

test('the new record route titles the header and renders the form', async () => {
  await renderRouter('./src/app', { initialUrl: '/games/11/playthroughs/new' });
  await screen.findByRole('button', { name: 'Salvar registro' });
  expect(screen.getByRole('header', { name: 'Novo registro' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Hades' })).toBeOnTheScreen();
});

test('the edit route titles the header and prefills the record', async () => {
  await renderRouter('./src/app', { initialUrl: '/games/11/playthroughs/e1/edit' });
  await screen.findByRole('button', { name: 'Salvar registro' });
  expect(screen.getByRole('header', { name: 'Editar registro' })).toBeOnTheScreen();
  expect(screen.queryByText('Você já tem 1 registro deste jogo. Este será um novo registro.')).toBeNull();
});

test('going back with unsaved changes asks before discarding', async () => {
  await renderRouter('./src/app', { initialUrl: '/library' });
  await act(async () => router.push('/games/11/playthroughs/new' as Href));
  await fireEvent.press(await screen.findByRole('button', { name: 'Nota 4 de 10' }));

  await act(async () => router.back());
  expect(await screen.findByText('Descartar alterações?')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
  expect(await screen.findByRole('tab', { name: 'Biblioteca', selected: true })).toBeOnTheScreen();
});

test('saving a changed record leaves without the discard prompt', async () => {
  mockCreate.mockResolvedValue(undefined);
  const app = await renderRouter('./src/app', { initialUrl: '/library' });
  await act(async () => router.push('/games/11/playthroughs/new' as Href));
  await fireEvent.press(await screen.findByRole('button', { name: 'PC' }));

  await fireEvent.press(screen.getByRole('button', { name: 'Salvar registro' }));

  await waitFor(() => expect(app.getPathname()).toBe('/library'));
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Descartar alterações?')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Salvar registro' })).toBeNull();
});
