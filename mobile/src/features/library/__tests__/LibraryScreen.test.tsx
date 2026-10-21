import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useMyFavorites } from '@/features/games/queries';
import type { Game } from '@/features/games/types';

import { useLibraryFilter } from '../filterStore';
import { buildLibraryOverview } from '../groups';
import { LibraryScreen } from '../LibraryScreen';
import { libraryFooter } from '../libraryFooter';
import { useLibraryPrefs } from '../prefsStore';
import { useLibrary } from '../queries';
import type { GameEntry } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../queries', () => ({ useLibrary: jest.fn() }));
jest.mock('@/features/games/queries', () => ({ useMyFavorites: jest.fn() }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Library entries embed plain game rows, so the API never sets `isFavoritedByMe` on them. */
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
const onix = game('g3', 33, 'Pokémon Ônix');

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
  entry({ id: 'e1', game: hades, platform: 'PC', status: 'playing', createdAt: new Date(2026, 2, 5, 12) }),
  entry({ id: 'e2', game: hades, platform: 'PS5', status: 'completed', createdAt: new Date(2026, 0, 2, 12) }),
  entry({
    id: 'e3',
    game: celeste,
    platform: 'PC',
    status: 'completed',
    hoursPlayed: 20,
    rating: 8,
    notes: 'Ótimo',
    createdAt: new Date(2026, 1, 9, 12),
  }),
  entry({ id: 'e4', game: onix, platform: 'Switch', status: 'backlog', createdAt: new Date(2026, 3, 1, 12) }),
];

const refetch = jest.fn();

function mockLibrary(overrides: Record<string, unknown> = {}) {
  jest.mocked(useLibrary).mockReturnValue({
    data: ENTRIES,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useLibrary>);
}

async function renderLibrary() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <LibraryScreen />
    </SafeAreaProvider>,
  );
  await fireEvent(screen.getByTestId('cover-grid'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 800 } },
  });
  // FlashList flags itself as loaded from a zero-delay timer; let it settle inside act.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mockFavorites(games: Game[]) {
  jest.mocked(useMyFavorites).mockReturnValue({
    data: games,
  } as unknown as ReturnType<typeof useMyFavorites>);
}

beforeEach(() => {
  mockFavorites([]);
  mockPush.mockReset();
  refetch.mockReset();
  useLibraryFilter.getState().clear();
  useLibraryPrefs.setState({ sort: 'recent' });
  mockLibrary();
});

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

const cards = () =>
  screen.queryAllByRole('button', { name: /, (Jogando|Concluído|Na fila|Abandonado|Vários status), / });

describe('summary and tabs', () => {
  it('shows the summary line and the tab counts', async () => {
    await renderLibrary();
    expect(screen.getByText('3 jogos · 4 registros · 1 jogo em andamento')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Todos (3)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Jogando (1)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Concluído (2)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Na fila (1)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Abandonado (0)' })).toBeOnTheScreen();
    expect(screen.getByText('3 jogos encontrados')).toBeOnTheScreen();
  });

  it('selecting Jogando leaves one card, and Todos brings them back', async () => {
    await renderLibrary();
    expect(cards()).toHaveLength(3);
    await fireEvent.press(screen.getByRole('tab', { name: 'Jogando (1)' }));
    expect(useLibraryFilter.getState().status).toBe('playing');
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('1 jogo encontrado')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Todos (3)' }));
    expect(useLibraryFilter.getState().status).toBeNull();
    expect(cards()).toHaveLength(3);
  });

  it('shows the status icon under Todos and hides it under Jogando', async () => {
    await renderLibrary();
    expect(screen.getAllByTestId('library-card-status')).toHaveLength(3);
    await fireEvent.press(screen.getByRole('tab', { name: 'Jogando (1)' }));
    expect(screen.queryByTestId('library-card-status')).toBeNull();
  });
});

describe('cards', () => {
  it('labels a game with two records of different statuses', async () => {
    await renderLibrary();
    expect(screen.getByRole('button', { name: 'Hades, Vários status, 2 registros' })).toBeOnTheScreen();
  });

  it('labels a single record with its status and platform', async () => {
    await renderLibrary();
    expect(screen.getByRole('button', { name: 'Celeste, Concluído, PC' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pokémon Ônix, Na fila, Switch' })).toBeOnTheScreen();
  });

  it('uses the records count when the filter hides records of the game', async () => {
    await renderLibrary();
    await fireEvent.press(screen.getByRole('tab', { name: 'Jogando (1)' }));
    expect(screen.getByRole('button', { name: 'Hades, Jogando, 2 registros' })).toBeOnTheScreen();
  });

  it('opens the progress tab of the game when pressed', async () => {
    await renderLibrary();
    await fireEvent.press(screen.getByRole('button', { name: 'Celeste, Concluído, PC' }));
    expect(mockPush).toHaveBeenCalledWith('/games/22?tab=progress');
  });

  it('shows the added date by default', async () => {
    await renderLibrary();
    expect(screen.getByText('05/03/26')).toBeOnTheScreen();
    expect(screen.getByText('09/02/26')).toBeOnTheScreen();
    expect(screen.getByText('01/04/26')).toBeOnTheScreen();
  });
});

describe('sort', () => {
  async function chooseRatingSort() {
    await fireEvent.press(screen.getByRole('button', { name: 'Ordenar' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Minha nota' }));
  }

  it('shows the heart only for the games in the favorites list', async () => {
    mockFavorites([game('g2', 22, 'Celeste')]);
    await renderLibrary();
    await chooseRatingSort();
    expect(screen.getAllByTestId('library-footer-favorite')).toHaveLength(1);
  });

  it('shows no heart while the favorites are not loaded', async () => {
    jest.mocked(useMyFavorites).mockReturnValue({
      data: undefined,
    } as unknown as ReturnType<typeof useMyFavorites>);
    await renderLibrary();
    await chooseRatingSort();
    expect(screen.queryByTestId('library-footer-favorite')).toBeNull();
  });

  async function chooseSort(option: string) {
    await fireEvent.press(screen.getByRole('button', { name: 'Ordenar' }));
    expect(screen.getByText('Ordenar por')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: option }));
  }

  it('shows the rating under Minha nota', async () => {
    await renderLibrary();
    await chooseSort('Minha nota');
    expect(useLibraryPrefs.getState().sort).toBe('rating');
    expect(screen.getByLabelText('Nota 8 de 10')).toBeOnTheScreen();
  });

  it('shows the hours under Mais horas registradas', async () => {
    await renderLibrary();
    await chooseSort('Mais horas registradas');
    expect(screen.getByText('20,0 h')).toBeOnTheScreen();
  });

  it('shows the oldest date under Adicionados há mais tempo', async () => {
    await renderLibrary();
    await chooseSort('Adicionados há mais tempo');
    expect(screen.getByText('02/01/26')).toBeOnTheScreen();
  });

  it('does not reset the sort when the filters are cleared', async () => {
    await renderLibrary();
    await chooseSort('Nome A–Z');
    await fireEvent.changeText(screen.getByLabelText('Buscar na biblioteca'), 'cel');
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar' }));
    expect(useLibraryPrefs.getState().sort).toBe('name');
  });
});

describe('search and platform', () => {
  it('finds a game ignoring accents and case', async () => {
    await renderLibrary();
    await fireEvent.changeText(screen.getByLabelText('Buscar na biblioteca'), 'pokemon onix');
    expect(screen.getByText('1 jogo encontrado')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pokémon Ônix, Na fila, Switch' })).toBeOnTheScreen();
  });

  it('keeps the field mounted: typing twice in a row keeps both values', async () => {
    await renderLibrary();
    const field = screen.getByLabelText('Buscar na biblioteca');
    await fireEvent.changeText(field, 'h');
    await fireEvent.changeText(screen.getByLabelText('Buscar na biblioteca'), 'ha');
    expect(useLibraryFilter.getState().query).toBe('ha');
    expect(screen.getByLabelText('Buscar na biblioteca').props.value).toBe('ha');
    // The same host field survives the re-render, so the keyboard stays open.
    expect(screen.getByLabelText('Buscar na biblioteca')).toBe(field);
  });

  it('filters by platform and shows its label on the button', async () => {
    await renderLibrary();
    await fireEvent.press(screen.getByRole('button', { name: 'Plataforma' }));
    expect(screen.getByRole('button', { name: 'Todas as plataformas' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Switch' }));
    expect(useLibraryFilter.getState().platformKey).toBe('switch');
    expect(screen.getByRole('button', { name: 'Switch' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Plataforma' })).toBeNull();
    expect(cards()).toHaveLength(1);
  });

  it('shows Limpar only while a filter is active', async () => {
    await renderLibrary();
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Buscar na biblioteca'), 'cel');
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar' }));
    expect(useLibraryFilter.getState().query).toBe('');
    expect(screen.queryByRole('button', { name: 'Limpar' })).toBeNull();
    expect(cards()).toHaveLength(3);
  });
});

describe('states', () => {
  it('invites to add a game when the library is empty', async () => {
    mockLibrary({ data: [] });
    await renderLibrary();
    expect(screen.getByText('Sua biblioteca começa com um jogo')).toBeOnTheScreen();
    expect(screen.getByText('Adicione os jogos que você joga, quer jogar ou já zerou.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Encontrar jogo' }));
    expect(mockPush).toHaveBeenCalledWith('/explore');
  });

  it('offers to clear filters that match nothing', async () => {
    await renderLibrary();
    await fireEvent.changeText(screen.getByLabelText('Buscar na biblioteca'), 'zzz');
    expect(screen.getByText('Nenhum jogo com esses filtros')).toBeOnTheScreen();
    expect(screen.getByText('Tente outra busca ou limpe os filtros.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(useLibraryFilter.getState().query).toBe('');
    expect(cards()).toHaveLength(3);
  });

  it('shows skeleton covers while loading', async () => {
    mockLibrary({ data: undefined, isPending: true });
    await renderLibrary();
    expect(screen.getAllByTestId('library-skeleton', { includeHiddenElements: true })).toHaveLength(8);
    expect(screen.queryByLabelText('Buscar na biblioteca')).toBeNull();
  });

  it('shows the error and retries', async () => {
    mockLibrary({ data: undefined, isPending: false, isError: true });
    await render(<LibraryScreen />);
    expect(screen.getByText('Não foi possível carregar a biblioteca')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refetches on pull to refresh and reflects the refetching state', async () => {
    mockLibrary({ isRefetching: true });
    await renderLibrary();
    const control = findRefreshControl(screen.toJSON());
    expect(control.props.refreshing).toBe(true);
    await act(async () => control.props.onRefresh());
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('libraryFooter', () => {
  function groupOf(overrides: Partial<GameEntry>[], g: Game = hades) {
    const entries = overrides.map((o, i) => entry({ id: `x${i}`, game: g, ...o }));
    return buildLibraryOverview(entries, { query: '', status: null, platformKey: null }, 'name').groups[0]!;
  }

  it('is null for name and for the sorts without a value', () => {
    const group = groupOf([{}]);
    expect(libraryFooter(group, 'name', false)).toBeNull();
    expect(libraryFooter(group, 'rating', false)).toBeNull();
    expect(libraryFooter(group, 'mostPlayed', false)).toBeNull();
  });

  it('shows a heart for a favorite when sorting by rating', async () => {
    const group = groupOf([{}], game('g9', 99, 'Fav'));
    await render(<>{libraryFooter(group, 'rating', true)}</>);
    expect(screen.getByTestId('library-footer-favorite')).toBeOnTheScreen();
    expect(screen.queryByTestId('library-footer-notes')).toBeNull();
  });

  it('shows the notes icon when there are notes', async () => {
    const group = groupOf([{ notes: 'x' }]);
    await render(<>{libraryFooter(group, 'rating', false)}</>);
    expect(screen.getByTestId('library-footer-notes')).toBeOnTheScreen();
    expect(screen.queryByTestId('library-footer-favorite')).toBeNull();
  });
});
