import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { showToast } from '@/lib/toast';

import { profilesApi } from '../api';
import { moderationKey, useSetModeration } from '../queries';
import type { ModerationPage, UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/profiles/api', () => ({
  profilesApi: { mutes: jest.fn(), blocks: jest.fn(), setMute: jest.fn(), setBlock: jest.fn() },
}));

const mocked = jest.mocked(profilesApi);

const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const flagOf = (flag: 'isMutedByMe' | 'isBlockedByMe') =>
  client.getQueryData<UserProfile>(['profile', 'u2'])?.[flag];

beforeEach(() => {
  jest.resetAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  client.setQueryData<Partial<UserProfile>>(['profile', 'u2'], {
    id: 'u2',
    isMutedByMe: false,
    isBlockedByMe: false,
  });
  client.setQueryData<InfiniteData<ModerationPage, string | undefined>>(moderationKey('mutes'), {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [undefined],
  });
});

afterEach(() => client.clear());

describe('useSetModeration', () => {
  it('mutes at once and marks the muted list stale once the server agrees', async () => {
    const request = deferred();
    mocked.setMute.mockReturnValueOnce(request.promise);
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    expect(mocked.setMute).toHaveBeenCalledWith('u2', true);
    expect(flagOf('isMutedByMe')).toBe(true);
    expect(client.getQueryState(moderationKey('mutes'))?.isInvalidated).toBe(false);
    await act(async () => request.resolve());

    await waitFor(() =>
      expect(client.getQueryState(moderationKey('mutes'))?.isInvalidated).toBe(true),
    );
    expect(client.getQueryState(['profile', 'u2'])?.isInvalidated).toBe(true);
  });

  it('rolls a failed block back with a toast and leaves the list alone', async () => {
    mocked.setBlock.mockRejectedValueOnce(new Error('boom'));
    const { result } = await renderHook(() => useSetModeration('blocks'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Não foi possível concluir. Tente de novo.'));
    expect(flagOf('isBlockedByMe')).toBe(false);
    expect(mocked.setMute).not.toHaveBeenCalled();
  });

  it('runs taps on one person in order and ends where the last tap did', async () => {
    const first = deferred();
    mocked.setMute.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    const { result } = await renderHook(() => useSetModeration('mutes'), { wrapper });

    await act(async () => result.current.mutate({ person: bia, on: true }));
    await act(async () => result.current.mutate({ person: bia, on: false }));
    expect(mocked.setMute).toHaveBeenCalledTimes(1);
    await act(async () => first.reject(new Error('boom')));

    await waitFor(() => expect(mocked.setMute).toHaveBeenCalledTimes(2));
    expect(mocked.setMute.mock.calls).toEqual([
      ['u2', true],
      ['u2', false],
    ]);
    // The earlier failure is not rolled back: the later tap decided the outcome.
    expect(flagOf('isMutedByMe')).toBe(false);
    expect(showToast).not.toHaveBeenCalled();
  });
});
