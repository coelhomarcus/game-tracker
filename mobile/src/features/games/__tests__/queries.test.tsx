import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { gamesApi } from '../api';
import {
  useGame,
  useGamePlayers,
  useGameSearch,
  useGameStats,
  useToggleFavorite,
} from '../queries';
import type { Game, GameSummary } from '../types';

jest.mock('../api', () => ({
  gamesApi: {
    search: jest.fn(),
    byIgdbId: jest.fn(),
    stats: jest.fn(),
    players: jest.fn(),
    setFavorite: jest.fn(),
  },
}));

const mocked = jest.mocked(gamesApi);

const game: Game = {
  id: 'g1',
  igdbId: 1942,
  name: 'Hades',
  coverUrl: null,
  summary: null,
  screenshots: [],
  platforms: [],
  genres: [],
  isFavoritedByMe: false,
};

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('game queries', () => {
  it('useGame loads the game by IGDB id', async () => {
    mocked.byIgdbId.mockResolvedValue(game);
    const client = freshClient();
    const { result } = await renderHook(() => useGame(1942), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data).toEqual(game));
    expect(mocked.byIgdbId).toHaveBeenCalledWith(1942);
    expect(client.getQueryData(['game', 1942])).toEqual(game);
  });

  it('useGameStats waits for the game id', async () => {
    mocked.stats.mockResolvedValue({ backlog: 1, playing: 2, completed: 3, dropped: 4 });
    const client = freshClient();
    const { result, rerender } = await renderHook(({ id }: { id?: string }) => useGameStats(id), {
      wrapper: wrapperFor(client),
      initialProps: { id: undefined } as { id?: string },
    });
    expect(mocked.stats).not.toHaveBeenCalled();

    await rerender({ id: 'g1' });
    await waitFor(() => expect(result.current.data?.playing).toBe(2));
    expect(mocked.stats).toHaveBeenCalledWith('g1');
    expect(client.getQueryData(['gameStats', 'g1'])).toBeDefined();
  });

  it('useGamePlayers asks for the ten playing players of the scope', async () => {
    mocked.players.mockResolvedValue([]);
    const client = freshClient();
    const { result } = await renderHook(() => useGamePlayers('g1', 'following'), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.players).toHaveBeenCalledWith('g1', {
      status: 'playing',
      scope: 'following',
      limit: 10,
    });
    expect(client.getQueryData(['gamePlayers', 'g1', 'following'])).toEqual([]);
  });

  it('useGamePlayers does not request without a game id', async () => {
    const { result } = await renderHook(() => useGamePlayers(undefined, 'all'), {
      wrapper: wrapperFor(freshClient()),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.players).not.toHaveBeenCalled();
  });
});

describe('useToggleFavorite', () => {
  function seed(client: QueryClient) {
    client.setQueryData(['game', 1942], game);
  }

  it('flips isFavoritedByMe immediately and keeps it on success', async () => {
    let resolve!: () => void;
    mocked.setFavorite.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    mocked.byIgdbId.mockResolvedValue({ ...game, isFavoritedByMe: true });
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFavorite(1942), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate({ gameId: 'g1', favorite: true });
    });
    expect(client.getQueryData<Game>(['game', 1942])?.isFavoritedByMe).toBe(true);
    expect(mocked.setFavorite).toHaveBeenCalledWith('g1', true);

    await act(async () => {
      resolve();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData<Game>(['game', 1942])?.isFavoritedByMe).toBe(true);
  });

  it('restores the previous value when the request fails', async () => {
    let reject!: (error: Error) => void;
    mocked.setFavorite.mockReturnValue(new Promise<void>((_, r) => (reject = r)));
    mocked.byIgdbId.mockResolvedValue(game);
    const client = freshClient();
    seed(client);
    const { result } = await renderHook(() => useToggleFavorite(1942), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate({ gameId: 'g1', favorite: true });
    });
    expect(client.getQueryData<Game>(['game', 1942])?.isFavoritedByMe).toBe(true);

    await act(async () => {
      reject(new Error('offline'));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<Game>(['game', 1942])?.isFavoritedByMe).toBe(false);
  });

  it('invalidates the game when the request settles', async () => {
    mocked.setFavorite.mockResolvedValue(undefined);
    const client = freshClient();
    seed(client);
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useToggleFavorite(1942), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ gameId: 'g1', favorite: true });
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['game', 1942] });
  });
});

describe('useGameSearch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function renderSearch(term: string, client = freshClient()) {
    return renderHook(({ value }: { value: string }) => useGameSearch(value), {
      wrapper: wrapperFor(client),
      initialProps: { value: term },
    });
  }

  it('makes no request for a term shorter than two characters', async () => {
    const { result } = await renderSearch(' h ');
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(mocked.search).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('debounces typing into a single request with an abort signal', async () => {
    mocked.search.mockResolvedValue([]);
    const client = freshClient();
    const { result, rerender } = await renderSearch('h', client);
    await rerender({ value: 'ha' });
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    await rerender({ value: 'hades' });
    await act(async () => {
      jest.advanceTimersByTime(299);
    });
    expect(mocked.search).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocked.search).toHaveBeenCalledTimes(1);
    expect(mocked.search).toHaveBeenCalledWith('hades', expect.any(AbortSignal));
    expect(client.getQueryData(['gameSearch', 'hades'])).toEqual([]);
  });

  it('keeps the previous results while the next term loads', async () => {
    const hades: GameSummary[] = [
      { igdbId: 1, name: 'Hades', coverUrl: null, platforms: [], genres: [] },
    ];
    let resolveNext!: (value: GameSummary[]) => void;
    mocked.search
      .mockResolvedValueOnce(hades)
      .mockReturnValueOnce(new Promise<GameSummary[]>((r) => (resolveNext = r)));
    const { result, rerender } = await renderSearch('hades');
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.data).toEqual(hades));

    await rerender({ value: 'hollow' });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    await waitFor(() => expect(mocked.search).toHaveBeenCalledTimes(2));
    expect(result.current.data).toEqual(hades);
    expect(result.current.isPlaceholderData).toBe(true);

    await act(async () => {
      resolveNext([]);
    });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });
});
