import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useGamePosts } from '@/features/feed/queries';
import { useDeleteEntry, useLibrary, useUpdateEntry } from '@/features/library/queries';
import type { GameEntry } from '@/features/library/types';
import { ApiError } from '@/lib/http/errors';
import { apiOrigin } from '@/lib/env';
import { showToast } from '@/lib/toast';

import { GameScreen } from '../GameScreen';
import { useGame, useGamePlayers, useGameStats, useToggleFavorite } from '../queries';
import type { Game } from '../types';

jest.mock('../queries', () => ({
  useGame: jest.fn(),
  useGameStats: jest.fn(),
  useGamePlayers: jest.fn(),
  useToggleFavorite: jest.fn(),
}));
jest.mock('@/features/feed/queries', () => ({
  useGamePosts: jest.fn(),
  ...jest.requireActual<typeof import('@/test-utils/postControlHooks')>(
    '@/test-utils/postControlHooks',
  ).postControlHooks(),
}));
jest.mock('@/features/library/queries', () => ({
  useLibrary: jest.fn(),
  useUpdateEntry: jest.fn(),
  useDeleteEntry: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const hades: Game = {
  id: 'g1',
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  summary: 'Um roguelike de ação.',
  screenshots: [],
  platforms: ['PC', 'PS5'],
  genres: ['Roguelike', 'Ação'],
  isFavoritedByMe: false,
};

function makeEntry(overrides: Partial<GameEntry> = {}): GameEntry {
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
    game: hades,
    ...overrides,
  };
}

const mockToggle = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

function setup(options: { game?: Game; entries?: GameEntry[] } = {}) {
  const gameState = {
    data: options.game ?? hades,
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
  jest.mocked(useGame).mockReturnValue(gameState as never);
  jest.mocked(useLibrary).mockReturnValue({
    data: options.entries ?? [],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  } as never);
}

function tree() {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <GameScreen />
    </SafeAreaProvider>
  );
}

function renderScreen() {
  return render(tree());
}

async function openStatusSheet() {
  await fireEvent.press(screen.getByRole('button', { name: 'Ações do registro' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Alterar status' }));
}

beforeEach(() => {
  jest.resetAllMocks();
  mockParams = { igdbId: '11' };
  mockUpdate.mockResolvedValue(undefined);
  mockDelete.mockResolvedValue(undefined);
  jest.mocked(useToggleFavorite).mockReturnValue({ mutate: mockToggle } as never);
  jest.mocked(useUpdateEntry).mockReturnValue({ mutateAsync: mockUpdate } as never);
  jest.mocked(useDeleteEntry).mockReturnValue({ mutateAsync: mockDelete } as never);
  jest.mocked(useGameStats).mockReturnValue({
    data: { backlog: 4, playing: 3, completed: 2, dropped: 1 },
    isPending: false,
    isError: false,
  } as never);
  jest
    .mocked(useGamePlayers)
    .mockReturnValue({ data: [], isPending: false, isError: false } as never);
  jest.mocked(useGamePosts).mockReturnValue({
    data: { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
  } as never);
  setup();
});

describe('GameScreen', () => {
  it('shows the not found state for an invalid address', async () => {
    mockParams = { igdbId: 'abc' };
    await render(<GameScreen />);

    expect(screen.getByText('Jogo não encontrado')).toBeOnTheScreen();
    expect(screen.getByText('O endereço deste jogo não é válido.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ir para a Biblioteca' }));
    expect(mockReplace).toHaveBeenCalledWith('/library');
  });

  it('shows the not found state when the game does not exist', async () => {
    jest.mocked(useGame).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError(404, 'NOT_FOUND', 'x'),
      refetch: jest.fn(),
    } as never);
    await renderScreen();
    expect(screen.getByText('Jogo não encontrado')).toBeOnTheScreen();
  });

  it('offers a retry when the game fails to load', async () => {
    const refetch = jest.fn();
    jest.mocked(useGame).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('x'),
      refetch,
    } as never);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps the loaded game when a background refetch fails', async () => {
    jest.mocked(useGame).mockReturnValue({
      data: hades,
      isPending: false,
      isError: true,
      error: new ApiError(404, 'NOT_FOUND', 'x'),
      refetch: jest.fn(),
    } as never);
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Hades' })).toBeOnTheScreen();
    expect(screen.queryByText('Jogo não encontrado')).not.toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar')).not.toBeOnTheScreen();
  });

  it('shows the header and the about tab by default', async () => {
    await renderScreen();

    expect(screen.getByRole('header', { name: 'Hades' })).toBeOnTheScreen();
    expect(screen.getByText('PC · PS5')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Sobre', selected: true })).toBeOnTheScreen();
    expect(screen.getByText('Um roguelike de ação.')).toBeOnTheScreen();
    expect(screen.getByText('Roguelike')).toBeOnTheScreen();
    expect(screen.queryByText('Screenshots')).not.toBeOnTheScreen();
  });

  it('says so when the game has no synopsis', async () => {
    setup({ game: { ...hades, summary: null } });
    await renderScreen();
    expect(screen.getByText('Este jogo ainda não tem sinopse.')).toBeOnTheScreen();
  });

  it('collapses a long synopsis and expands it', async () => {
    setup({ game: { ...hades, summary: 'palavra '.repeat(80) } });
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais' }));
    expect(screen.getByRole('button', { name: 'Ler menos' })).toBeOnTheScreen();
  });

  it('opens the progress tab with ?tab=progress', async () => {
    mockParams = { igdbId: '11', tab: 'progress' };
    await renderScreen();
    expect(screen.getByRole('tab', { name: 'Meu progresso', selected: true })).toBeOnTheScreen();
  });

  it('without records offers to add the game and shows the progress empty state', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Adicionar à biblioteca' }));
    expect(mockPush).toHaveBeenCalledWith('/games/11/playthroughs/new');

    await fireEvent.press(screen.getByRole('tab', { name: 'Meu progresso' }));
    expect(screen.getByText('Você ainda não registrou este jogo')).toBeOnTheScreen();
    expect(
      screen.getByText('Crie um registro para acompanhar status, horas e nota.'),
    ).toBeOnTheScreen();
    mockPush.mockClear();
    await fireEvent.press(screen.getByRole('button', { name: 'Novo registro' }));
    expect(mockPush).toHaveBeenCalledWith('/games/11/playthroughs/new');
  });

  it('with records the primary button creates another record', async () => {
    setup({ entries: [makeEntry()] });
    await renderScreen();
    expect(screen.queryByRole('button', { name: 'Adicionar à biblioteca' })).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Novo registro' }));
    expect(mockPush).toHaveBeenCalledWith('/games/11/playthroughs/new');
  });

  it('toggles the favorite and reflects the new state', async () => {
    const view = await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Favoritar' }));
    expect(mockToggle).toHaveBeenCalledWith({ gameId: 'g1', favorite: true });

    setup({ game: { ...hades, isFavoritedByMe: true } });
    await view.rerender(tree());
    await fireEvent.press(screen.getByRole('button', { name: 'Remover dos favoritos' }));
    expect(mockToggle).toHaveBeenLastCalledWith({ gameId: 'g1', favorite: false });
  });

  describe('progress tab', () => {
    beforeEach(() => {
      mockParams = { igdbId: '11', tab: 'progress' };
    });

    it('lists the records of this game, newest first, with their details', async () => {
      const other: Game = { ...hades, id: 'g2', igdbId: 22, name: 'Celeste' };
      setup({
        entries: [
          makeEntry({ id: 'old', platform: 'PS5', createdAt: new Date(2026, 0, 1) }),
          makeEntry({
            id: 'new',
            status: 'completed',
            startedAt: { year: 2026, month: 3, day: 5 },
            finishedAt: { year: 2026, month: 3, day: 9 },
            hoursPlayed: 20,
            rating: 9,
            notes: 'Gostei muito',
            createdAt: new Date(2026, 2, 5),
          }),
          makeEntry({ id: 'x', game: other }),
        ],
      });
      await renderScreen();

      expect(screen.getAllByRole('button', { name: 'Ações do registro' })).toHaveLength(2);
      expect(screen.getByText('Início 05/03/2026')).toBeOnTheScreen();
      expect(screen.getByText('Fim 09/03/2026')).toBeOnTheScreen();
      expect(screen.getByText('20,0 h')).toBeOnTheScreen();
      expect(screen.getByRole('image', { name: 'Nota 9 de 10' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Nota privada')).toBeOnTheScreen();
      expect(screen.getByText('Gostei muito')).toBeOnTheScreen();

      const platforms = screen.getAllByText(/^(PC|PS5)$/).map((node) => node.props.children);
      expect(platforms).toEqual(['PC', 'PS5']);
    });

    it('edits a record through the menu', async () => {
      setup({ entries: [makeEntry()] });
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ações do registro' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Editar' }));
      expect(mockPush).toHaveBeenCalledWith('/games/11/playthroughs/e1/edit');
    });

    it('changes the status of a record', async () => {
      const entry = makeEntry();
      setup({ entries: [entry] });
      await renderScreen();

      await openStatusSheet();
      await fireEvent.press(await screen.findByRole('button', { name: 'Concluído' }));

      expect(mockUpdate).toHaveBeenCalledWith({
        original: entry,
        edited: {
          platform: 'PC',
          status: 'completed',
          startedAt: null,
          finishedAt: null,
          hoursPlayed: null,
          rating: null,
          notes: null,
        },
      });
      await act(async () => {});
      expect(showToast).toHaveBeenCalledWith('Status alterado');
    });

    it('shows the API error when changing the status fails', async () => {
      mockUpdate.mockRejectedValue(new ApiError(500, 'SERVER', 'x'));
      setup({ entries: [makeEntry()] });
      await renderScreen();

      await openStatusSheet();
      await fireEvent.press(await screen.findByRole('button', { name: 'Concluído' }));
      await act(async () => {});

      expect(showToast).toHaveBeenCalledTimes(1);
      expect(showToast).not.toHaveBeenCalledWith('Status alterado');
    });

    it('removes a record after confirming', async () => {
      setup({ entries: [makeEntry()] });
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ações do registro' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
      expect(await screen.findByText('Remover registro?')).toBeOnTheScreen();
      expect(screen.getByText('Seus outros registros do jogo continuam.')).toBeOnTheScreen();
      expect(mockDelete).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
      expect(mockDelete).toHaveBeenCalledWith('e1');
      await act(async () => {});
      expect(showToast).toHaveBeenCalledWith('Registro removido');
    });

    it('keeps the record when the removal is cancelled', async () => {
      setup({ entries: [makeEntry()] });
      await renderScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ações do registro' }));
      await fireEvent.press(screen.getByRole('button', { name: 'Remover' }));
      await fireEvent.press(await screen.findByRole('button', { name: 'Cancelar' }));
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it('offers a replay below the records', async () => {
      setup({ entries: [makeEntry()] });
      await renderScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Novo registro (replay)' }));
      expect(mockPush).toHaveBeenCalledWith('/games/11/playthroughs/new');
    });
  });

  describe('community tab', () => {
    it('shows the counts and requests players of the chosen scope', async () => {
      jest.mocked(useGamePlayers).mockReturnValue({
        data: [
          {
            user: { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
            status: 'playing',
            hoursPlayed: 12.5,
          },
          {
            user: { id: 'u2', username: 'bia', name: null, avatarUrl: null },
            status: 'playing',
            hoursPlayed: null,
          },
        ],
        isPending: false,
        isError: false,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(screen.getByText('Registros da comunidade')).toBeOnTheScreen();
      expect(screen.getByLabelText('Na fila: 4')).toBeOnTheScreen();
      expect(screen.getByLabelText('Jogando: 3')).toBeOnTheScreen();
      expect(screen.getByLabelText('Concluído: 2')).toBeOnTheScreen();
      expect(screen.getByLabelText('Abandonado: 1')).toBeOnTheScreen();
      expect(
        screen.getByText('Conta registros, não pessoas: quem rejoga aparece mais de uma vez.'),
      ).toBeOnTheScreen();
      expect(screen.getByText('Alguns dos jogadores, até 10.')).toBeOnTheScreen();
      expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
      expect(screen.getByText('12,5 h')).toBeOnTheScreen();
      expect(screen.getByText('@ana')).toBeOnTheScreen();
      // Without a name the title is the username, with no second line repeating it.
      expect(screen.getByText('bia')).toBeOnTheScreen();
      expect(screen.queryByText('@bia')).toBeNull();
      expect(useGamePlayers).toHaveBeenLastCalledWith('g1', 'all');

      await fireEvent.press(screen.getByRole('tab', { name: 'Quem eu sigo' }));
      expect(useGamePlayers).toHaveBeenLastCalledWith('g1', 'following');
    });

    it('opens the profile of a player from the list', async () => {
      jest.mocked(useGamePlayers).mockReturnValue({
        data: [
          {
            user: { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
            status: 'playing',
            hoursPlayed: 12.5,
          },
          {
            user: { id: 'u2', username: 'bia', name: null, avatarUrl: null },
            status: 'playing',
            hoursPlayed: null,
          },
        ],
        isPending: false,
        isError: false,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      // The label carries the hours the row shows; without hours it is only the name.
      await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Ana Souza, 12,5 h' }));
      expect(mockPush).toHaveBeenLastCalledWith('/users/u1');
      await fireEvent.press(screen.getByRole('button', { name: 'Perfil de bia' }));
      expect(mockPush).toHaveBeenLastCalledWith('/users/u2');
    });

    it('titles a player with a blank name by the username', async () => {
      jest.mocked(useGamePlayers).mockReturnValue({
        data: [
          {
            user: { id: 'u3', username: 'caio', name: '  ', avatarUrl: null },
            status: 'playing',
            hoursPlayed: null,
          },
        ],
        isPending: false,
        isError: false,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      const row = screen.getByRole('button', { name: 'Perfil de caio' });
      expect(within(row).getByText('caio')).toBeOnTheScreen();
    });

    it('shows the posts of the game below the players', async () => {
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(useGamePosts).toHaveBeenLastCalledWith('g1');
      await fireEvent.press(screen.getByRole('button', { name: 'Publicar sobre este jogo' }));
      expect(mockPush).toHaveBeenCalledWith('/posts/new?igdbId=11');
    });

    const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };

    it('lists a player once when they have more than one playing record', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.mocked(useGamePlayers).mockReturnValue({
        data: [
          { user: ana, status: 'playing', hoursPlayed: 12.5 },
          { user: ana, status: 'playing', hoursPlayed: 3 },
        ],
        isPending: false,
        isError: false,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(screen.getAllByText('Ana Souza')).toHaveLength(1);
      expect(screen.getByText('12,5 h')).toBeOnTheScreen();
      expect(screen.queryByText('3,0 h')).toBeNull();
      expect(error).not.toHaveBeenCalled();
      error.mockRestore();
    });

    it('rewrites the avatar of a player onto the api origin', async () => {
      jest.mocked(useGamePlayers).mockReturnValue({
        data: [
          {
            user: { ...ana, avatarUrl: 'https://api.prod.example/uploads/ana.png' },
            status: 'playing',
            hoursPlayed: null,
          },
        ],
        isPending: false,
        isError: false,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(screen.getByLabelText('Ana Souza').props.source).toEqual({
        uri: `${apiOrigin}/uploads/ana.png`,
      });
    });

    it('retries the counts when they fail to load', async () => {
      const refetch = jest.fn();
      jest.mocked(useGameStats).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        refetch,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(screen.getByText('Não foi possível carregar os números.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('retries the players when they fail to load', async () => {
      const refetch = jest.fn();
      jest.mocked(useGamePlayers).mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        refetch,
      } as never);
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));

      expect(screen.getByText('Não foi possível carregar os jogadores.')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(refetch).toHaveBeenCalledTimes(1);
    });

    it('explains an empty player list per scope', async () => {
      await renderScreen();
      await fireEvent.press(screen.getByRole('tab', { name: 'Comunidade' }));
      expect(screen.getByText('Ninguém está jogando agora.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('tab', { name: 'Quem eu sigo' }));
      expect(screen.getByText('Ninguém que você segue está jogando.')).toBeOnTheScreen();
      expect(screen.queryByText('Ninguém está jogando agora.')).not.toBeOnTheScreen();
    });
  });
});
