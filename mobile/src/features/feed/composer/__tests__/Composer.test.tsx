import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage, useSession } from '@/features/auth';
import { gamesApi } from '@/features/games/api';
import { useGame, useGameSearch } from '@/features/games/queries';
import type { Game, GameSummary } from '@/features/games/types';
import { useLibrary } from '@/features/library/queries';
import type { GameEntry } from '@/features/library/types';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { socialDefaults } from '@/test-utils/postDefaults';
import { colors } from '@/theme/tokens';

import { useCreatePost, usePost } from '../../queries';
import type { Post } from '../../types';
import { Composer } from '../Composer';
import { useComposerDrafts, type ComposerDraft } from '../composerDraft';

jest.mock('../../queries', () => ({ useCreatePost: jest.fn(), usePost: jest.fn() }));
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
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const FIELD = 'Escrever post';
const QUOTE_ID = '11111111-2222-4333-8444-555555555555';

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

function makeDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return {
    text: 'Rascunho antigo',
    link: null,
    entryId: null,
    quotedPostId: null,
    images: [],
    savedAt: Date.now(),
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

const mockCreate = jest.fn();
const mockByIgdbId = jest.mocked(gamesApi.byIgdbId);
const refetchGame = jest.fn();
const refetchQuote = jest.fn();

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

function mockQuote(overrides: Record<string, unknown>) {
  jest.mocked(usePost).mockReturnValue({
    data: undefined,
    error: null,
    isError: false,
    refetch: refetchQuote,
    ...overrides,
  } as unknown as ReturnType<typeof usePost>);
}

async function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Composer />
    </SafeAreaProvider>,
  );
}

const publishButton = () => screen.getByRole('button', { name: 'Publicar' });

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function typeText(text: string) {
  await fireEvent.changeText(screen.getByLabelText(FIELD), text);
}

async function linkHadesThroughTheSheet() {
  await press('Vincular jogo');
  await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), 'Had');
  await press('Hades');
}

/** Asks to leave the way the router does when the screen is about to be removed. */
async function tryToLeave() {
  const repeat = jest.fn();
  await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));
  return repeat;
}

const drafts = () => useComposerDrafts.getState().drafts.me ?? {};

beforeEach(async () => {
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
  mockQuote({ data: quoted });
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'me',
      username: 'eu',
      name: 'Eu Mesmo',
      email: 'eu@x.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
    },
  });
  await AsyncStorage.clear();
  useComposerDrafts.setState({ drafts: {} });
  await useComposerDrafts.persist.rehydrate();
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('Composer layout', () => {
  it('shows the editor, the bars and a disabled Publicar while empty', async () => {
    await renderScreen();

    const field = screen.getByLabelText(FIELD);
    expect(field.props.placeholder).toBe('E aí, jogando o quê?');
    expect(field.props.placeholderTextColor).toBe(colors.textLow);
    expect(field.props.autoFocus).toBe(true);
    expect(field).toHaveStyle({ fontSize: 16.9, minHeight: 60 });
    expect(publishButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
    expect(screen.getByLabelText('500 caracteres restantes')).toBeOnTheScreen();
  });

  it('pads the small top bar buttons out to 48 dp inside the bar', async () => {
    await renderScreen();

    // 33 dp buttons + 8 dp of hitSlop per side, all within the bar's 8 dp padding.
    for (const name of ['Cancelar', 'Publicar']) {
      expect(screen.getByRole('button', { name }).props.hitSlop).toBe(8);
    }
    const bar = screen.getByTestId('composer-top-bar');
    expect(bar.children[0]).toHaveStyle({ padding: 8 });
  });

  it('leaves through the router on Cancelar', async () => {
    await renderScreen();

    await press('Cancelar');

    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('shows the image buttons as enabled 48 dp boxes', async () => {
    await renderScreen();

    for (const name of ['Adicionar imagens', 'Tirar foto']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeEnabled();
      expect(button).toHaveStyle({ width: 48, height: 48 });
    }
  });

  it('shows the top bar border only once the editor is scrolled', async () => {
    await renderScreen();
    const bar = screen.getByTestId('composer-top-bar');
    expect(bar).toHaveStyle({ borderBottomColor: 'transparent' });

    const scroll = screen.getByTestId('composer-scroll');
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 24 } } });
    expect(bar).toHaveStyle({ borderBottomColor: colors.borderMedium });

    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(bar).toHaveStyle({ borderBottomColor: 'transparent' });
  });
});

describe('Composer text', () => {
  it('enables Publicar at 500 characters', async () => {
    await renderScreen();

    await typeText('a'.repeat(500));

    expect(screen.getByLabelText(FIELD).props.maxLength).toBeUndefined();
    expect(screen.getByLabelText('0 caracteres restantes')).toBeOnTheScreen();
    expect(screen.getByText('0')).toHaveStyle({ color: colors.textMedium });
    expect(publishButton()).toBeEnabled();
  });

  it('shows the remaining count only in the last 100 characters', async () => {
    await renderScreen();

    await typeText('a'.repeat(399));
    expect(screen.getByLabelText('101 caracteres restantes')).toBeOnTheScreen();
    expect(screen.queryByText('101')).toBeNull();

    await typeText('a'.repeat(400));
    expect(screen.getByText('100')).toBeOnTheScreen();
  });

  it('turns the counter into a red pie and disables Publicar above 500', async () => {
    await renderScreen();

    await typeText('a'.repeat(501));

    expect(screen.getByText('-1')).toHaveStyle({ color: colors.danger });
    expect(screen.getByLabelText('1 caractere acima do limite')).toBeOnTheScreen();
    expect(screen.getByTestId('char-progress-pie')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();
  });

  it('counts emoji as one character but keeps the server limit on the UTF-16 length', async () => {
    await renderScreen();

    await typeText('👍'.repeat(250));
    expect(screen.getByLabelText('250 caracteres restantes')).toBeOnTheScreen();
    expect(publishButton()).toBeEnabled();

    await typeText('👍'.repeat(251));
    expect(screen.getByLabelText('2 caracteres acima do limite')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();
  });

  it('keeps Publicar disabled for whitespace only', async () => {
    await renderScreen();

    await typeText('   \n  ');

    expect(publishButton()).toBeDisabled();
  });
});

describe('Composer publishing', () => {
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

  it('shows the API error under the top bar and keeps the text', async () => {
    const error = new NetworkError();
    mockCreate.mockRejectedValue(error);
    await renderScreen();
    await typeText('Olá');

    await press('Publicar');

    expect(screen.getByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(screen.getByLabelText(FIELD).props.value).toBe('Olá');
    expect(showToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
    expect(publishButton()).toBeEnabled();
  });

  it('does not publish twice while the request is pending', async () => {
    let resolve: () => void = () => {};
    mockCreate.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    await renderScreen();
    await typeText('Olá');

    await press('Publicar');
    expect(publishButton()).toBeDisabled();
    expect(publishButton()).toBeBusy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    await fireEvent.press(publishButton());
    expect(mockCreate).toHaveBeenCalledTimes(1);

    await act(async () => resolve());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('publishes once when Publicar is pressed twice before the screen re-renders', async () => {
    let resolve: () => void = () => {};
    mockCreate.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    await renderScreen();
    await typeText('Olá');

    // The accessibility click of the button, fired twice in one act: the disabled state of the
    // first press has not rendered yet, so only the synchronous guard can stop the second.
    const click = publishButton().props.onClick as (event: unknown) => void;
    const event = { stopPropagation: () => {}, nativeEvent: {} };
    await act(async () => {
      click(event);
      click(event);
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    await act(async () => resolve());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('measures the limit on the trimmed text', async () => {
    await renderScreen();

    await typeText(`  ${'a'.repeat(500)}  `);

    expect(publishButton()).toBeEnabled();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'a'.repeat(500) });
  });

  it('still refuses 501 characters once trimmed', async () => {
    await renderScreen();

    await typeText(` ${'a'.repeat(501)} `);

    expect(publishButton()).toBeDisabled();
  });

  it('ignores Android back while the post is going out', async () => {
    let resolve: () => void = () => {};
    mockCreate.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    await renderScreen();
    await typeText('Olá');
    await press('Publicar');

    const repeat = await tryToLeave();

    expect(screen.queryByText('Descartar rascunho?')).not.toBeOnTheScreen();
    expect(repeat).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('does not go back when the composer is already gone by the time the post is published', async () => {
    let resolve: () => void = () => {};
    mockCreate.mockReturnValue(new Promise<void>((done) => (resolve = done)));
    const view = await renderScreen();
    await typeText('Olá');
    await press('Publicar');

    await view.unmount();
    await act(async () => resolve());

    expect(showToast).toHaveBeenCalledWith('Publicado');
    expect(mockBack).not.toHaveBeenCalled();
    expect(drafts().plain).toBeUndefined();
  });
});

describe('Composer game link', () => {
  it('searches in the sheet and links the chosen game', async () => {
    await renderScreen();
    await typeText('Ótimo');

    await press('Vincular jogo');
    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), 'Had');
    expect(screen.queryByText('Digite pelo menos 2 letras.')).not.toBeOnTheScreen();
    await press('Hades');

    expect(mockByIgdbId).toHaveBeenCalledWith(11);
    expect(await screen.findByRole('button', { name: 'Remover vínculo com o jogo' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('composer-game-card')).getByText('Hades')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Desvincular Hades' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Buscar jogos')).not.toBeOnTheScreen();

    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Ótimo', gameId: 'g1' });
  });

  it('decides the hint from the trimmed term, not from stale results', async () => {
    await renderScreen();
    await press('Vincular jogo');

    await fireEvent.changeText(screen.getByLabelText('Buscar jogos'), ' a ');

    expect(screen.getByText('Digite pelo menos 2 letras.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Hades' })).not.toBeOnTheScreen();
  });

  it('removes the link from the card', async () => {
    await renderScreen();
    await linkHadesThroughTheSheet();

    await press('Remover vínculo com o jogo');

    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
    expect(screen.queryByTestId('composer-game-card')).toBeNull();
    await typeText('Oi');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });

  it('removes the link from the pill', async () => {
    await renderScreen();
    await linkHadesThroughTheSheet();
    await screen.findByTestId('composer-game-card');

    await press('Desvincular Hades');

    expect(screen.queryByTestId('composer-game-card')).toBeNull();
    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
  });

  it('shows the linking state while the game is resolved', async () => {
    mockByIgdbId.mockReturnValue(new Promise(() => {}));
    await renderScreen();

    await linkHadesThroughTheSheet();

    expect(screen.getByText('Vinculando ao jogo…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeDisabled();
  });

  it('offers retry and publishing without the link when linking fails', async () => {
    mockByIgdbId.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await typeText('Oi');

    await linkHadesThroughTheSheet();

    expect(await screen.findByText('Não foi possível vincular ao jogo.')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();

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
    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });
});

describe('Composer records', () => {
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

describe('Composer pre-linked game', () => {
  beforeEach(() => {
    mockParams = { igdbId: '11' };
  });

  it('links the game of ?igdbId= and publishes with it', async () => {
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByRole('button', { name: 'Remover vínculo com o jogo' })).toBeOnTheScreen();
    expect(within(screen.getByTestId('composer-game-card')).getByText('Hades')).toBeOnTheScreen();
    await press('Publicar');

    expect(useGame).toHaveBeenCalledWith(11);
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi', gameId: 'g1' });
  });

  it('shows the linking state while the game loads', async () => {
    mockPrelinkGame({ isPending: true });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByText('Vinculando ao jogo…')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();
  });

  it('retries the load, or publishes without the link, when it fails', async () => {
    mockPrelinkGame({ isError: true });
    await renderScreen();
    await typeText('Oi');

    expect(screen.getByText('Não foi possível vincular ao jogo.')).toBeOnTheScreen();
    await press('Tentar de novo');
    expect(refetchGame).toHaveBeenCalledTimes(1);

    await press('Publicar sem vínculo');
    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Oi' });
  });

  it('does not load a game for a missing or invalid address', async () => {
    mockParams = { igdbId: 'abc' };
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Vincular jogo' })).toBeOnTheScreen();
  });

  it('does not count the game of the address as something to save', async () => {
    mockPrelinkGame({ data: makeGame() });
    await renderScreen();

    expect(mockPrevent.active).toBe(false);
  });
});

describe('Composer quote', () => {
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
    expect(publishButton()).toBeDisabled();
  });

  it('offers a retry when the quoted post fails to load', async () => {
    mockQuote({ isError: true, error: new NetworkError() });
    await renderScreen();
    await typeText('Concordo');

    expect(screen.getByText('Não foi possível carregar o post citado.')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();
    await press('Tentar de novo');
    expect(refetchQuote).toHaveBeenCalledTimes(1);
  });

  it('says the quoted post was removed when it no longer exists', async () => {
    mockQuote({ isError: true, error: new ApiError(404, 'not_found', 'Post não encontrado') });
    await renderScreen();
    await typeText('Concordo');

    expect(screen.getByText('Post removido')).toBeOnTheScreen();
    expect(publishButton()).toBeDisabled();
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

describe('Composer discard prompt', () => {
  it('is inactive while there is no text, even whitespace', async () => {
    await renderScreen();
    expect(mockPrevent.active).toBe(false);

    await typeText('   ');

    expect(mockPrevent.active).toBe(false);
  });

  it('is active with a chosen game and no text', async () => {
    await renderScreen();

    await linkHadesThroughTheSheet();
    await screen.findByTestId('composer-game-card');

    expect(mockPrevent.active).toBe(true);
  });

  it('asks before leaving with text and discards the draft on Descartar', async () => {
    await renderScreen();
    await typeText('Rascunho');
    expect(mockPrevent.active).toBe(true);

    const repeat = await tryToLeave();

    expect(screen.getByText('Descartar rascunho?')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeOnTheScreen();
    expect(screen.getByText('Descartar', { exact: true })).toHaveStyle({ color: colors.danger });

    await press('Descartar');
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockPrevent.active).toBe(false);
    expect(drafts().plain).toBeUndefined();
  });

  it('keeps the draft and leaves on Salvar rascunho', async () => {
    await renderScreen();
    await typeText('Rascunho');

    const repeat = await tryToLeave();
    await press('Salvar rascunho');

    expect(repeat).toHaveBeenCalledTimes(1);
    expect(mockPrevent.active).toBe(false);
    expect(drafts().plain?.text).toBe('Rascunho');
  });

  it('keeps editing on Continuar editando', async () => {
    await renderScreen();
    await typeText('Rascunho');
    const repeat = await tryToLeave();

    await press('Continuar editando');

    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar rascunho?')).not.toBeOnTheScreen();
    expect(screen.getByLabelText(FIELD).props.value).toBe('Rascunho');
    expect(mockPrevent.active).toBe(true);
  });

  it('is released after publishing', async () => {
    await renderScreen();
    await typeText('Oi');

    await press('Publicar');

    expect(mockPrevent.active).toBe(false);
  });
});

describe('Composer drafts', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('autosaves half a second after the last change', async () => {
    await renderScreen();

    await typeText('Primeiro');
    await act(async () => jest.advanceTimersByTime(300));
    await typeText('Primeiro rascunho');
    await act(async () => jest.advanceTimersByTime(300));
    expect(drafts().plain).toBeUndefined();

    await act(async () => jest.advanceTimersByTime(200));
    expect(drafts().plain).toMatchObject({ text: 'Primeiro rascunho', link: null, images: [] });
  });

  it('drops the draft when the text is erased', async () => {
    useComposerDrafts.setState({ drafts: { me: { plain: makeDraft() } } });
    await renderScreen();

    await typeText('  ');
    await act(async () => jest.advanceTimersByTime(500));

    expect(drafts().plain).toBeUndefined();
  });

  it('does not save again after Descartar while the screen is still closing', async () => {
    await renderScreen();
    await typeText('Não quero');
    await tryToLeave();

    await press('Descartar');
    await act(async () => jest.advanceTimersByTime(500));

    expect(drafts().plain).toBeUndefined();
  });

  it('does not save again after publishing while the screen is still closing', async () => {
    await renderScreen();
    await typeText('Publicado já');

    await press('Publicar');
    await act(async () => jest.advanceTimersByTime(500));

    expect(drafts().plain).toBeUndefined();
  });

  it('saves what is pending when the composer goes away', async () => {
    const view = await renderScreen();
    await typeText('Quase lá');

    await view.unmount();

    expect(drafts().plain?.text).toBe('Quase lá');
  });

  it('restores the draft of its own kind and says so', async () => {
    useComposerDrafts.setState({
      drafts: {
        me: {
          plain: makeDraft({ text: 'Do feed' }),
          [`quote:${QUOTE_ID}`]: makeDraft({ text: 'Da citação', quotedPostId: QUOTE_ID }),
        },
      },
    });
    await renderScreen();

    expect(screen.getByLabelText(FIELD).props.value).toBe('Do feed');
    expect(showToast).toHaveBeenCalledWith('Rascunho restaurado');
  });

  it('restores a quote draft only in the composer of that quote', async () => {
    useComposerDrafts.setState({
      drafts: { me: { [`quote:${QUOTE_ID}`]: makeDraft({ text: 'Da citação', quotedPostId: QUOTE_ID }) } },
    });
    await renderScreen();
    expect(screen.getByLabelText(FIELD).props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => screen.unmount());

    mockParams = { quote: QUOTE_ID };
    await renderScreen();
    expect(screen.getByLabelText(FIELD).props.value).toBe('Da citação');
    expect(showToast).toHaveBeenCalledWith('Rascunho restaurado');
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Da citação', quotedPostId: QUOTE_ID });
  });

  it('restores the game of a draft from the composer of a game page', async () => {
    mockParams = { igdbId: '11' };
    mockPrelinkGame({ data: makeGame() });
    const celeste = makeGame({ id: 'g2', igdbId: 22, name: 'Celeste' });
    useComposerDrafts.setState({
      drafts: { me: { 'game:11': makeDraft({ text: 'Mudei de jogo', link: { game: celeste } }) } },
    });
    await renderScreen();

    expect(within(screen.getByTestId('composer-game-card')).getByText('Celeste')).toBeOnTheScreen();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Mudei de jogo', gameId: 'g2' });
  });

  it('restores a removed link as no game', async () => {
    mockParams = { igdbId: '11' };
    mockPrelinkGame({ data: makeGame() });
    useComposerDrafts.setState({
      drafts: { me: { 'game:11': makeDraft({ text: 'Sem jogo', link: { game: null } }) } },
    });
    await renderScreen();

    expect(screen.queryByTestId('composer-game-card')).toBeNull();
    await press('Publicar');
    expect(mockCreate).toHaveBeenCalledWith({ content: 'Sem jogo' });
  });

  it('keeps the chosen game in the draft', async () => {
    jest.useRealTimers();
    await renderScreen();
    await linkHadesThroughTheSheet();
    await screen.findByTestId('composer-game-card');
    jest.useFakeTimers();

    await typeText('Com jogo');
    await act(async () => jest.advanceTimersByTime(500));

    expect(drafts().plain).toMatchObject({ text: 'Com jogo', link: { game: { id: 'g1' } } });
  });

  it('clears the draft once the post is published', async () => {
    useComposerDrafts.setState({ drafts: { me: { plain: makeDraft() } } });
    const view = await renderScreen();

    await press('Publicar');
    await view.unmount();
    await act(async () => jest.advanceTimersByTime(500));

    expect(mockCreate).toHaveBeenCalledWith({ content: 'Rascunho antigo' });
    expect(drafts().plain).toBeUndefined();
  });

  it('does not restore the draft of another account', async () => {
    useComposerDrafts.setState({ drafts: { outra: { plain: makeDraft({ text: 'Da outra conta' }) } } });
    await renderScreen();

    expect(screen.getByLabelText(FIELD).props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('saves under the id of the signed-in account', async () => {
    await renderScreen();
    await typeText('Minha');
    await act(async () => jest.advanceTimersByTime(500));

    expect(Object.keys(useComposerDrafts.getState().drafts)).toEqual(['me']);
    expect(drafts().plain?.text).toBe('Minha');
  });

  it('does not restore a draft older than 7 days', async () => {
    const eightDays = 8 * 24 * 60 * 60 * 1000;
    useComposerDrafts.setState({
      drafts: { me: { plain: makeDraft({ text: 'Velho', savedAt: Date.now() - eightDays }) } },
    });
    await renderScreen();

    expect(screen.getByLabelText(FIELD).props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('saves nothing while the screen goes away after a sign-out or an expired session', async () => {
    const view = await renderScreen();
    await typeText('Ficou para trás');

    await act(async () => useSession.setState({ status: 'signedOut', user: null }));
    await act(async () => jest.advanceTimersByTime(500));
    await view.unmount();

    expect(useComposerDrafts.getState().drafts).toEqual({});
  });

  it('does not leave the draft of one account to the next one that signs in', async () => {
    const view = await renderScreen();
    await typeText('Da primeira conta');
    await view.unmount();
    expect(drafts().plain?.text).toBe('Da primeira conta');

    useSession.setState({
      user: { ...useSession.getState().user!, id: 'outra', username: 'outra' },
    });
    await renderScreen();

    expect(screen.getByLabelText(FIELD).props.value).toBe('');
  });

  it('ignores a stored draft with nothing in it', async () => {
    useComposerDrafts.setState({ drafts: { me: { plain: makeDraft({ text: '   ' }) } } });
    await renderScreen();

    expect(screen.getByLabelText(FIELD).props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
  });
});
