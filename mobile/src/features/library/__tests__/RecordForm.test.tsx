import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/features/auth';
import { useGame } from '@/features/games/queries';
import type { Game } from '@/features/games/types';
import { formatDate, todayDate } from '@/lib/dateOnly';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { updateBody } from '../api';
import { useCreateEntry, useLibrary, useUpdateEntry } from '../queries';
import { RecordForm } from '../RecordForm';
import type { GameEntry } from '../types';

jest.mock('@/features/games/queries', () => ({ useGame: jest.fn() }));
jest.mock('../queries', () => ({
  useLibrary: jest.fn(),
  useCreateEntry: jest.fn(),
  useUpdateEntry: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockDisablePrevention = jest.fn();
let mockParams: Record<string, string> = {};
const mockPrevent: {
  active: boolean;
  callback?: (options: { data: { action: unknown }; repeat: () => void }) => void;
} = { active: false };

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
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

function makeGame(platforms: string[]): Game {
  return {
    id: 'g1',
    igdbId: 11,
    name: 'Hades',
    coverUrl: null,
    summary: null,
    screenshots: [],
    platforms,
    genres: [],
    isFavoritedByMe: false,
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

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const refetchGame = jest.fn();
const refetchLibrary = jest.fn();

function mockGame(game: Game | undefined, overrides: Record<string, unknown> = {}) {
  jest.mocked(useGame).mockReturnValue({
    data: game,
    isPending: false,
    isError: false,
    error: null,
    refetch: refetchGame,
    ...overrides,
  } as unknown as ReturnType<typeof useGame>);
}

function mockEntries(entries: GameEntry[] | undefined, overrides: Record<string, unknown> = {}) {
  jest.mocked(useLibrary).mockReturnValue({
    data: entries,
    isPending: entries === undefined,
    isError: false,
    refetch: refetchLibrary,
    ...overrides,
  } as unknown as ReturnType<typeof useLibrary>);
}

async function renderForm() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <RecordForm />
    </SafeAreaProvider>,
  );
}

async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { igdbId: '11' };
  mockPrevent.active = false;
  mockPrevent.callback = undefined;
  mockCreate.mockResolvedValue(undefined);
  mockUpdate.mockResolvedValue(undefined);
  jest.mocked(useCreateEntry).mockReturnValue({
    mutateAsync: mockCreate,
  } as unknown as ReturnType<typeof useCreateEntry>);
  jest.mocked(useUpdateEntry).mockReturnValue({
    mutateAsync: mockUpdate,
  } as unknown as ReturnType<typeof useUpdateEntry>);
  mockGame(makeGame(['PC', 'PS5']));
  mockEntries([]);
});

describe('RecordForm (new record)', () => {
  it('shows the game name and the section copy', async () => {
    await renderForm();
    expect(screen.getByRole('header', { name: 'Hades' })).toBeOnTheScreen();
    for (const label of ['Status', 'Plataforma', 'Progresso', 'Sua avaliação']) {
      expect(screen.getByText(label)).toBeOnTheScreen();
    }
    expect(screen.getByText('Opcional. Aceita 12 ou 12,5.')).toBeOnTheScreen();
    expect(screen.getByText('Só você vê.')).toBeOnTheScreen();
    expect(screen.getByText('Sem nota')).toBeOnTheScreen();
  });

  it('saves the chosen status, platform and hours, then confirms and goes back', async () => {
    await renderForm();

    await press('Jogando');
    await press('PS5');
    await fireEvent.changeText(screen.getByLabelText('Horas jogadas'), '12,5');
    await press('Salvar registro');

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      igdbId: 11,
      draft: expect.objectContaining({ platform: 'PS5', status: 'playing', hoursPlayed: 12.5 }),
    });
    expect(showToast).toHaveBeenCalledWith('Registro criado');
    expect(mockDisablePrevention).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('blocks saving when the platform is blank', async () => {
    await renderForm();

    await press('Salvar registro');

    expect(screen.getByText('Informe a plataforma')).toBeOnTheScreen();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows validation errors on their fields', async () => {
    await renderForm();
    await press('PC');
    await fireEvent.changeText(screen.getByLabelText('Horas jogadas'), 'abc');
    await fireEvent.changeText(screen.getByLabelText('Início'), '31/02/2026');

    await press('Salvar registro');

    expect(screen.getByText('Use só números, como 12 ou 12,5.')).toBeOnTheScreen();
    expect(screen.getByText('Use o formato dd/mm/aaaa.')).toBeOnTheScreen();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('shows the API error above the button and keeps the form', async () => {
    const error = new NetworkError();
    mockCreate.mockRejectedValue(error);
    await renderForm();
    await press('PC');

    await press('Salvar registro');

    expect(screen.getByText(authErrorMessage(error))).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows the platform field for Outra and saves what is typed', async () => {
    await renderForm();
    expect(screen.queryByLabelText('Plataforma')).toBeNull();

    await press('Outra');
    const field = screen.getByLabelText('Plataforma');
    expect(field.props.placeholder).toBe('Ex.: PC');
    expect(field.props.maxLength).toBe(50);
    await fireEvent.changeText(field, 'Mega Drive');
    await press('Salvar registro');

    expect(mockCreate).toHaveBeenCalledWith({
      igdbId: 11,
      draft: expect.objectContaining({ platform: 'Mega Drive' }),
    });
  });

  it('shows the platform field when the game has no platforms', async () => {
    mockGame(makeGame([]));
    await renderForm();
    expect(screen.getByLabelText('Plataforma')).toBeOnTheScreen();
  });

  it('fills a date with today and formats typed digits as dd/mm/aaaa', async () => {
    await renderForm();

    await fireEvent.changeText(screen.getByLabelText('Início'), '01');
    expect(screen.getByLabelText('Início').props.value).toBe('01/');
    await fireEvent.changeText(screen.getByLabelText('Início'), '01/0');
    await fireEvent.changeText(screen.getByLabelText('Início'), '01/02');
    expect(screen.getByLabelText('Início').props.value).toBe('01/02/');
    await fireEvent.changeText(screen.getByLabelText('Início'), '010220261234');
    expect(screen.getByLabelText('Início').props.value).toBe('01/02/2026');

    await press('Preencher fim com hoje');
    expect(screen.getByLabelText('Fim').props.value).toBe(formatDate(todayDate()));
  });

  it('lets the user backspace over a slash', async () => {
    await renderForm();
    await fireEvent.changeText(screen.getByLabelText('Início'), '01');
    expect(screen.getByLabelText('Início').props.value).toBe('01/');
    await fireEvent.changeText(screen.getByLabelText('Início'), '01');
    expect(screen.getByLabelText('Início').props.value).toBe('01');
  });

  it('selects a rating, shows it, and clears it with the selected chip or Sem nota', async () => {
    await renderForm();

    await press('Nota 7 de 10');
    expect(screen.getByText('7/10')).toBeOnTheScreen();
    await press('Nota 7 de 10');
    expect(screen.queryByText('7/10')).toBeNull();

    await press('Nota 8 de 10');
    await press('Sem nota');
    expect(screen.queryByText('8/10')).toBeNull();
    expect(screen.getAllByText('Sem nota')).toHaveLength(1);
  });

  it('limits the notes length', async () => {
    await renderForm();
    expect(screen.getByLabelText('Notas pessoais').props.maxLength).toBe(2000);
  });

  it('mentions the existing record when the game already has one', async () => {
    mockEntries([makeEntry(makeGame(['PC', 'PS5']))]);
    await renderForm();
    expect(
      screen.getByText('Você já tem 1 registro deste jogo. Este será um novo registro.'),
    ).toBeOnTheScreen();
  });

  it('pluralizes the replay note and ignores other games', async () => {
    const game = makeGame(['PC', 'PS5']);
    const other = { ...makeGame([]), id: 'g2', igdbId: 99 };
    mockEntries([makeEntry(game), makeEntry(game, { id: 'e2' }), makeEntry(other, { id: 'e3' })]);
    await renderForm();
    expect(
      screen.getByText('Você já tem 2 registros deste jogo. Este será um novo registro.'),
    ).toBeOnTheScreen();
  });

  it('has no replay note for a first record', async () => {
    await renderForm();
    expect(screen.queryByText(/Você já tem/)).toBeNull();
  });
});

describe('RecordForm (discard guard)', () => {
  it('guards only after a change and asks before leaving', async () => {
    await renderForm();
    expect(mockPrevent.active).toBe(false);

    await press('Nota 5 de 10');
    expect(mockPrevent.active).toBe(true);
    expect(screen.queryByText('Descartar alterações?')).toBeNull();

    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    expect(screen.getByText('Descartar alterações?')).toBeOnTheScreen();
    expect(screen.getByText('O que você preencheu não foi salvo.')).toBeOnTheScreen();
    expect(repeat).not.toHaveBeenCalled();

    await press('Descartar');
    expect(repeat).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
  });

  it('keeps editing when the user cancels', async () => {
    await renderForm();
    await press('Nota 5 de 10');
    const repeat = jest.fn();
    await act(async () => mockPrevent.callback?.({ data: { action: {} }, repeat }));

    await press('Continuar editando');

    expect(repeat).not.toHaveBeenCalled();
    expect(screen.queryByText('Descartar alterações?')).toBeNull();
    expect(screen.getByText('5/10')).toBeOnTheScreen();
  });
});

describe('RecordForm (edit record)', () => {
  const game = makeGame(['PC', 'PS5']);

  beforeEach(() => {
    mockParams = { igdbId: '11', entryId: 'e1' };
  });

  it('prefills the form from the record', async () => {
    mockEntries([
      makeEntry(game, {
        hoursPlayed: 12.5,
        rating: 8,
        notes: 'Ótimo',
        startedAt: { year: 2026, month: 3, day: 5 },
      }),
    ]);
    await renderForm();

    expect(screen.getByLabelText('Horas jogadas').props.value).toBe('12,5');
    expect(screen.getByLabelText('Início').props.value).toBe('05/03/2026');
    expect(screen.getByLabelText('Notas pessoais').props.value).toBe('Ótimo');
    expect(screen.getByText('8/10')).toBeOnTheScreen();
    expect(screen.queryByText(/Você já tem/)).toBeNull();
  });

  it('goes back without saving when nothing changed', async () => {
    mockEntries([makeEntry(game)]);
    await renderForm();

    await press('Salvar registro');

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('sends only the rating when only the rating changed', async () => {
    const original = makeEntry(game);
    mockEntries([original]);
    await renderForm();

    await press('Nota 9 de 10');
    await press('Salvar registro');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const args = mockUpdate.mock.calls[0][0];
    expect(args.original).toBe(original);
    expect(updateBody(args.original, args.edited)).toEqual({ rating: 9 });
    expect(showToast).toHaveBeenCalledWith('Registro atualizado');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the record the form opened with as the patch base when the library refetches', async () => {
    const original = makeEntry(game);
    mockEntries([original]);
    await renderForm();

    // The mount-time refetch brings a copy changed on another device.
    mockEntries([makeEntry(game, { notes: 'Mudou em outro aparelho', hoursPlayed: 30 })]);
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <RecordForm />
      </SafeAreaProvider>,
    );
    await press('Nota 9 de 10');
    await press('Salvar registro');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const args = mockUpdate.mock.calls[0][0];
    expect(args.original).toBe(original);
    expect(updateBody(args.original, args.edited)).toEqual({ rating: 9 });
  });

  it('shows a custom platform of the record in the text field', async () => {
    mockEntries([makeEntry(game, { platform: 'Mega Drive' })]);
    await renderForm();
    expect(screen.getByLabelText('Plataforma').props.value).toBe('Mega Drive');
  });

  it('shows a not-found state for an unknown record', async () => {
    mockParams = { igdbId: '11', entryId: 'nope' };
    mockEntries([makeEntry(game)]);
    await renderForm();

    expect(screen.getByText('Registro não encontrado')).toBeOnTheScreen();
    expect(screen.getByText('Ele pode ter sido removido.')).toBeOnTheScreen();
    await press('Voltar ao jogo');
    expect(mockReplace).toHaveBeenCalledWith('/games/11');
  });

  it('waits for the library before deciding', async () => {
    mockEntries(undefined);
    await renderForm();
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByText('Registro não encontrado')).toBeNull();
  });

  it('offers a retry when the library fails to load', async () => {
    mockEntries(undefined, { isPending: false, isError: true });
    await renderForm();
    await press('Tentar novamente');
    expect(refetchLibrary).toHaveBeenCalledTimes(1);
  });
});

describe('RecordForm (loading and missing game)', () => {
  it('shows a spinner while the game loads', async () => {
    mockGame(undefined, { isPending: true });
    await renderForm();
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
  });

  it.each([['abc'], ['0'], ['-3'], ['1.5']])('rejects the invalid id %s', async (igdbId) => {
    mockParams = { igdbId };
    await renderForm();

    expect(screen.getByText('Jogo não encontrado')).toBeOnTheScreen();
    expect(screen.getByText('O endereço deste jogo não é válido.')).toBeOnTheScreen();
    expect(useGame).not.toHaveBeenCalled();
    await press('Ir para a Biblioteca');
    expect(mockReplace).toHaveBeenCalledWith('/library');
  });

  it('shows the same state when the game is a 404', async () => {
    mockGame(undefined, {
      isError: true,
      error: new ApiError(404, 'not_found', 'Jogo não encontrado'),
    });
    await renderForm();
    expect(screen.getByText('O endereço deste jogo não é válido.')).toBeOnTheScreen();
  });

  it('offers a retry for other game errors', async () => {
    mockGame(undefined, { isError: true, error: new NetworkError() });
    await renderForm();
    await press('Tentar novamente');
    expect(refetchGame).toHaveBeenCalledTimes(1);
  });
});
