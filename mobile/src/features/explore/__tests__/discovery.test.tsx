import { fireEvent, render, screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth';
import { useTrendingGames } from '@/features/games/queries';
import type { TrendingGame } from '@/features/games/types';
import { useFollowSuggestions } from '@/features/profiles/queries';
import type { SuggestedPerson } from '@/features/profiles/types';

import { FollowSuggestions } from '../FollowSuggestions';
import { entryCountLabel, TrendingGames } from '../TrendingGames';

jest.mock('@/features/games/queries', () => ({ useTrendingGames: jest.fn() }));
const mockFollow = jest.fn();
jest.mock('@/features/profiles/queries', () => ({
  useFollowSuggestions: jest.fn(),
  useToggleFollow: () => ({ mutate: mockFollow }),
}));

function trending(overrides: Record<string, unknown>) {
  jest.mocked(useTrendingGames).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useTrendingGames>);
}

function suggestions(overrides: Record<string, unknown>) {
  jest.mocked(useFollowSuggestions).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    ...overrides,
  } as unknown as ReturnType<typeof useFollowSuggestions>);
}

function game(index: number, entryCount: number): TrendingGame {
  return {
    game: { id: `g${index}`, igdbId: 100 + index, name: `Jogo ${index}`, coverUrl: null, platforms: [], genres: [] },
    entryCount,
  };
}

function person(index: number, overrides: Partial<SuggestedPerson> = {}): SuggestedPerson {
  return {
    id: `u${index}`,
    username: `pessoa${index}`,
    name: `Pessoa ${index}`,
    avatarUrl: null,
    bio: `Bio ${index}`,
    isFollowedByMe: false,
    followsMe: false,
    followedByCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('TrendingGames', () => {
  it('shows skeleton covers under its heading while loading', async () => {
    trending({ isPending: true });
    await render(<TrendingGames onOpenGame={jest.fn()} />);

    expect(screen.getByText('Em alta')).toBeOnTheScreen();
    expect(screen.getByTestId('trending-skeleton')).toBeOnTheScreen();
  });

  it('lists the covers with the name and the entry count, and opens the game', async () => {
    const onOpenGame = jest.fn();
    trending({ data: [game(1, 12), game(2, 1)] });
    await render(<TrendingGames onOpenGame={onOpenGame} />);

    expect(screen.getAllByText('Jogo 1').length).toBeGreaterThan(0);
    expect(screen.getByText('12 registros')).toBeOnTheScreen();
    expect(screen.getByText('1 registro')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Jogo 2, 1 registro' }));
    expect(onOpenGame).toHaveBeenCalledWith(102);
  });

  it('is left out when nothing is trending', async () => {
    trending({ data: [] });
    await render(<TrendingGames onOpenGame={jest.fn()} />);

    expect(screen.queryByText('Em alta')).not.toBeOnTheScreen();
  });

  it('offers a retry when it fails', async () => {
    const refetch = jest.fn();
    trending({ isError: true, refetch });
    await render(<TrendingGames onOpenGame={jest.fn()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('counts entries in Portuguese', () => {
    expect(entryCountLabel(0)).toBe('0 registros');
    expect(entryCountLabel(1)).toBe('1 registro');
    expect(entryCountLabel(7)).toBe('7 registros');
  });
});

describe('FollowSuggestions', () => {
  it('shows skeleton rows under its heading while loading', async () => {
    suggestions({ isPending: true });
    await render(<FollowSuggestions onOpenPerson={jest.fn()} />);

    expect(screen.getByText('Sugestões para seguir')).toBeOnTheScreen();
    expect(screen.getByTestId('suggestions-skeleton')).toBeOnTheScreen();
  });

  it('shows five people with their bio and "Ver mais" opens the rest', async () => {
    suggestions({ data: Array.from({ length: 8 }, (_, index) => person(index + 1)) });
    await render(<FollowSuggestions onOpenPerson={jest.fn()} />);

    expect(screen.getByText('Pessoa 5')).toBeOnTheScreen();
    expect(screen.getByText('Bio 5')).toBeOnTheScreen();
    expect(screen.queryByText('Pessoa 6')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Ver mais' }));
    expect(screen.getByText('Pessoa 8')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeOnTheScreen();
  });

  it('has no "Ver mais" with five people or fewer', async () => {
    suggestions({ data: [person(1), person(2)] });
    await render(<FollowSuggestions onOpenPerson={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeOnTheScreen();
  });

  it('follows from the row, or follows back someone who follows the viewer', async () => {
    suggestions({ data: [person(1), person(2, { followsMe: true })] });
    await render(<FollowSuggestions onOpenPerson={jest.fn()} />);

    expect(screen.getByText('Seguir de volta')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Pessoa 1' }));
    expect(mockFollow).toHaveBeenCalledWith({ id: 'u1', follow: true });
  });

  it('opens the profile of a row', async () => {
    const onOpenPerson = jest.fn();
    suggestions({ data: [person(1)] });
    await render(<FollowSuggestions onOpenPerson={onOpenPerson} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Pessoa 1' }));
    expect(onOpenPerson).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('is left out when there is no one to suggest or the request failed', async () => {
    suggestions({ data: [] });
    await render(<FollowSuggestions onOpenPerson={jest.fn()} />);
    expect(screen.queryByText('Sugestões para seguir')).not.toBeOnTheScreen();

    suggestions({ isError: true });
    await screen.rerender(<FollowSuggestions onOpenPerson={jest.fn()} />);
    expect(screen.queryByText('Sugestões para seguir')).not.toBeOnTheScreen();
  });
});
