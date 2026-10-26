import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/features/auth';
import { gamesApi } from '@/features/games/api';
import { useGame, useGameSearch } from '@/features/games/queries';
import type { Game, GameSummary } from '@/features/games/types';
import { useLibrary } from '@/features/library/queries';
import type { GameEntry } from '@/features/library/types';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { CreatePostScreen } from '../CreatePostScreen';
import { useCreatePost, usePost } from '../queries';
import type { Post } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

jest.mock('../queries', () => ({ useCreatePost: jest.fn(), usePost: jest.fn() }));
jest.mock('@/features/games/queries', () => ({ useGame: jest.fn(), useGameSearch: jest.fn() }));
jest.mock('@/features/games/api', () => ({ gamesApi: { byIgdbId: jest.fn() } }));
jest.mock('@/features/library/queries', () => ({ useLibrary: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockBack = jest.fn();
const mockDisablePrevention = jest.fn();
let mockParams: Record<string, string> = {};
const mockPrevent: {
  active: boolean;
  callback?: (options: { data: { action: unknown }; repeat: () => void }) => void;
} = { active: false };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (active: boolean, callback: typeof mockPrevent.callback) => {
    mockPrevent.active = active;
    mockPrevent.callback = callback;
    return mockDisablePrevention;
  },
  // The header is rendered in place so the tests can reach the Publicar button.
  Stack: {
    Screen: ({
      options,
    }: {
      options?: { headerRight?: () => ReactNode };
    }) => <>{options?.headerRight?.()}</>,
  },
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    igdbId: 11,
    name: 'Hades',
    coverUrl: null,
    summary: null,
    screenshots: [],
    platforms: ['PC'],
    genres: [],
    isFavoritedByMe: false,
    ...overrides,
  };
}

function makeEntry(game: Game, overrides: Partial<GameEntry> = {}): GameEntry {
  return {
    id: 'e1',
    platform: 'PC',
    status: 'playing',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    createdAt: new Date(2026, 2, 5, 12),
    game,
    ...overrides,
  };
}

const summary: GameSummary = {
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  platforms: ['PC'],
  genres: [],
};

const mockCreate = jest.fn();
const mockByIgdbId = jest.mocked(gamesApi.byIgdbId);
const refetchGame = jest.fn();

function mockSearch(data: GameSummary[] | undefined, overrides: Record<string, unknown> = {}) {
  jest.mocked(useGameSearch).mockReturnValue({
    data,
    isPending: data === undefined,
    isPlaceholderData: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useGameSearch>);
}

function mockPrelinkGame(overrides: Record<string, unknown>) {
  jest.mocked(useGame).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
    refetch: refetchGame,
    ...overrides,
  } as unknown as ReturnType<typeof useGame>);
}

function mockEntries(entries: GameEntry[] | undefined) {
  jest.mocked(useLibrary).mockReturnValue({
    data: entries,
  } as unknown as ReturnType<typeof useLibrary>);
}

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <CreatePostScreen />
    </SafeAreaProvider>,
  );
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function typeText(text: string) {
  await fireEvent.changeText(screen.getByLabelText('O que você quer compartilhar?'), text);
}

async function linkHadesThroughTheSheet() {
  await press('Vincular um jogo');
  await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), 'Had');
  await press('Hades');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockPrevent.active = false;
  mockPrevent.callback = undefined;
  mockCreate.mockResolvedValue(undefined);
  jest.mocked(useCreatePost).mockReturnValue({
    mutateAsync: mockCreate,
  } as unknown as ReturnType<typeof useCreatePost>);
  mockByIgdbId.mockResolvedValue(makeGame());
  mockPrelinkGame({ isPending: true });
  mockSearch([summary]);
  mockEntries([]);
});

describe('CreatePostScreen text', () => {
  it('shows the field, the counter and a disabled Publicar while empty', async () => {
    await renderScreen();

    expect(screen.getByLabelText('O que você quer compartilhar?')).toBeOnTheScreen();
    expect(screen.getByText('0/500')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Publicar' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
    expect(screen.getByText('Jogo (opcional)')).toBeOnTheScreen();
  });

  it('enables Publicar at 500 characters and limits the field to 500', async () => {
    await renderScreen();

    await typeText('a'.repeat(500));

    expect(screen.getByLabelText('O que você quer compartilhar?').props.maxLength).toBe(500);
    expect(screen.getByText('500/500')).toBeOnTheScreen();
    expect(screen.getByText('500/500')).toHaveStyle({ color: colors.textMedium });
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it('turns the counter red and disables Publicar above 500', async () => {
    await renderScreen();

    await typeText('a'.repeat(501));

    expect(screen.getByText('501/500')).toHaveStyle({ color: colors.danger });
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('keeps Publicar disabled for whitespace only', async () => {
    await renderScreen();

    await typeText('   \n  ');

    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });
});

describe('CreatePostScreen publishing', () => {
  it('sends the trimmed content, confirms and goes back', async () => {
    await renderScreen();
    await typeText('  Zerei hoje!  ');

    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Zerei hoje!' });
    expect(showToast).toHaveBeenCalledWith('Publicado');
    expect(mockDisablePrevention).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the API error above the field and keeps the text', async () => {
    const error = new NetworkError();
    mockCreate.mockRejectedValue(error);
    await renderScreen();
    await typeText('Olá');

    await press('Publicar');

    expect(screen.getByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(screen.getByLabelText('O que você quer compartilhar?').props.value).toBe('Olá');
    expect(showToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it('does not publish twice while the request is pending', async () => {
    let resolve: () => void = () => {};
    mockCreate.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    await renderScreen();
    await typeText('Olá');

    await press('Publicar');
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Publicar' }));
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('CreatePostScreen game link', () => {
  it('searches in the sheet and links the chosen game', async () => {
    await renderScreen();
    await typeText('Ótimo');

    await press('Vincular um jogo');
    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), 'Had');
    expect(screen.queryByText('Digite pelo menos 2 letras.')).not.toBeOnTheScreen();
    await press('Hades');

    expect(mockByIgdbId).toHaveBeenCalledWith(11);
    expect(await screen.findByRole('button', { name: 'Remover vínculo com o jogo' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Buscar jogos')).not.toBeOnTheScreen();

    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Ótimo', gameId: 'g1' });
  });

  it('decides the hint from the trimmed term, not from stale results', async () => {
    await renderScreen();
    await press('Vincular um jogo');

    await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), ' a ');

    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Hades' })).not.toBeOnTheScreen();
  });

  it('removes the link', async () => {
    await renderScreen();
    await linkHadesThroughTheSheet();

    await press('Remover vínculo com o jogo');

    expect(screen.getByRole('button', { name: 'Vincular um jogo' })).toBeOnTheScreen();
    await typeText('Oi');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });

  it('shows the linking state while the game is resolved', async () => {
    mockByIgdbId.mockReturnValue(new Promise(() => {}));
    await renderScreen();

    await linkHadesThroughTheSheet();

    expect(screen.getByText('Vinculando ao jogo…')).toBeOnTheScreen();
  });

  it('offers retry and publishing without the link when linking fails', async () => {
    mockByIgdbId.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await typeText('Oi');

    await linkHadesThroughTheSheet();

    expect(await screen.findByText('Não foi possível vincular ao jogo.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();

    await press('Tentar de novo');
    expect(await screen.findByRole('button', { name: 'Remover vínculo com o jogo' })).toBeOnTheScreen();
    expect(mockByIgdbId).toHaveBeenCalledTimes(2);
  });

  it('clears a failed link with Publicar sem vínculo', async () => {
    mockByIgdbId.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await typeText('Oi');
    await linkHadesThroughTheSheet();
    await screen.findByText('Não foi possível vincular ao jogo.');

    await press('Publicar sem vínculo');

    expect(screen.queryByText('Não foi possível vincular ao jogo.')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Vincular um jogo' })).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });
});

describe('CreatePostScreen records', () => {
  const game = makeGame();

  it('hides the section when no game is linked or the game has no record', async () => {
    mockEntries([makeEntry(game)]);
    await renderScreen();
    expect(screen.queryByText('Registro (opcional)')).not.toBeOnTheScreen();

    mockEntries([makeEntry(makeGame({ id: 'g2', igdbId: 22, name: 'Celeste' }))]);
    await linkHadesThroughTheSheet();
    await screen.findByRole('button', { name: 'Remover vínculo com o jogo' });
    expect(screen.queryByText('Registro (opcional)')).not.toBeOnTheScreen();
  });

  it('lists only the records of the linked game and sends the chosen one', async () => {
    mockEntries([
      makeEntry(game, { id: 'e1', status: 'playing', platform: 'PC' }),
      makeEntry(game, { id: 'e2', status: 'completed', platform: 'PS5' }),
      makeEntry(makeGame({ id: 'g2', igdbId: 22, name: 'Celeste' }), {
        id: 'e3',
        status: 'backlog',
        platform: 'Switch',
      }),
    ]);
    await renderScreen();
    await typeText('Ótimo');
    await linkHadesThroughTheSheet();
    await screen.findByText('Registro (opcional)');

    expect(screen.getByRole('button', { name: 'Nenhum', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Jogando · PC' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Concluído · PS5' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Na fila · Switch' })).not.toBeOnTheScreen();

    await press('Concluído · PS5');
    expect(screen.getByRole('button', { name: 'Concluído · PS5', selected: true })).toBeOnTheScreen();
    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Ótimo', gameId: 'g1', gameEntryId: 'e2' });
  });

  it('sends no record while Nenhum is selected', async () => {
    mockEntries([makeEntry(game)]);
    await renderScreen();
    await typeText('Oi');
    await linkHadesThroughTheSheet();
    await screen.findByText('Registro (opcional)');
    await press('Jogando · PC');

    await press('Nenhum');
    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', gameId: 'g1' });
  });

  it('forgets the chosen record when the link is removed', async () => {
    mockEntries([makeEntry(game)]);
    await renderScreen();
    await typeText('Oi');
    await linkHadesThroughTheSheet();
    await screen.findByText('Registro (opcional)');
    await press('Jogando · PC');

    await press('Remover vínculo com o jogo');
    await linkHadesThroughTheSheet();
    await screen.findByText('Registro (opcional)');
    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', gameId: 'g1' });
  });
});

describe('CreatePostScreen pre-linked game', () => {
  beforeEach(() => {
    mockParams = { igdbId: '11' };
  });

  it('links the game of ?igdbId= and publishes with it', async () => {
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByRole('button', { name: 'Remover vínculo com o jogo' })).toBeOnTheScreen();
    expect(screen.getByText('Hades')).toBeOnTheScreen();
    await press('Publicar');

    expect(useGame).toHaveBeenCalledWith(11);
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', gameId: 'g1' });
  });

  it('shows the linking state while the game loads', async () => {
    mockPrelinkGame({ isPending: true });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByText('Vinculando ao jogo…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('retries the load, or publishes without the link, when it fails', async () => {
    mockPrelinkGame({ isError: true });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByText('Não foi possível vincular ao jogo.')).toBeOnTheScreen();
    await press('Tentar de novo');
    expect(refetchGame).toHaveBeenCalledTimes(1);

    await press('Publicar sem vínculo');
    expect(screen.getByRole('button', { name: 'Vincular um jogo' })).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });

  it('does not load a game for a missing or invalid address', async () => {
    mockParams = { igdbId: 'abc' };
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Vincular um jogo' })).toBeOnTheScreen();
  });
});

describe('CreatePostScreen discard guard', () => {
  it('is inactive while there is no text, even whitespace', async () => {
    await renderScreen();
    expect(mockPrevent.active).toBe(false);

    await typeText('   ');

    expect(mockPrevent.active).toBe(false);
  });

  it('asks before leaving with text and discards on confirmation', async () => {
    await renderScreen();
    await typeText('Rascunho');
    expect(mockPrevent.active).toBe(true);

    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    expect(screen.getByText('Descartar publicação?')).toBeOnTheScreen();
    expect(screen.getByText('O texto que você escreveu não foi publicado.')).toBeOnTheScreen();

    await press('Descartar');
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockPrevent.active).toBe(false);
  });

  it('keeps editing when the dialog is dismissed', async () => {
    await renderScreen();
    await typeText('Rascunho');
    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    await press('Continuar editando');

    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar publicação?')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('O que você quer compartilhar?').props.value).toBe('Rascunho');
  });

  it('is released after publishing', async () => {
    await renderScreen();
    await typeText('Oi');

    await press('Publicar');

    expect(mockPrevent.active).toBe(false);
  });
});

describe('CreatePostScreen quote', () => {
  const QUOTE_ID = '11111111-2222-4333-8444-555555555555';
  const refetchQuote = jest.fn();
  const quoted: Post = {
    id: QUOTE_ID,
    author: { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null },
    content: 'O chefe final é impossível',
    type: 'status',
    activityStatus: null,
    createdAt: new Date(),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...socialDefaults,
  };

  function mockQuote(overrides: Record<string, unknown>) {
    jest.mocked(usePost).mockReturnValue({
      data: undefined,
      error: null,
      isError: false,
      refetch: refetchQuote,
      ...overrides,
    } as unknown as ReturnType<typeof usePost>);
  }

  beforeEach(() => {
    mockParams = { quote: QUOTE_ID };
  });

  it('shows the quoted post under the editor and publishes the quote', async () => {
    mockQuote({ data: quoted });
    await renderScreen();
    await typeText('Concordo');

    expect(usePost).toHaveBeenCalledWith(QUOTE_ID);
    expect(screen.getByLabelText(/^Post citado de Bia, .*: O chefe final é impossível$/)).toBeOnTheScreen();
    // A preview, not a link away from the text being written.
    expect(screen.queryByRole('link', { name: /Post citado/ })).toBeNull();
    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Concordo', quotedPostId: QUOTE_ID });
  });

  it('waits for the quoted post before publishing', async () => {
    mockQuote({});
    await renderScreen();
    await typeText('Concordo');

    expect(screen.getByText('Carregando o post citado…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('offers a retry when the quoted post fails to load', async () => {
    mockQuote({ isError: true, error: new NetworkError() });
    await renderScreen();
    await typeText('Concordo');

    expect(screen.getByText('Não foi possível carregar o post citado.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    await press('Tentar de novo');
    expect(refetchQuote).toHaveBeenCalledTimes(1);
  });

  it('says the quoted post was removed when it no longer exists', async () => {
    mockQuote({ isError: true, error: new ApiError(404, 'not_found', 'Post não encontrado') });
    await renderScreen();
    await typeText('Concordo');

    expect(screen.getByText('Post removido')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('quotes with a game linked from the address too', async () => {
    mockParams = { quote: QUOTE_ID, igdbId: '11' };
    mockQuote({ data: quoted });
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();
    await typeText('Oi');

    await press('Publicar');

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', gameId: 'g1', quotedPostId: QUOTE_ID });
  });

  it('ignores an address that is not a post id', async () => {
    mockParams = { quote: 'abc' };
    await renderScreen();
    await typeText('Oi');

    expect(usePost).not.toHaveBeenCalled();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });
});
