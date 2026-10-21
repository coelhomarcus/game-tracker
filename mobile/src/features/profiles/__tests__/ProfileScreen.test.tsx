import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import UserRoute from '@/app/users/[id]';
import { useSession } from '@/features/auth';
import type { Post } from '@/features/feed/types';
import type { Game } from '@/features/games/types';
import type { GameEntry } from '@/features/library/types';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { ProfileScreen } from '../ProfileScreen';
import { useProfile, useUserEntries, useUserFavorites, useUserPosts } from '../queries';
import type { UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../queries', () => ({
  useProfile: jest.fn(),
  useUserPosts: jest.fn(),
  useUserEntries: jest.fn(),
  useUserFavorites: jest.fn(),
  useToggleFollow: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/feed/queries', () => ({
  useTogglePostLike: () => ({ mutate: jest.fn() }),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
const mockParams: { id?: string } = {};
const mockScreenOptions = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
  Stack: {
    Screen: ({ options }: { options: unknown }) => {
      mockScreenOptions(options);
      return null;
    },
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const profile: UserProfile = {
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
};

function game(id: string, igdbId: number, name: string): Game {
  return {
    id,
    igdbId,
    name,
    coverUrl: null,
    summary: null,
    screenshots: [],
    platforms: [],
    genres: [],
    isFavoritedByMe: false,
  };
}

const hades = game('g1', 11, 'Hades');
const celeste = game('g2', 22, 'Celeste');

function entry(overrides: Partial<GameEntry> & { id: string; game: Game }): GameEntry {
  return {
    platform: 'PC',
    status: 'backlog',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    createdAt: new Date(2026, 2, 5, 12),
    ...overrides,
  };
}

const ENTRIES: GameEntry[] = [
  entry({ id: 'e1', game: hades, status: 'playing', createdAt: new Date(2026, 2, 5, 12) }),
  entry({ id: 'e2', game: celeste, status: 'completed', createdAt: new Date(2026, 1, 9, 12) }),
];

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...overrides,
  };
}

const refetchProfile = jest.fn();
const refetchEntries = jest.fn();
const refetchFavorites = jest.fn();
const refetchPosts = jest.fn();

function mockProfile(overrides: Record<string, unknown> = {}) {
  jest.mocked(useProfile).mockReturnValue({
    data: profile,
    isPending: false,
    isError: false,
    error: null,
    refetch: refetchProfile,
    ...overrides,
  } as unknown as ReturnType<typeof useProfile>);
}

function mockEntries(data: GameEntry[] | undefined, overrides: Record<string, unknown> = {}) {
  jest.mocked(useUserEntries).mockReturnValue({
    data,
    isPending: data === undefined,
    isError: false,
    refetch: refetchEntries,
    ...overrides,
  } as unknown as ReturnType<typeof useUserEntries>);
}

function mockFavorites(data: Game[]) {
  jest.mocked(useUserFavorites).mockReturnValue({
    data,
    refetch: refetchFavorites,
  } as unknown as ReturnType<typeof useUserFavorites>);
}

function mockPosts(items: Post[], overrides: Record<string, unknown> = {}) {
  jest.mocked(useUserPosts).mockReturnValue({
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: jest.fn(),
    refetch: refetchPosts,
    ...overrides,
  } as unknown as ReturnType<typeof useUserPosts>);
}

function signInAs(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id } as ReturnType<typeof useSession.getState>['user'],
  });
}

async function settleGrid() {
  const grid = screen.queryByTestId('cover-grid');
  if (!grid) return;
  await fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 358, height: 800 } } });
  // FlashList flags itself as loaded from a zero-delay timer; let it settle inside act.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderProfile(userId = 'u1', tabRoot = false) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ProfileScreen userId={userId} tabRoot={tabRoot} />
    </SafeAreaProvider>,
  );
  await settleGrid();
}

async function openTab(name: string) {
  await fireEvent.press(screen.getByRole('tab', { name }));
  await settleGrid();
}

type JsonNode = ReturnType<typeof screen.toJSON>;

/** The refresh control FlashList hands to its scroll view. */
function findRefreshControl(node: JsonNode | JsonNode[]): { props: Record<string, any> } {
  const nodes = Array.isArray(node) ? node : [node];
  for (const current of nodes) {
    if (current === null || typeof current === 'string') continue;
    if (current.props.refreshControl) return current.props.refreshControl;
    const found = current.children ? findRefreshControl(current.children as JsonNode[]) : undefined;
    if (found) return found;
  }
  return undefined as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNavigation.addListener.mockReturnValue(jest.fn());
  mockNavigation.isFocused.mockReturnValue(true);
  for (const refetch of [refetchProfile, refetchEntries, refetchFavorites, refetchPosts]) {
    refetch.mockResolvedValue({ isError: false });
  }
  delete mockParams.id;
  signInAs('me');
  mockProfile();
  mockEntries(ENTRIES);
  mockFavorites([]);
  mockPosts([]);
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('actions', () => {
  it('shows Editar perfil and no follow button on the own profile', async () => {
    signInAs('u1');
    await renderProfile('u1');

    expect(screen.getByRole('button', { name: 'Editar perfil' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Editar perfil' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/me/edit');
  });

  it('shows Seguir and no edit button on somebody else', async () => {
    await renderProfile('u1');

    expect(screen.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).toBeNull();
  });
});

describe('loading and errors', () => {
  it('shows a spinner while the profile loads', async () => {
    mockProfile({ data: undefined, isPending: true });
    await renderProfile();

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
  });

  it('explains a missing account and goes back', async () => {
    mockProfile({ data: undefined, isError: true, error: new ApiError(404, 'not_found', 'x') });
    await renderProfile();

    expect(screen.getByText('Perfil não encontrado')).toBeOnTheScreen();
    expect(screen.getByText('Esta conta pode ter sido removida.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('offers a retry for any other error', async () => {
    mockProfile({ data: undefined, isError: true, error: new ApiError(500, 'boom', 'x') });
    await renderProfile();

    expect(screen.getByText('Não foi possível carregar o perfil')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchProfile).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded profile when a refetch fails', async () => {
    mockProfile({ isError: true, error: new ApiError(500, 'boom', 'x') });
    await renderProfile();

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar o perfil')).toBeNull();
  });
});

describe('Jogos', () => {
  it('starts on Jogos and requests the entries and favorites of the user', async () => {
    await renderProfile('u1');

    expect(screen.getByRole('tab', { name: 'Jogos', selected: true })).toBeOnTheScreen();
    expect(useUserEntries).toHaveBeenCalledWith('u1');
    expect(useUserFavorites).toHaveBeenCalledWith('u1');
  });

  it('shows the favorites row and opens a game from it', async () => {
    mockFavorites([hades]);
    await renderProfile();

    expect(screen.getByText('Favoritos')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Hades' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/games/11');
  });

  it('hides the favorites section when there are none', async () => {
    await renderProfile();

    expect(screen.queryByText('Favoritos')).toBeNull();
  });

  it('shows the status tabs with counts and filters the cards', async () => {
    await renderProfile();

    expect(screen.getByRole('tab', { name: 'Todos (2)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Jogando (1)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Concluído (1)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Na fila (0)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Abandonado (0)' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hades, Jogando, PC' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Celeste, Concluído, PC' })).toBeOnTheScreen();
    expect(screen.getAllByTestId('library-card-status')).toHaveLength(2);

    await fireEvent.press(screen.getByRole('tab', { name: 'Concluído (1)' }));
    expect(screen.queryByRole('button', { name: /^Hades/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Celeste, Concluído, PC' })).toBeOnTheScreen();
    expect(screen.queryByTestId('library-card-status')).toBeNull();
  });

  it('puts the date the game was added under the cover and opens the game on press', async () => {
    await renderProfile();

    expect(screen.getByText('05/03/26')).toBeOnTheScreen();
    expect(screen.getByText('09/02/26')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Hades, Jogando, PC' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/games/11');
  });

  it('says so when no game has the chosen status', async () => {
    await renderProfile();

    await fireEvent.press(screen.getByRole('tab', { name: 'Na fila (0)' }));
    expect(screen.getByText('Nenhum jogo neste status.')).toBeOnTheScreen();
  });

  it('tells the owner an empty collection is empty', async () => {
    signInAs('u1');
    mockEntries([]);
    await renderProfile('u1');

    expect(screen.getByText('Sua coleção está vazia')).toBeOnTheScreen();
    expect(screen.getByText('Adicione jogos na Biblioteca.')).toBeOnTheScreen();
  });

  it('tells a visitor an empty collection is empty', async () => {
    mockEntries([]);
    await renderProfile('u1');

    expect(screen.getByText('Coleção vazia')).toBeOnTheScreen();
    expect(screen.getByText('Esta pessoa ainda não registrou jogos.')).toBeOnTheScreen();
  });

  it('offers a retry when the collection fails to load', async () => {
    mockEntries(undefined, { isPending: false, isError: true });
    await renderProfile();

    expect(screen.getByText('Não foi possível carregar os jogos')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });

  it('refetches the profile, the entries and the favorites on pull to refresh', async () => {
    await renderProfile();

    const control = findRefreshControl(screen.toJSON());
    await act(async () => control.props.onRefresh());

    expect(refetchProfile).toHaveBeenCalledTimes(1);
    expect(refetchEntries).toHaveBeenCalledTimes(1);
    expect(refetchFavorites).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('tells the user when the refresh fails', async () => {
    refetchEntries.mockResolvedValue({ isError: true });
    await renderProfile();

    const control = findRefreshControl(screen.toJSON());
    await act(async () => control.props.onRefresh());

    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar o perfil');
  });

  it('listens for a press on the Perfil tab only when it is the tab root', async () => {
    await renderProfile('u1', false);
    expect(mockNavigation.addListener).not.toHaveBeenCalled();
  });

  it('scrolls back to the top when the Perfil tab is pressed again', async () => {
    await renderProfile('u1', true);
    expect(mockNavigation.addListener).toHaveBeenCalledWith('tabPress', expect.any(Function));
  });
});

describe('Atividade and Posts', () => {
  it('requests the activity of the user and shows it', async () => {
    mockPosts([post({ id: 'a1', type: 'activity', content: 'começou a jogar Hades' })]);
    await renderProfile('u1');
    await openTab('Atividade');

    expect(useUserPosts).toHaveBeenLastCalledWith('u1', 'activity');
    expect(screen.getByText(/começou a jogar Hades/)).toBeOnTheScreen();
  });

  it('requests the written posts of the user and shows them', async () => {
    mockPosts([post()]);
    await renderProfile('u1');
    await openTab('Posts');

    expect(useUserPosts).toHaveBeenLastCalledWith('u1', 'post');
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Posts', selected: true })).toBeOnTheScreen();
  });

  it('keeps the profile header above the list', async () => {
    await renderProfile();
    await openTab('Posts');

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
  });

  it('opens a post', async () => {
    mockPosts([post()]);
    await renderProfile();
    await openTab('Posts');

    await fireEvent.press(screen.getByRole('button', { name: /^Post de Ana Souza/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/posts/p1');
  });

  it('has empty copy for each list', async () => {
    await renderProfile();

    await openTab('Atividade');
    expect(screen.getByText('Ainda não há atividades')).toBeOnTheScreen();
    await openTab('Posts');
    expect(screen.getByText('Ainda não há posts')).toBeOnTheScreen();
  });

  it('shows a spinner while the list loads and a retry when it fails', async () => {
    mockPosts([], { data: undefined, isPending: true });
    await renderProfile();
    await openTab('Posts');
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByText('Ainda não há posts')).toBeNull();

    mockPosts([], { data: undefined, isPending: false, isError: true });
    await openTab('Atividade');
    expect(screen.getByText('Não foi possível carregar a atividade')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchPosts).toHaveBeenCalledTimes(1);
  });

  it('refetches the profile and the list on pull to refresh', async () => {
    mockPosts([post()]);
    await renderProfile();
    await openTab('Posts');

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(refetchProfile).toHaveBeenCalledTimes(1);
    expect(refetchPosts).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('tells the user when the refresh rejects', async () => {
    refetchPosts.mockRejectedValue(new Error('offline'));
    mockPosts([post()]);
    await renderProfile();
    await openTab('Posts');

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar o perfil');
  });
});

describe('/users/[id]', () => {
  async function renderRoute() {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <UserRoute />
      </SafeAreaProvider>,
    );
    await settleGrid();
  }

  it('replaces the route with the Perfil tab when the id is the signed-in user', async () => {
    mockParams.id = 'me';
    await renderRoute();

    expect(mockRouter.replace).toHaveBeenCalledWith('/profile');
    expect(screen.queryByText('Ana Souza')).toBeNull();
  });

  it('shows the profile of somebody else and titles the screen with their name', async () => {
    mockParams.id = 'u1';
    await renderRoute();

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useProfile).toHaveBeenCalledWith('u1');
    expect(screen.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
    expect(mockScreenOptions).toHaveBeenLastCalledWith({ title: 'Ana Souza' });
  });

  it('uses the username as title when the name is blank', async () => {
    mockParams.id = 'u1';
    mockProfile({ data: { ...profile, name: ' ' } });
    await renderRoute();

    expect(mockScreenOptions).toHaveBeenLastCalledWith({ title: 'ana' });
  });

  it('has no title before the profile loads', async () => {
    mockParams.id = 'u1';
    mockProfile({ data: undefined, isPending: true });
    await renderRoute();

    expect(mockScreenOptions).toHaveBeenLastCalledWith({ title: '' });
  });
});
