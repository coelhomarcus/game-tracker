import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { UserSummary } from '@/features/games/types';
import { profilesApi } from '@/features/profiles/api';
import type { ModerationPage, UserProfile } from '@/features/profiles/types';
import { NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { BlockedAccounts } from '../BlockedAccounts';
import { MutedAccounts } from '../MutedAccounts';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/profiles/api', () => ({
  profilesApi: { mutes: jest.fn(), blocks: jest.fn(), setMute: jest.fn(), setBlock: jest.fn() },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mocked = jest.mocked(profilesApi);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const person = (id: string, name: string | null = `Pessoa ${id}`): UserSummary => ({
  id,
  username: `user_${id}`,
  name,
  avatarUrl: null,
});

const pageOf = (items: UserSummary[], nextCursor: string | null = null): ModerationPage => ({
  items,
  nextCursor,
});

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
  jest.resetAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});

afterEach(async () => {
  await act(async () => client.clear());
});

async function renderScreen(Screen: typeof MutedAccounts) {
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

/** The names on the rows, in order (read from each row's profile link). */
const names = () =>
  screen
    .queryAllByTestId('moderation-row')
    .map((row) =>
      String(within(row).getByRole('button', { name: /^Perfil de / }).props.accessibilityLabel).slice(
        'Perfil de '.length,
      ),
    );

describe('MutedAccounts', () => {
  it('lists the muted accounts with avatar, name and handle, and opens a profile', async () => {
    mocked.mutes.mockResolvedValue(pageOf([person('u2'), person('u3', null)]));
    await renderScreen(MutedAccounts);

    expect(await screen.findByText('Pessoa u2')).toBeOnTheScreen();
    expect(screen.getByText('@user_u2')).toBeOnTheScreen();
    // No name: the handle stands in.
    expect(screen.getByText('user_u3')).toBeOnTheScreen();
    expect(mocked.mutes).toHaveBeenCalledWith(undefined);

    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Pessoa u2' }));
    expect(mockPush).toHaveBeenCalledWith('/users/u2');
  });

  it('has a small Reativar button per row, padded out to 48 dp', async () => {
    mocked.mutes.mockResolvedValue(pageOf([person('u2')]));
    await renderScreen(MutedAccounts);

    const button = await screen.findByRole('button', { name: 'Reativar Pessoa u2' });
    expect(button).toHaveTextContent('Reativar');
    // The small size is a 32 dp pill with 8 dp of hitSlop on each side.
    expect(button.props.hitSlop).toBe(8);
  });

  it('shows the empty state', async () => {
    mocked.mutes.mockResolvedValue(pageOf([]));
    await renderScreen(MutedAccounts);

    expect(await screen.findByText('Você não silenciou ninguém')).toBeOnTheScreen();
  });

  it('loads the next page at the end of the list, once', async () => {
    mocked.mutes
      .mockResolvedValueOnce(pageOf([person('u2')], 'c2'))
      .mockResolvedValueOnce(pageOf([person('u3')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await act(async () => {
      const list = screen.getByTestId('moderation-list');
      list.props.onEndReached();
      list.props.onEndReached();
    });

    expect(await screen.findByText('Pessoa u3')).toBeOnTheScreen();
    expect(mocked.mutes.mock.calls).toEqual([[undefined], ['c2']]);
    await act(async () => screen.getByTestId('moderation-list').props.onEndReached());
    expect(mocked.mutes).toHaveBeenCalledTimes(2);
  });

  it('offers to try again when a next page fails', async () => {
    mocked.mutes
      .mockResolvedValueOnce(pageOf([person('u2')], 'c2'))
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce(pageOf([person('u3')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await act(async () => screen.getByTestId('moderation-list').props.onEndReached());
    expect(await screen.findByText('Não foi possível carregar mais contas.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Pessoa u3')).toBeOnTheScreen();
  });

  it('shows an error with a retry when the list cannot load', async () => {
    mocked.mutes.mockRejectedValueOnce(new NetworkError()).mockResolvedValueOnce(pageOf([person('u2')]));
    await renderScreen(MutedAccounts);

    expect(await screen.findByText('Não foi possível carregar a lista')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(await screen.findByText('Pessoa u2')).toBeOnTheScreen();
  });

  it('unmutes at once: the row leaves and stays out when the server agrees', async () => {
    const request = deferred();
    mocked.setMute.mockReturnValueOnce(request.promise);
    mocked.mutes.mockResolvedValue(pageOf([person('u2'), person('u3')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u2' }));

    expect(mocked.setMute).toHaveBeenCalledWith('u2', false);
    await waitFor(() => expect(names()).toEqual(['Pessoa u3']));
    await act(async () => request.resolve());
    await waitFor(() => expect(names()).toEqual(['Pessoa u3']));
    expect(showToast).not.toHaveBeenCalled();
    // An undo does not refetch the list (it could race another undo).
    expect(mocked.mutes).toHaveBeenCalledTimes(1);
  });

  it('puts the row back where it was, with a toast, when unmuting fails', async () => {
    const request = deferred();
    mocked.setMute.mockReturnValueOnce(request.promise);
    mocked.mutes.mockResolvedValue(pageOf([person('u2'), person('u3'), person('u4')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u3');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u3' }));
    await waitFor(() => expect(names()).toEqual(['Pessoa u2', 'Pessoa u4']));
    await act(async () => request.reject(new NetworkError()));

    await waitFor(() => expect(names()).toEqual(['Pessoa u2', 'Pessoa u3', 'Pessoa u4']));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(showToast).toHaveBeenCalledWith(
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    );
  });

  it('a failed undo of one row leaves another undone row out', async () => {
    const first = deferred();
    mocked.setMute.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    mocked.mutes.mockResolvedValue(pageOf([person('u2'), person('u3')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u3' }));
    await act(async () => first.reject(new Error('boom')));

    await waitFor(() => expect(names()).toEqual(['Pessoa u2']));
  });

  it('clears the muted flag of a cached profile, and restores it on failure', async () => {
    const request = deferred();
    mocked.setMute.mockReturnValueOnce(request.promise);
    mocked.mutes.mockResolvedValue(pageOf([person('u2')]));
    client.setQueryData<Partial<UserProfile>>(['profile', 'u2'], { id: 'u2', isMutedByMe: true });
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u2' }));
    expect(client.getQueryData<UserProfile>(['profile', 'u2'])?.isMutedByMe).toBe(false);
    await act(async () => request.reject(new Error('boom')));

    await waitFor(() =>
      expect(client.getQueryData<UserProfile>(['profile', 'u2'])?.isMutedByMe).toBe(true),
    );
  });

  it('loads the next page instead of the empty state when every loaded row is undone', async () => {
    mocked.setMute.mockResolvedValue(undefined);
    mocked.mutes
      .mockResolvedValueOnce(pageOf([person('u2')], 'c2'))
      .mockResolvedValueOnce(pageOf([person('u3')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u2' }));

    expect(await screen.findByText('Pessoa u3')).toBeOnTheScreen();
    expect(mocked.mutes).toHaveBeenLastCalledWith('c2');
    expect(screen.queryByText('Você não silenciou ninguém')).not.toBeOnTheScreen();
  });

  it('shows the empty state once the last row is undone', async () => {
    mocked.setMute.mockResolvedValue(undefined);
    mocked.mutes.mockResolvedValue(pageOf([person('u2')]));
    await renderScreen(MutedAccounts);
    await screen.findByText('Pessoa u2');

    await fireEvent.press(screen.getByRole('button', { name: 'Reativar Pessoa u2' }));

    expect(await screen.findByText('Você não silenciou ninguém')).toBeOnTheScreen();
  });
});

describe('BlockedAccounts', () => {
  it('lists the blocked accounts with Desbloquear and unblocks optimistically', async () => {
    mocked.blocks.mockResolvedValue(pageOf([person('u5'), person('u6')]));
    mocked.setBlock.mockResolvedValue(undefined);
    await renderScreen(BlockedAccounts);
    await screen.findByText('Pessoa u5');

    expect(mocked.mutes).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear Pessoa u5' }));

    expect(mocked.setBlock).toHaveBeenCalledWith('u5', false);
    expect(mocked.setMute).not.toHaveBeenCalled();
    await waitFor(() => expect(names()).toEqual(['Pessoa u6']));
  });

  it('shows the empty state', async () => {
    mocked.blocks.mockResolvedValue(pageOf([]));
    await renderScreen(BlockedAccounts);

    expect(await screen.findByText('Você não bloqueou ninguém')).toBeOnTheScreen();
  });

  it('puts the row back with a toast when unblocking fails', async () => {
    mocked.blocks.mockResolvedValue(pageOf([person('u5')]));
    const request = deferred();
    mocked.setBlock.mockReturnValueOnce(request.promise);
    await renderScreen(BlockedAccounts);
    await screen.findByText('Pessoa u5');

    await fireEvent.press(screen.getByRole('button', { name: 'Desbloquear Pessoa u5' }));
    await waitFor(() => expect(names()).toEqual([]));
    await act(async () => request.reject(new Error('boom')));

    await waitFor(() => expect(names()).toEqual(['Pessoa u5']));
    expect(showToast).toHaveBeenCalledWith('Não foi possível concluir. Tente de novo.');
  });
});
