import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryClient as sharedQueryClient, useSession } from '@/features/auth';

import { libraryApi } from '../api';
import { useLibraryFilter } from '../filterStore';
import { useCreateEntry, useDeleteEntry, useLibrary, useUpdateEntry } from '../queries';
import type { EntryDraft, GameEntry } from '../types';

jest.mock('../api', () => ({
  libraryApi: {
    listMine: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));

const mocked = jest.mocked(libraryApi);

function entry(id: string): GameEntry {
  return {
    id,
    platform: 'PC',
    status: 'playing',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    game: {
      id: `g-${id}`,
      igdbId: 1,
      name: 'Hades',
      coverUrl: null,
      summary: null,
      screenshots: [],
      platforms: [],
      genres: [],
      isFavoritedByMe: false,
    },
  };
}

const draft: EntryDraft = {
  platform: 'PC',
  status: 'playing',
  startedAt: null,
  finishedAt: null,
  hoursPlayed: null,
  rating: null,
  notes: null,
};

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('useLibrary', () => {
  it('loads the entries under the library key', async () => {
    mocked.listMine.mockResolvedValue([entry('a')]);
    const client = freshClient();
    const { result } = await renderHook(() => useLibrary(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data).toEqual([entry('a')]));
    expect(client.getQueryData(['library'])).toEqual([entry('a')]);
  });

  it('refetches without the previous account records after sign-out clears the cache', async () => {
    mocked.listMine.mockResolvedValueOnce([entry('old')]);
    const first = await renderHook(() => useLibrary(), { wrapper: wrapperFor(sharedQueryClient) });
    await waitFor(() => expect(first.result.current.data).toEqual([entry('old')]));
    await first.unmount();

    useLibraryFilter.getState().setQuery('hades');
    await act(async () => {
      sharedQueryClient.clear();
      useSession.setState({ status: 'signedOut', user: null });
    });
    expect(useLibraryFilter.getState().query).toBe('');

    mocked.listMine.mockResolvedValueOnce([entry('new')]);
    const second = await renderHook(() => useLibrary(), {
      wrapper: wrapperFor(sharedQueryClient),
    });
    expect(second.result.current.data).toBeUndefined();
    await waitFor(() => expect(second.result.current.data).toEqual([entry('new')]));
    expect(mocked.listMine).toHaveBeenCalledTimes(2);
    await second.unmount();
    sharedQueryClient.clear();
  });
});

describe('library mutations', () => {
  it('useCreateEntry sends the draft and invalidates the library', async () => {
    mocked.create.mockResolvedValue(entry('a'));
    const client = freshClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCreateEntry(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ igdbId: 7, draft });
    });

    expect(mocked.create).toHaveBeenCalledWith(7, draft);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['library'] });
  });

  it('useUpdateEntry sends original and edited and invalidates the library', async () => {
    const original = entry('a');
    const edited = { ...draft, status: 'completed' as const };
    mocked.update.mockResolvedValue({ ...original, status: 'completed' });
    const client = freshClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateEntry(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync({ original, edited });
    });

    expect(mocked.update).toHaveBeenCalledWith(original, edited);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['library'] });
  });

  it('useDeleteEntry removes by id and invalidates the library', async () => {
    mocked.remove.mockResolvedValue(undefined);
    const client = freshClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useDeleteEntry(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await result.current.mutateAsync('a');
    });

    expect(mocked.remove).toHaveBeenCalledWith('a');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['library'] });
  });

  it('does not invalidate the library when the request fails', async () => {
    mocked.create.mockRejectedValue(new Error('boom'));
    const client = freshClient();
    const spy = jest.spyOn(client, 'invalidateQueries');
    const { result } = await renderHook(() => useCreateEntry(), { wrapper: wrapperFor(client) });

    await act(async () => {
      await expect(result.current.mutateAsync({ igdbId: 7, draft })).rejects.toThrow('boom');
    });

    expect(spy).not.toHaveBeenCalled();
  });
});
