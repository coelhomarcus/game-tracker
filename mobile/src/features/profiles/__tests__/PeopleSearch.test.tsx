import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';

import { PeopleSearch } from '../PeopleSearch';
import { usePeopleSearch } from '../queries';
import type { PersonResult } from '../types';

const mockPush = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => mockNavigation,
}));

const mockMutate = jest.fn();
jest.mock('@/features/profiles/queries', () => ({
  usePeopleSearch: jest.fn(),
  useToggleFollow: () => ({ mutate: mockMutate }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana: PersonResult = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  avatarUrl: null,
  bio: null,
  isFollowedByMe: false,
};
const bruno: PersonResult = {
  id: 'u2',
  username: 'bruno',
  name: null,
  avatarUrl: null,
  bio: 'Fã de RPG',
  isFollowedByMe: true,
};

const refetch = jest.fn();

function mockSearch(overrides: Record<string, unknown> = {}) {
  jest.mocked(usePeopleSearch).mockReturnValue({
    data: [ana, bruno],
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof usePeopleSearch>);
}

function Harness() {
  const [term, setTerm] = useState('');
  return <PeopleSearch term={term} onChangeTerm={setTerm} tabs={<Text>abas</Text>} />;
}

async function renderPeople() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Harness />
    </SafeAreaProvider>,
  );
}

async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Buscar pessoas'), text);
}

beforeEach(() => {
  mockPush.mockReset();
  mockMutate.mockReset();
  refetch.mockReset();
  mockNavigation.addListener.mockReset();
  mockNavigation.addListener.mockReturnValue(jest.fn());
  mockSearch();
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('PeopleSearch', () => {
  it('shows the hint for a short term and ignores placeholder results', async () => {
    await renderPeople();
    expect(screen.getByText('abas')).toBeOnTheScreen();
    expect(screen.getByText('Encontre pessoas')).toBeOnTheScreen();
    expect(
      screen.getByText('Busque pelo nome ou username. Digite pelo menos 2 letras.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Ana Souza')).not.toBeOnTheScreen();

    await type(' a ');
    expect(screen.getByText('Encontre pessoas')).toBeOnTheScreen();
    expect(screen.queryByText('Ana Souza')).not.toBeOnTheScreen();
    expect(usePeopleSearch).toHaveBeenLastCalledWith(' a ');
  });

  it('lists the people found with the display name and the username', async () => {
    await renderPeople();
    await type('an');

    expect(screen.queryByText('Encontre pessoas')).not.toBeOnTheScreen();
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    // A blank name falls back to the username.
    expect(screen.getByText('bruno')).toBeOnTheScreen();
    expect(screen.getByText('Fã de RPG')).toBeOnTheScreen();
  });

  it('opens the profile when a row is pressed', async () => {
    await renderPeople();
    await type('an');
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Ana Souza' }));

    expect(mockPush).toHaveBeenCalledWith('/users/u1');
  });

  it('follows a person from the row', async () => {
    await renderPeople();
    await type('an');
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u1', follow: true });
  });

  it('names the term when nobody matches', async () => {
    mockSearch({ data: [] });
    await renderPeople();
    await type(' zzz ');

    expect(screen.getByText('Ninguém encontrado')).toBeOnTheScreen();
    expect(screen.getByText('Nada para "zzz".')).toBeOnTheScreen();
  });

  it('does not call a pending or placeholder result empty', async () => {
    mockSearch({ data: [], isPlaceholderData: true, isFetching: true });
    await renderPeople();
    await type('zzz');
    expect(screen.queryByText('Ninguém encontrado')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Buscando')).toBeOnTheScreen();

    mockSearch({ data: undefined, isPending: true, isFetching: true });
    await type('zzzz');
    expect(screen.queryByText('Ninguém encontrado')).not.toBeOnTheScreen();
  });

  it('shows the busy indicator while fetching and keeps the previous results', async () => {
    mockSearch({ isFetching: true, isPlaceholderData: true });
    await renderPeople();
    expect(screen.queryByLabelText('Buscando')).not.toBeOnTheScreen();

    await type('an');
    expect(screen.getByLabelText('Buscando')).toBeOnTheScreen();
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
  });

  it('offers a retry when the search fails', async () => {
    mockSearch({ data: undefined, isError: true });
    await renderPeople();
    await type('an');

    expect(screen.getByText('Não foi possível buscar agora')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('listens for a press on its own tab to scroll back to the top', async () => {
    await renderPeople();
    expect(mockNavigation.addListener).toHaveBeenCalledWith('tabPress', expect.any(Function));
  });
});
