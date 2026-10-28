import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { createRef } from 'react';
import { FlatList, Keyboard, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { usePostSearch } from '@/features/feed/queries';
import type { Post } from '@/features/feed/types';
import { useGameSearch, useTrendingGames } from '@/features/games/queries';
import type { Game, GameSummary } from '@/features/games/types';
import { useLibrary } from '@/features/library/queries';
import type { GameEntry } from '@/features/library/types';
import { useFollowSuggestions, usePeopleSearch } from '@/features/profiles/queries';
import type { PersonResult } from '@/features/profiles/types';
import { socialDefaults } from '@/test-utils/postDefaults';

import { ExploreScreen } from '../ExploreScreen';
import { PERSON_AVATAR } from '../SearchRecents';
import { useRecentSearches } from '../recentSearches';

jest.mock('@/features/games/queries', () => ({
  useGameSearch: jest.fn(),
  useTrendingGames: jest.fn(),
}));
jest.mock('@/features/library/queries', () => ({ useLibrary: jest.fn() }));
const mockFollow = jest.fn();
jest.mock('@/features/profiles/queries', () => ({
  usePeopleSearch: jest.fn(),
  useFollowSuggestions: jest.fn(),
  useToggleFollow: () => ({ mutate: mockFollow }),
}));
jest.mock('@/features/feed/queries', () => ({
  usePostSearch: jest.fn(),
  ...jest
    .requireActual<typeof import('@/test-utils/postControlHooks')>('@/test-utils/postControlHooks')
    .postControlHooks(),
}));

const mockPush = jest.fn();
const mockSetParams = jest.fn();
const mockTabPress: (() => void)[] = [];
const mockNavigation = {
  addListener: jest.fn((_event: string, listener: () => void) => {
    mockTabPress.push(listener);
    return () => {
      const at = mockTabPress.indexOf(listener);
      if (at >= 0) mockTabPress.splice(at, 1);
    };
  }),
  isFocused: jest.fn(() => true),
};
const mockRouter = { push: mockPush, setParams: mockSetParams };
let mockParams: { tab?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const hades: GameSummary = { igdbId: 11, name: 'Hades', coverUrl: null, platforms: ['PC', 'Switch'], genres: [] };
const celeste: GameSummary = { igdbId: 22, name: 'Celeste', coverUrl: null, platforms: [], genres: [] };

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

const post: Post = {
  id: 'p1',
  author: { id: 'u3', username: 'caio', name: 'Caio', avatarUrl: null },
  content: 'Zerei Hades hoje',
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
};

const refetch = jest.fn();

function mockGames(overrides: Record<string, unknown> = {}) {
  jest.mocked(useGameSearch).mockReturnValue({
    data: [hades, celeste],
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useGameSearch>);
}

function mockPeople(overrides: Record<string, unknown> = {}) {
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

const fetchNextPage = jest.fn();

function mockPosts(overrides: Record<string, unknown> = {}) {
  jest.mocked(usePostSearch).mockReturnValue({
    data: { pages: [{ items: [post], nextCursor: 'c1' }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: true,
    fetchNextPage,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof usePostSearch>);
}

function mockLibrary(igdbIds: number[]) {
  const data = igdbIds.map(
    (igdbId) => ({ id: `e${igdbId}`, game: { igdbId } as Game }) as unknown as GameEntry,
  );
  jest.mocked(useLibrary).mockReturnValue({ data } as unknown as ReturnType<typeof useLibrary>);
}

const explore = () => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ExploreScreen />
  </SafeAreaProvider>
);

async function renderExplore() {
  await render(explore());
}

/** The grid renders nothing until it has been measured. */
async function layoutGrid() {
  await fireEvent(screen.getByTestId('cover-grid'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 800 } },
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const field = () => screen.getByLabelText('Buscar');

async function focusField() {
  await fireEvent(field(), 'focus');
}

async function type(text: string) {
  await fireEvent.changeText(field(), text);
}

/** Types a term and lays out the games grid, the tab the results open on. */
async function searchGames(text: string) {
  await focusField();
  await type(text);
  await layoutGrid();
}

const recents = () => useRecentSearches.getState().recents.me ?? { terms: [], people: [] };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockTabPress.length = 0;
  mockNavigation.isFocused.mockReturnValue(true);
  mockGames();
  mockPeople();
  mockPosts();
  mockLibrary([]);
  jest.mocked(useTrendingGames).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useTrendingGames>);
  jest.mocked(useFollowSuggestions).mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useFollowSuggestions>);
  useRecentSearches.setState({ recents: {} });
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ExploreScreen search field', () => {
  it('shows the placeholder, no Cancelar and the discovery modules until focused', async () => {
    await renderExplore();

    expect(field().props.placeholder).toBe('Buscar jogos, pessoas e posts');
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeOnTheScreen();
    expect(screen.getByTestId('explore-discovery')).toBeOnTheScreen();
    expect(screen.queryByTestId('search-recents')).not.toBeOnTheScreen();
  });

  it('enters focus mode on focus: Cancelar and the recents', async () => {
    useRecentSearches.getState().addTerm('me', 'hades');
    useRecentSearches.getState().addPerson('me', ana);
    await renderExplore();
    await focusField();

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    expect(screen.queryByTestId('explore-discovery')).not.toBeOnTheScreen();
    expect(screen.getByText('Pessoas recentes')).toBeOnTheScreen();
    expect(screen.getByText('Buscas recentes')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Buscar hades' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Perfil de Ana Souza' })).toBeOnTheScreen();
  });

  it('stays in focus mode when the keyboard goes away', async () => {
    await renderExplore();
    await focusField();
    await fireEvent(field(), 'blur');

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-recents')).toBeOnTheScreen();
  });

  it('Cancelar clears the term, hides the keyboard and leaves focus mode', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderExplore();
    await searchGames('ha');

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(field().props.value).toBe('');
    expect(dismiss).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeOnTheScreen();
    expect(screen.getByTestId('explore-discovery')).toBeOnTheScreen();
  });

  it('shows the clear button only with text, and clearing goes back to the recents', async () => {
    await renderExplore();
    await focusField();
    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeOnTheScreen();

    await type('ha');
    await layoutGrid();
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar busca' }));

    expect(field().props.value).toBe('');
    expect(screen.getByTestId('search-recents')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
  });

  it('saves the term on submit, newest first', async () => {
    await renderExplore();
    await searchGames('hades');
    await fireEvent(field(), 'submitEditing');
    await type('celeste');
    await fireEvent(field(), 'submitEditing');

    expect(recents().terms).toEqual(['celeste', 'hades']);
  });

  it('does not save a term shorter than 2 characters', async () => {
    await renderExplore();
    await focusField();
    await type(' a ');
    await fireEvent(field(), 'submitEditing');

    expect(recents().terms).toEqual([]);
  });

  it('keeps the recents per account', async () => {
    useRecentSearches.getState().addTerm('other', 'segredo');
    useRecentSearches.getState().addTerm('me', 'hades');
    await renderExplore();
    await focusField();

    expect(screen.getByRole('button', { name: 'Buscar hades' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Buscar segredo' })).not.toBeOnTheScreen();
  });
});

describe('ExploreScreen recents', () => {
  beforeEach(() => {
    useRecentSearches.getState().addTerm('me', 'celeste');
    useRecentSearches.getState().addTerm('me', 'hades');
    useRecentSearches.getState().addPerson('me', bruno);
    useRecentSearches.getState().addPerson('me', ana);
  });

  it('runs a recent term and moves it to the top', async () => {
    await renderExplore();
    await focusField();
    await fireEvent.press(screen.getByRole('button', { name: 'Buscar celeste' }));
    await layoutGrid();

    expect(field().props.value).toBe('celeste');
    expect(useGameSearch).toHaveBeenLastCalledWith('celeste');
    expect(recents().terms).toEqual(['celeste', 'hades']);
  });

  it('removes one term with its "x"', async () => {
    await renderExplore();
    await focusField();
    await fireEvent.press(screen.getByRole('button', { name: 'Remover hades das buscas recentes' }));

    expect(screen.queryByRole('button', { name: 'Buscar hades' })).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Buscar celeste' })).toBeOnTheScreen();
    expect(recents().terms).toEqual(['celeste']);
  });

  it('keeps the middle of a recent avatar out of the "x" box, so a tap there opens the profile', async () => {
    await renderExplore();
    await focusField();

    const item = screen.getByRole('button', { name: 'Perfil de Ana Souza' });
    const remove = screen.getByRole('button', { name: 'Remover Ana Souza das pessoas recentes' });
    const body = StyleSheet.flatten(item.props.style);
    const box = StyleSheet.flatten(remove.props.style);

    // A real 48 dp box in the item's top-right corner...
    expect(box.width).toBeGreaterThanOrEqual(48);
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.top).toBe(0);
    expect(box.right).toBe(0);
    // ...that ends above the avatar's centre (the avatar starts at the body's top padding).
    const avatarCentre = (body.paddingTop ?? 0) + PERSON_AVATAR / 2;
    expect(avatarCentre).toBeGreaterThanOrEqual(box.top + box.height);

    // Pressing the profile opens it and removes nothing.
    await fireEvent.press(item);
    expect(mockPush).toHaveBeenCalledWith('/users/u1');
    expect(recents().people.map((p) => p.id)).toContain('u1');
  });

  it('scrolls the recents back to the top when Explorar is pressed again', async () => {
    // The ScrollView mock shares one `scrollTo` between instances; a probe reaches it.
    const probe = createRef<{ scrollTo: jest.Mock }>();
    const { unmount } = await render(<ScrollView ref={probe as never} />);
    const scrollTo = probe.current!.scrollTo;
    await unmount();

    await renderExplore();
    await focusField();
    scrollTo.mockClear();

    await act(async () => mockTabPress.forEach((listener) => listener()));
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });

  it('opens a recent person and removes one with its "x"', async () => {
    await renderExplore();
    await focusField();
    // A blank name falls back to the username.
    expect(screen.getByRole('button', { name: 'Perfil de bruno' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de bruno' }));
    expect(mockPush).toHaveBeenCalledWith('/users/u2');
    expect(recents().people.map((p) => p.id)).toEqual(['u2', 'u1']);

    await fireEvent.press(screen.getByRole('button', { name: 'Remover Ana Souza das pessoas recentes' }));
    expect(screen.queryByRole('button', { name: 'Perfil de Ana Souza' })).not.toBeOnTheScreen();
    expect(recents().people.map((p) => p.id)).toEqual(['u2']);
  });

  it('shows no heading for an empty part', async () => {
    useRecentSearches.setState({ recents: { me: { terms: ['hades'], people: [] } } });
    await renderExplore();
    await focusField();

    expect(screen.queryByText('Pessoas recentes')).not.toBeOnTheScreen();
    expect(screen.getByText('Buscas recentes')).toBeOnTheScreen();
  });
});

describe('ExploreScreen results', () => {
  it('shows the hint for a short term and asks for nothing', async () => {
    await renderExplore();
    await focusField();
    await type(' a ');

    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeOnTheScreen();
    expect(screen.queryByText('Hades')).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Jogos' })).not.toBeOnTheScreen();
    expect(useGameSearch).not.toHaveBeenCalled();
  });

  it('opens on the Jogos tab with the three tabs', async () => {
    await renderExplore();
    await searchGames('ha');

    expect(screen.getByRole('tab', { name: 'Jogos' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Pessoas' })).not.toBeSelected();
    expect(screen.getByRole('tab', { name: 'Posts' })).not.toBeSelected();
    expect(useGameSearch).toHaveBeenLastCalledWith('ha');
  });

  it('renders the games with the first platform or a fallback', async () => {
    await renderExplore();
    await searchGames('ha');

    // The name sits below the cover; a cover without an image repeats it inside.
    expect(screen.getAllByText('Hades').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Celeste').length).toBeGreaterThan(0);
    expect(screen.getByText('PC')).toBeOnTheScreen();
    expect(screen.getByText('Plataformas não informadas')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hades, PC' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Celeste, Plataformas não informadas' }),
    ).toBeOnTheScreen();
  });

  it('does not give the cover its own screen reader stop', async () => {
    await renderExplore();
    await searchGames('ha');
    expect(screen.queryByLabelText(/Capa de/, { includeHiddenElements: true })).toBeNull();
  });

  it('marks a game that is already in the library', async () => {
    mockLibrary([11]);
    await renderExplore();
    await searchGames('ha');

    expect(screen.getByText('Na biblioteca')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hades, Na biblioteca' })).toBeOnTheScreen();
    expect(screen.queryByText('PC')).not.toBeOnTheScreen();
  });

  it('opens the game when a result is pressed and saves the term', async () => {
    await renderExplore();
    await searchGames(' ha ');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Celeste, Plataformas não informadas' }),
    );

    expect(mockPush).toHaveBeenCalledWith('/games/22');
    expect(recents().terms).toEqual(['ha']);
  });

  it('shows the busy indicator while fetching and keeps the previous results', async () => {
    mockGames({ isFetching: true, isPlaceholderData: true });
    await renderExplore();
    await searchGames('ha');

    expect(screen.getByLabelText('Buscando')).toBeOnTheScreen();
    expect(screen.getAllByText('Hades').length).toBeGreaterThan(0);
  });

  it('offers a retry when the search fails', async () => {
    mockGames({ data: undefined, isError: true });
    await renderExplore();
    await searchGames('ha');

    expect(screen.getByText('Não foi possível buscar agora')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the people search fails', async () => {
    mockPeople({ data: undefined, isError: true });
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));

    expect(screen.getByText('Não foi possível buscar agora')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('offers a retry when the post search fails', async () => {
    mockPosts({ data: undefined, isError: true });
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));

    expect(screen.getByText('Não foi possível buscar agora')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('scrolls the people results to the top when their tab is pressed again', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    scrollToOffset.mockClear();

    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    scrollToOffset.mockRestore();
  });

  it('keeps the first tap on a result working with the keyboard open', async () => {
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    expect(screen.getByTestId('people-results').props.keyboardShouldPersistTaps).toBe('handled');
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));
    expect(screen.getByTestId('post-list').props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('lists people with their names, usernames and bios, and follows from the row', async () => {
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));

    expect(screen.getByRole('tab', { name: 'Pessoas' })).toBeSelected();
    expect(usePeopleSearch).toHaveBeenLastCalledWith('an');
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    // A blank name falls back to the username.
    expect(screen.getByText('bruno')).toBeOnTheScreen();
    expect(screen.getByText('Fã de RPG')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));
    expect(mockFollow).toHaveBeenCalledWith({ id: 'u1', follow: true });
  });

  it('opens a profile from a person result and saves the person', async () => {
    await renderExplore();
    await searchGames('an');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Ana Souza' }));

    expect(mockPush).toHaveBeenCalledWith('/users/u1');
    expect(recents().people).toEqual([
      { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
    ]);
    expect(recents().terms).toEqual([]);
  });

  it('sends the people search at most the 50 characters it accepts', async () => {
    await renderExplore();
    await searchGames(` ${'a'.repeat(60)} `);
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));

    expect(usePeopleSearch).toHaveBeenLastCalledWith('a'.repeat(50));
    expect(field().props.maxLength).toBe(100);
  });

  it('lists the posts found and loads more at the end', async () => {
    await renderExplore();
    await searchGames('hades');
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));

    expect(usePostSearch).toHaveBeenLastCalledWith('hades');
    expect(screen.getByText('Zerei Hades hoje')).toBeOnTheScreen();

    await fireEvent(screen.getByTestId('post-list'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('opens a post result and saves the term', async () => {
    await renderExplore();
    await searchGames('hades');
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));
    await fireEvent.press(screen.getByText('Zerei Hades hoje'));

    expect(mockPush).toHaveBeenCalledWith('/posts/p1');
    expect(recents().terms).toEqual(['hades']);
  });

  it('shows skeletons while the first posts load', async () => {
    mockPosts({ data: undefined, isPending: true, isFetching: true });
    await renderExplore();
    await searchGames('hades');
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));

    expect(screen.getAllByTestId('post-search-skeleton').length).toBeGreaterThan(0);
  });

  it("names the term in each tab's own empty state", async () => {
    mockGames({ data: [] });
    mockPeople({ data: [] });
    mockPosts({ data: { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] } });
    await renderExplore();
    await searchGames(' zzz ');

    expect(screen.getByText("Nenhum resultado para 'zzz'")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    expect(screen.getByText("Nenhum resultado para 'zzz'")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Posts' }));
    expect(screen.getByText("Nenhum resultado para 'zzz'")).toBeOnTheScreen();
  });

  it('does not call a pending or placeholder result empty', async () => {
    mockPeople({ data: [], isPlaceholderData: true, isFetching: true });
    await renderExplore();
    await searchGames('zzz');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    expect(screen.queryByText(/Nenhum resultado/)).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Buscando')).toBeOnTheScreen();

    mockPeople({ data: undefined, isPending: true, isFetching: true });
    await type('zzzz');
    expect(screen.queryByText(/Nenhum resultado/)).not.toBeOnTheScreen();
  });

  it('keeps the term and each tab when switching tabs', async () => {
    await renderExplore();
    await searchGames('ha');
    await fireEvent.press(screen.getByRole('tab', { name: 'Pessoas' }));
    expect(field().props.value).toBe('ha');
    expect(usePeopleSearch).toHaveBeenLastCalledWith('ha');

    await fireEvent.press(screen.getByRole('tab', { name: 'Jogos' }));
    await layoutGrid();
    expect(useGameSearch).toHaveBeenLastCalledWith('ha');
    expect(screen.getByRole('button', { name: 'Hades, PC' })).toBeOnTheScreen();
  });
});

describe('ExploreScreen discovery', () => {
  it('opens a trending game and a suggested person', async () => {
    jest.mocked(useTrendingGames).mockReturnValue({
      data: [{ game: { ...hades, id: 'g11' }, entryCount: 3 }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useTrendingGames>);
    jest.mocked(useFollowSuggestions).mockReturnValue({
      data: [{ ...ana, followsMe: false, followedByCount: 0 }],
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useFollowSuggestions>);
    await renderExplore();

    const discovery = screen.getByTestId('explore-discovery');
    expect(within(discovery).getByText('Em alta')).toBeOnTheScreen();
    expect(within(discovery).getByText('Sugestões para seguir')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Hades, 3 registros' }));
    expect(mockPush).toHaveBeenCalledWith('/games/11');
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Ana Souza' }));
    expect(mockPush).toHaveBeenCalledWith('/users/u1');
    // Discovery is not a search: nothing goes to the recents.
    expect(recents()).toEqual({ terms: [], people: [] });
  });
});

describe('ExploreScreen tab parameter', () => {
  it('opens in focus mode on the Pessoas tab when asked by the tab parameter', async () => {
    mockParams = { tab: 'people' };
    await renderExplore();

    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    expect(screen.getByTestId('search-recents')).toBeOnTheScreen();

    await type('an');
    expect(screen.getByRole('tab', { name: 'Pessoas' })).toBeSelected();
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
  });

  it('moves to focus mode on Pessoas when the parameter arrives later', async () => {
    await renderExplore();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeOnTheScreen();

    mockParams = { tab: 'people' };
    await screen.rerender(explore());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    await type('an');
    expect(screen.getByRole('tab', { name: 'Pessoas' })).toBeSelected();
  });

  it('consumes the tab parameter so the same link works again', async () => {
    mockParams = { tab: 'people' };
    await renderExplore();
    expect(mockSetParams).toHaveBeenCalledWith({ tab: undefined });

    // The router drops the parameter, the user cancels, then the link is followed again.
    mockParams = {};
    await screen.rerender(explore());
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeOnTheScreen();

    mockParams = { tab: 'people' };
    await screen.rerender(explore());
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    await type('an');
    expect(screen.getByRole('tab', { name: 'Pessoas' })).toBeSelected();
  });

  it('opens the Jogos tab when asked, after leaving it on Pessoas', async () => {
    mockParams = { tab: 'people' };
    await renderExplore();
    mockParams = {};
    await screen.rerender(explore());

    mockParams = { tab: 'games' };
    await screen.rerender(explore());
    await type('ha');
    await layoutGrid();
    expect(screen.getByRole('tab', { name: 'Jogos' })).toBeSelected();
    expect(mockSetParams).toHaveBeenLastCalledWith({ tab: undefined });
  });
});

describe('ExploreScreen tab re-press', () => {
  it('listens for a press on its own tab to scroll back to the top', async () => {
    await renderExplore();
    expect(mockNavigation.addListener).toHaveBeenCalledWith('tabPress', expect.any(Function));
  });

  it('hides the keyboard when the field is focused, and only then', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderExplore();

    await act(async () => mockTabPress.forEach((listener) => listener()));
    expect(dismiss).not.toHaveBeenCalled();

    await focusField();
    await act(async () => mockTabPress.forEach((listener) => listener()));
    expect(dismiss).toHaveBeenCalledTimes(1);
    // Focus mode stays: only the keyboard goes.
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
  });
});
