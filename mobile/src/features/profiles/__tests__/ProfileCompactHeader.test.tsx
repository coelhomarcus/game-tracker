import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { profilesApi } from '../api';
import { ProfileCompactHeader } from '../ProfileCompactHeader';
import { useProfile } from '../queries';
import type { UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/profiles/api', () => ({
  profilesApi: { get: jest.fn(), setFollow: jest.fn() },
}));
const mockRouter = { back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

const ana: UserProfile = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  followerCount: 2,
  followingCount: 3,
  entryCount: 4,
  isFollowedByMe: false,
  followsMe: false,
  isMutedByMe: false,
  isBlockedByMe: false,
  blocksMe: false,
  canMessage: true,
};

/** The compact header as the profile shows it: from the cached profile, which a follow rewrites. */
function FromCache() {
  const { data } = useProfile('u1');
  return data ? <ProfileCompactHeader profile={data} /> : null;
}

async function renderFromCache(client: QueryClient) {
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <FromCache />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

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

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({ status: 'signedIn', user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'] });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false } },
  });
  client.setQueryData(['profile', 'u1'], ana);
  jest.mocked(profilesApi.get).mockResolvedValue(ana);
});

afterEach(async () => {
  // The follow refetches both profiles once it settles; let that end inside the test.
  await waitFor(() => expect(client.isFetching() + client.isMutating()).toBe(0));
  // Query notifications go out on a zero-delay timer: flush the last ones inside act.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  client.clear();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ProfileCompactHeader', () => {
  it('shows back, the name and the handle, and goes back', async () => {
    await renderFromCache(client);

    expect(screen.getByRole('header', { name: 'Ana Souza' })).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('confirms the follow with a toast even though the button leaves on the optimistic write', async () => {
    const request = deferred();
    jest.mocked(profilesApi.setFollow).mockReturnValue(request.promise);
    await renderFromCache(client);

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));

    // Followed right away: the compact Seguir is gone before the server answers.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Seguir Ana Souza' })).toBeNull());
    expect(showToast).not.toHaveBeenCalled();

    // The follow settles, then refetches the profile: let all of it land inside act.
    await act(async () => {
      request.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(profilesApi.setFollow).toHaveBeenCalledWith('u1', true);
    expect(showToast).toHaveBeenCalledWith('Seguindo Ana Souza');
  });

  it('shows no "Seguindo" when the follow fails, and brings the button back', async () => {
    const request = deferred();
    jest.mocked(profilesApi.setFollow).mockReturnValue(request.promise);
    await renderFromCache(client);
    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));

    await act(async () => {
      request.reject(new Error('offline'));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    expect(showToast).not.toHaveBeenCalledWith('Seguindo Ana Souza');
    expect(screen.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
  });

  it.each([{ isBlockedByMe: true }, { blocksMe: true }])(
    'has no follow button while there is a block between them (%p)',
    async (flags) => {
      client.setQueryData(['profile', 'u1'], { ...ana, ...flags });
      await renderFromCache(client);

      expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull();
    },
  );

  it('has no follow button once the user follows them', async () => {
    client.setQueryData(['profile', 'u1'], { ...ana, isFollowedByMe: true });
    await renderFromCache(client);

    expect(screen.queryByRole('button', { name: /Seguir|Deixar de seguir/ })).toBeNull();
  });
});
