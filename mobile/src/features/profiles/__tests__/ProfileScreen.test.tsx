import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import UserRoute from '@/app/users/[id]';
import { useSession } from '@/features/auth';
import { useStartConversation } from '@/features/chat/queries';
import type { Post } from '@/features/feed/types';
import type { Game } from '@/features/games/types';
import type { GameEntry } from '@/features/library/types';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { ProfileScreen } from '../ProfileScreen';
import {
  useProfile,
  useUserEntries,
  useUserFavorites,
  useUserPosts,
  useUserReplies,
} from '../queries';
import type { UserProfile, UserReply } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../queries', () => ({
  useProfile: jest.fn(),
  useUserPosts: jest.fn(),
  useUserReplies: jest.fn(),
  useUserEntries: jest.fn(),
  useUserFavorites: jest.fn(),
  useToggleFollow: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/chat/queries', () => ({ useStartConversation: jest.fn() }));
jest.mock('@/features/feed/queries', () => ({
  ...jest.requireActual<typeof import('@/test-utils/postControlHooks')>(
    '@/test-utils/postControlHooks',
  ).postControlHooks(),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};
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
  followsMe: false,
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
    ...socialDefaults,
    ...overrides,
  };
}

const startConversation = jest.fn();

function mockStart(overrides: Record<string, unknown> = {}) {
  jest.mocked(useStartConversation).mockReturnValue({
    mutateAsync: startConversation,
    isPending: false,
    ...overrides,
  } as unknown as ReturnType<typeof useStartConversation>);
}

const refetchProfile = jest.fn();
const refetchEntries = jest.fn();
const refetchFavorites = jest.fn();
const refetchPosts = jest.fn();
const refetchReplies = jest.fn();

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

function mockReplies(items: UserReply[], overrides: Record<string, unknown> = {}) {
  jest.mocked(useUserReplies).mockReturnValue({
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: jest.fn(),
    refetch: refetchReplies,
    ...overrides,
  } as unknown as ReturnType<typeof useUserReplies>);
}

function signInAs(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id } as ReturnType<typeof useSession.getState>['user'],
  });
}

/** Set by the suites that run on fake timers. */
let fakeTimers = false;

async function settleGrid() {
  const grid = screen.queryByTestId('cover-grid', { includeHiddenElements: true });
  if (!grid) return;
  await fireEvent(grid, 'layout', { nativeEvent: { layout: { width: 358, height: 800 } } });
  // FlashList flags itself as loaded from a zero-delay timer; let it settle inside act.
  await act(async () => {
    if (fakeTimers) jest.advanceTimersByTime(0);
    else await new Promise((resolve) => setTimeout(resolve, 0));
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

/** Measures the pager's header (the part above the tab bar) and its 48 dp tab bar. */
async function layOutHeader(height: number) {
  await fireEvent(screen.getByTestId('pager-header-content'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height } },
  });
  await fireEvent(screen.getByTestId('pager-tab-bar'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 48 } },
  });
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
  for (const refetch of [refetchProfile, refetchEntries, refetchFavorites, refetchPosts, refetchReplies]) {
    refetch.mockResolvedValue({ isError: false });
  }
  delete mockParams.id;
  signInAs('me');
  mockProfile();
  mockEntries(ENTRIES);
  mockFavorites([]);
  mockPosts([]);
  mockReplies([]);
  mockStart();
  startConversation.mockResolvedValue('c9');
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

describe('Mensagem', () => {
  it('sits beside the follow button in the row of buttons', async () => {
    await renderProfile('u1');

    const row = screen.getByTestId('profile-actions');
    expect(
      within(row).getByRole('button', { name: 'Enviar mensagem para Ana Souza' }),
    ).toBeOnTheScreen();
    expect(within(row).getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
  });

  it('is absent while the profile loads', async () => {
    mockProfile({ data: undefined, isPending: true });
    await renderProfile('u1');
    expect(screen.queryByRole('button', { name: /Enviar mensagem/ })).toBeNull();
  });

  it('is absent when the profile failed to load', async () => {
    mockProfile({ data: undefined, isError: true, error: new ApiError(500, 'boom', 'x') });
    await renderProfile('u1');
    expect(screen.queryByRole('button', { name: /Enviar mensagem/ })).toBeNull();
  });

  it('is not offered on the own profile', async () => {
    signInAs('u1');
    await renderProfile('u1');

    expect(screen.queryByRole('button', { name: /Enviar mensagem/ })).toBeNull();
  });

  it('opens the conversation with the user', async () => {
    await renderProfile('u1');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' }));

    expect(startConversation).toHaveBeenCalledWith('u1');
    expect(mockRouter.push).toHaveBeenCalledWith('/chat/c9');
  });

  it('ignores a second press while the conversation is starting', async () => {
    let release: (id: string) => void = () => undefined;
    startConversation.mockReturnValue(new Promise<string>((resolve) => (release = resolve)));
    await renderProfile('u1');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' }));
    expect(startConversation).toHaveBeenCalledTimes(1);

    await act(async () => release('c9'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  });

  it('is disabled while the conversation starts', async () => {
    mockStart({ isPending: true });
    await renderProfile('u1');

    expect(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' })).toBeDisabled();
  });

  it('tells the user when the conversation cannot start and allows trying again', async () => {
    startConversation.mockRejectedValueOnce(new ApiError(500, 'boom', 'x'));
    await renderProfile('u1');

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' }));

    expect(showToast).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem para Ana Souza' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/chat/c9');
  });
});

describe('loading and errors', () => {
  it('shows the header skeleton while the profile loads', async () => {
    mockProfile({ data: undefined, isPending: true });
    await renderProfile();

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-skeleton')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
  });

  it('has no back button while the own profile loads', async () => {
    signInAs('u1');
    mockProfile({ data: undefined, isPending: true });
    await renderProfile('u1');

    expect(screen.getByTestId('profile-skeleton')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  });

  it('keeps a way back when the profile fails to load', async () => {
    mockProfile({ data: undefined, isError: true, error: new ApiError(500, 'boom', 'x') });
    await renderProfile();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('draws the back button of the error state after the filling message, so it stays on top', async () => {
    mockProfile({ data: undefined, isError: true, error: new ApiError(500, 'boom', 'x') });
    await renderProfile();

    const back = screen.getByRole('button', { name: 'Voltar' });
    const siblings = (back.parent?.children ?? []).filter((child) => typeof child !== 'string');
    const messageAt = siblings.findIndex(
      (child) => within(child).queryByText('Não foi possível carregar o perfil') !== null,
    );
    expect(messageAt).toBeGreaterThanOrEqual(0);
    expect(siblings.indexOf(back)).toBeGreaterThan(messageAt);
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

describe('tabs', () => {
  it('lists Jogos, Posts, Respostas and Mídia on somebody else', async () => {
    await renderProfile('u1');

    const tabs = within(screen.getByTestId('pager-tab-bar'))
      .getAllByRole('tab')
      .map((tab) => tab.props.accessibilityLabel);
    expect(tabs).toEqual(['Jogos', 'Posts', 'Respostas', 'Mídia']);
    expect(screen.queryByRole('tab', { name: 'Curtidas' })).toBeNull();
  });

  it('adds Curtidas on the own profile', async () => {
    signInAs('u1');
    await renderProfile('u1');

    const tabs = within(screen.getByTestId('pager-tab-bar'))
      .getAllByRole('tab')
      .map((tab) => tab.props.accessibilityLabel);
    expect(tabs).toEqual(['Jogos', 'Posts', 'Respostas', 'Mídia', 'Curtidas']);
  });

  it('loads a tab only once it is opened', async () => {
    await renderProfile('u1');
    expect(useUserPosts).not.toHaveBeenCalled();
    expect(useUserReplies).not.toHaveBeenCalled();

    await openTab('Respostas');
    expect(useUserReplies).toHaveBeenCalledWith('u1');
    expect(useUserPosts).not.toHaveBeenCalled();
  });

  it.each([
    ['own', 'u1'],
    ['other', 'me'],
  ])('offers the compose button on the %s profile', async (_kind, signedIn) => {
    signInAs(signedIn);
    await renderProfile('u1');

    await fireEvent.press(screen.getByRole('button', { name: 'Publicar' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/posts/new');
  });

  it('keeps the profile header above every tab', async () => {
    await renderProfile();
    await openTab('Respostas');

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
  });
});

describe('Posts', () => {
  it('requests the posts and reposts of the user and shows them', async () => {
    mockPosts([post()]);
    await renderProfile('u1');
    await openTab('Posts');

    expect(useUserPosts).toHaveBeenLastCalledWith('u1', 'posts');
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Posts', selected: true })).toBeOnTheScreen();
  });

  it('opens a post', async () => {
    mockPosts([post()]);
    await renderProfile();
    await openTab('Posts');

    await fireEvent.press(screen.getByRole('button', { name: /^Post de Ana Souza/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/posts/p1');
  });

  it('says so when there are no posts', async () => {
    await renderProfile('u1');
    await openTab('Posts');

    expect(screen.getByText('Nenhum post ainda')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Escrever um post' })).toBeNull();
  });

  it('invites the owner to write the first post', async () => {
    signInAs('u1');
    await renderProfile('u1');
    await openTab('Posts');

    expect(screen.getByText('Nenhum post ainda')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Escrever um post' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/posts/new');
  });

  it('shows a spinner while the list loads and a retry when it fails', async () => {
    mockPosts([], { data: undefined, isPending: true });
    await renderProfile();
    await openTab('Posts');
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByText('Nenhum post ainda')).toBeNull();

    mockPosts([], { data: undefined, isPending: false, isError: true });
    await openTab('Mídia');
    expect(screen.getByText('Não foi possível carregar a mídia')).toBeOnTheScreen();
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

describe('Respostas', () => {
  const reply: UserReply = {
    id: 'c1',
    postId: 'p7',
    parentCommentId: null,
    content: 'Também zerei!',
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    post: {
      id: 'p7',
      author: { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null },
      content: 'Hades é o melhor roguelike',
    },
  };

  it('shows each comment with the post it answers and opens that post', async () => {
    mockReplies([reply]);
    await renderProfile('u1');
    await openTab('Respostas');

    expect(useUserReplies).toHaveBeenLastCalledWith('u1');
    const row = screen.getByTestId('profile-reply');
    expect(within(row).getByText('Também zerei!')).toBeOnTheScreen();
    expect(within(row).getByText('Respondendo ao post de @bia')).toBeOnTheScreen();
    expect(within(row).getByText('Hades é o melhor roguelike')).toBeOnTheScreen();
    expect(within(row).getByText('Ana Souza')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /^Resposta de Ana Souza/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/posts/p7');
  });

  it('says so when there are no replies', async () => {
    await renderProfile('u1');
    await openTab('Respostas');

    expect(screen.getByText('Nenhuma resposta ainda')).toBeOnTheScreen();
  });

  it('loads more replies at the end of the list', async () => {
    const fetchNextPage = jest.fn();
    mockReplies([reply], { hasNextPage: true, fetchNextPage });
    await renderProfile('u1');
    await openTab('Respostas');

    await fireEvent(screen.getByTestId('profile-replies'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the replies fail to load', async () => {
    mockReplies([], { data: undefined, isError: true });
    await renderProfile('u1');
    await openTab('Respostas');

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchReplies).toHaveBeenCalledTimes(1);
  });
});

describe('Mídia', () => {
  it('requests the posts with images of the user', async () => {
    mockPosts([post({ id: 'm1', content: 'Print do chefe final' })]);
    await renderProfile('u1');
    await openTab('Mídia');

    expect(useUserPosts).toHaveBeenLastCalledWith('u1', 'media');
    expect(screen.getByText('Print do chefe final')).toBeOnTheScreen();
  });

  it('says so when there is no media', async () => {
    await renderProfile('u1');
    await openTab('Mídia');

    expect(screen.getByText('Nenhuma mídia ainda')).toBeOnTheScreen();
  });
});

describe('Curtidas', () => {
  it('lists the posts the user liked on the own profile', async () => {
    signInAs('u1');
    mockPosts([post({ id: 'l1', content: 'Um post curtido' })]);
    await renderProfile('u1');
    await openTab('Curtidas');

    expect(useUserPosts).toHaveBeenLastCalledWith('u1', 'likes');
    expect(screen.getByText('Um post curtido')).toBeOnTheScreen();
  });

  it('says so when nothing is liked yet', async () => {
    signInAs('u1');
    await renderProfile('u1');
    await openTab('Curtidas');

    expect(screen.getByText('Nenhuma curtida ainda')).toBeOnTheScreen();
  });
});

describe('pull to refresh on every tab', () => {
  it.each(['Posts', 'Respostas', 'Mídia', 'Curtidas'])(
    '%s refetches the profile and its list, with the spinner below the header',
    async (tab) => {
      signInAs('u1');
      await renderProfile('u1');
      await layOutHeader(400);
      await openTab(tab);

      const list = screen.getByTestId(tab === 'Respostas' ? 'profile-replies' : 'post-list');
      const control = list.props.refreshControl;
      expect(control.props.progressViewOffset).toBe(400 + 48);
      await act(async () => control.props.onRefresh());

      expect(refetchProfile).toHaveBeenCalledTimes(1);
      expect(tab === 'Respostas' ? refetchReplies : refetchPosts).toHaveBeenCalledTimes(1);
    },
  );

  it('Jogos puts its spinner below the header too', async () => {
    await renderProfile();
    await layOutHeader(400);
    await settleGrid();

    expect(findRefreshControl(screen.toJSON()).props.progressViewOffset).toBe(400 + 48);
  });
});

describe('collapsing header', () => {
  type Style = { opacity?: number; transform?: { translateY: number }[] };
  // The types describe the web stub, which takes no argument; jest runs the native helper.
  const readAnimatedStyle = getAnimatedStyle as unknown as (element: unknown) => Style;

  async function scrollPosts(y: number) {
    await fireEvent.scroll(screen.getByTestId('post-list'), {
      nativeEvent: { contentOffset: { x: 0, y } },
    });
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    fakeTimers = true;
  });

  afterEach(() => {
    jest.useRealTimers();
    fakeTimers = false;
  });

  it('collapses under the compact header of somebody else, which fades in with back, name and follow', async () => {
    mockPosts([post()]);
    await renderProfile('u1');
    await layOutHeader(400);
    await fireEvent(screen.getByTestId('pager-compact-header', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 48 } },
    });
    await openTab('Posts');

    await scrollPosts(600);

    const header = screen.getByTestId('pager-header');
    expect(readAnimatedStyle(header).transform?.[0].translateY).toBeCloseTo(-(400 - 48));
    const compact = within(screen.getByTestId('pager-compact-header'));
    expect(compact.getByRole('header', { name: 'Ana Souza' })).toBeOnTheScreen();
    expect(compact.getByText('@ana')).toBeOnTheScreen();
    expect(compact.getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();

    await fireEvent.press(compact.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('leaves the compact follow out once the user follows them', async () => {
    mockProfile({ data: { ...profile, isFollowedByMe: true } });
    mockPosts([post()]);
    await renderProfile('u1');
    await openTab('Posts');
    await scrollPosts(600);

    const compact = within(screen.getByTestId('pager-compact-header'));
    expect(compact.getByRole('header', { name: 'Ana Souza' })).toBeOnTheScreen();
    expect(compact.queryByRole('button', { name: /Seguir|Deixar de seguir/ })).toBeNull();
  });

  it('collapses the own profile under the Perfil header, with no compact header', async () => {
    signInAs('u1');
    mockPosts([post()]);
    await renderProfile('u1', true);
    await layOutHeader(400);
    await openTab('Posts');
    await scrollPosts(600);

    expect(screen.queryByTestId('pager-compact-header', { includeHiddenElements: true })).toBeNull();
    expect(
      readAnimatedStyle(screen.getByTestId('pager-header')).transform?.[0].translateY,
    ).toBeCloseTo(-400);
  });
});

describe('Perfil tab', () => {
  it('scrolls the list on screen back to the top when the Perfil tab is pressed again', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    signInAs('u1');
    mockPosts([post()]);
    await renderProfile('u1', true);
    await openTab('Posts');
    scrollToOffset.mockClear();

    const [, listener] = mockNavigation.addListener.mock.calls[0];
    await act(async () => listener());

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    scrollToOffset.mockRestore();
  });

  it('ignores the Perfil tab press while another screen is on top', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    signInAs('u1');
    await renderProfile('u1', true);
    await openTab('Posts');
    scrollToOffset.mockClear();
    mockNavigation.isFocused.mockReturnValue(false);

    const [, listener] = mockNavigation.addListener.mock.calls[0];
    await act(async () => listener());

    expect(scrollToOffset).not.toHaveBeenCalled();
    scrollToOffset.mockRestore();
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
