import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { profilesApi } from '@/features/profiles/api';
import { useFollowList, usePeopleSearch, useSetModeration } from '@/features/profiles/queries';
import type { PersonResult, UserProfile } from '@/features/profiles/types';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { chatApi } from '../api';
import ConversationsScreen from '../ConversationsScreen';
import { formatConversationTime } from '../formatConversationTime';
import {
  MessagesMoreButton,
  messagesTabLabel,
  NewConversationButton,
  useUnreadConversationCount,
} from '../MessagesTab';
import { NewConversationSheet, pickSuggestions } from '../NewConversationSheet';
import { conversationsKey } from '../queries';
import { openNewConversationSheet, useNewConversationSheet } from '../sheetStore';
import type { Conversation, Message } from '../types';

const mockPush = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => mockNavigation,
}));

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));

jest.mock('@/features/chat/api', () => ({
  chatApi: {
    list: jest.fn(),
    create: jest.fn(),
    messages: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
    setMuted: jest.fn(),
    leave: jest.fn(),
  },
}));

jest.mock('@/features/profiles/api', () => ({
  profilesApi: { ...jest.requireActual('@/features/profiles/api').profilesApi, get: jest.fn() },
}));

const mockBlock = jest.fn();
jest.mock('@/features/profiles/queries', () => ({
  usePeopleSearch: jest.fn(),
  useFollowList: jest.fn(),
  useSetModeration: jest.fn(),
  useToggleFollow: () => ({ mutate: jest.fn() }),
}));

const mockedApi = jest.mocked(chatApi);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const joao = { id: 'u2', username: 'joaozinho', name: 'João Lima', avatarUrl: null };
const carla = { id: 'u3', username: 'carla', name: null, avatarUrl: null };

function message(id: string, senderId: string, content: string, minutesAgo: number): Message {
  return {
    id,
    conversationId: 'x',
    senderId,
    content,
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
    clientMessageId: null,
    sender: { id: senderId, username: senderId, name: null, avatarUrl: null },
    reactions: [],
    replyTo: null,
  };
}

const withAna: Conversation = {
  id: 'c1',
  otherUser: ana,
  lastMessage: message('m1', 'u1', 'Bora jogar?', 5),
  unread: true,
  muted: false,
};
const withJoao: Conversation = {
  id: 'c2',
  otherUser: joao,
  lastMessage: message('m2', 'me', 'Fechado', 120),
  unread: false,
  muted: false,
};
const withCarla: Conversation = { id: 'c3', otherUser: carla, lastMessage: null, unread: false, muted: false };
const orphan: Conversation = {
  id: 'c4',
  otherUser: null,
  lastMessage: message('m4', 'u9', 'Oi', 1),
  unread: false,
  muted: false,
};

let client: QueryClient;

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

async function renderScreen() {
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <GestureHandlerRootView>
          <ConversationsScreen />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

async function renderWithList(list: Conversation[]) {
  mockedApi.list.mockResolvedValue(list);
  await renderScreen();
  await screen.findByTestId('conversations-list');
}

async function type(label: string, text: string) {
  await fireEvent.changeText(screen.getByLabelText(label), text);
}

const person: PersonResult = {
  id: 'p1',
  username: 'bia',
  name: 'Bia Rocha',
  avatarUrl: null,
  bio: null,
  isFollowedByMe: false,
};

function mockFollowing(people: PersonResult[] = []) {
  jest.mocked(useFollowList).mockReturnValue({
    data: { pages: [{ items: people.map((p) => ({ ...p, followsMe: false })), nextCursor: null }], pageParams: [undefined] },
  } as unknown as ReturnType<typeof useFollowList>);
}

function mockSearch(overrides: Record<string, unknown> = {}) {
  jest.mocked(usePeopleSearch).mockReturnValue({
    data: [person],
    isPending: false,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof usePeopleSearch>);
}

beforeEach(() => {
  client = freshClient();
  mockPush.mockReset();
  mockNavigation.addListener.mockReset();
  mockNavigation.addListener.mockReturnValue(jest.fn());
  mockedApi.list.mockReset();
  mockedApi.create.mockReset();
  // A suggestion's profile stays on its way unless a test answers it.
  jest.mocked(profilesApi.get).mockReset().mockReturnValue(new Promise(() => undefined));
  jest.mocked(showToast).mockReset();
  mockSearch();
  mockFollowing();
  mockBlock.mockReset();
  jest.mocked(useSetModeration).mockReturnValue({ mutate: mockBlock } as unknown as ReturnType<
    typeof useSetModeration
  >);
  jest.mocked(haptic).mockReset();
  for (const fn of [mockedApi.markRead, mockedApi.markAllRead, mockedApi.setMuted, mockedApi.leave]) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
  useNewConversationSheet.setState({ open: false });
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  client.clear();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ConversationsScreen', () => {
  it('shows 12 skeleton rows while the first load is pending', async () => {
    mockedApi.list.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    expect(screen.getAllByTestId('conversation-skeleton-row')).toHaveLength(12);
  });

  it('lists the conversations with previews, times and the unread label', async () => {
    await renderWithList([withAna, withJoao, withCarla, orphan]);
    const time = (c: Conversation) => formatConversationTime(c.lastMessage!.createdAt);

    expect(
      screen.getByRole('button', { name: `Ana Souza, Não lida, Bora jogar?, ${time(withAna)}` }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: `João Lima, Você: Fechado, ${time(withJoao)}` }),
    ).toBeOnTheScreen();
    // A blank name falls back to the username; no message has no time.
    expect(screen.getByRole('button', { name: 'carla, Nenhuma mensagem' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `Conversa, Oi, ${time(orphan)}` })).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    expect(screen.getByText(time(withAna))).toBeOnTheScreen();
    expect(screen.getByText('Você: Fechado')).toBeOnTheScreen();
    expect(screen.getByText('Nenhuma mensagem')).toBeOnTheScreen();
    expect(screen.getAllByTestId('conversation-unread-dot')).toHaveLength(1);
  });

  it('does not treat someone else as me in the preview', async () => {
    await renderWithList([withAna]);

    expect(screen.queryByText(/^Você: /)).not.toBeOnTheScreen();
    expect(screen.getByText('Bora jogar?')).toBeOnTheScreen();
  });

  it('opens the conversation when a row is pressed', async () => {
    await renderWithList([withAna, withJoao]);
    await fireEvent.press(screen.getByRole('button', { name: /^João Lima/ }));

    expect(mockPush).toHaveBeenCalledWith('/chat/c2');
  });

  it('filters by name or username without case or accents', async () => {
    await renderWithList([withAna, withJoao, withCarla, orphan]);

    await type('Buscar conversas', 'JOAO');
    expect(screen.getByText('João Lima')).toBeOnTheScreen();
    expect(screen.queryByText('Ana Souza')).not.toBeOnTheScreen();

    await type('Buscar conversas', 'carl');
    expect(screen.getByText('carla')).toBeOnTheScreen();
    expect(screen.queryByText('João Lima')).not.toBeOnTheScreen();
    // A conversation without a known person matches no search.
    expect(screen.queryByText('Conversa')).not.toBeOnTheScreen();
  });

  it('counts conversations in the tabs and filters the unread ones', async () => {
    await renderWithList([withAna, withJoao, withCarla]);

    expect(screen.getByRole('tab', { name: 'Todas (3)' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Não lidas (1)' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Não lidas (1)' }));
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByText('João Lima')).not.toBeOnTheScreen();
  });

  it('offers to clear the search when nothing matches', async () => {
    await renderWithList([withAna, withJoao]);
    await fireEvent.press(screen.getByRole('tab', { name: 'Não lidas (1)' }));
    await type('Buscar conversas', 'zzz');

    expect(screen.getByText('Nenhuma conversa encontrada')).toBeOnTheScreen();
    expect(screen.getByText('Tente outro nome ou limpe a busca.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.queryByText('Nenhuma conversa encontrada')).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Buscar conversas').props.value).toBe('');
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('João Lima')).toBeOnTheScreen();
  });

  it('shows the empty state and opens the new conversation sheet from it', async () => {
    await renderWithList([]);

    expect(screen.getByText('Nenhuma conversa ainda')).toBeOnTheScreen();
    expect(screen.getByText('Diga oi para alguém.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Buscar conversas')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Nova conversa' }));
    expect(await screen.findByLabelText('Buscar pessoas')).toBeOnTheScreen();
  });

  it('shows an error with a retry when the first load fails', async () => {
    mockedApi.list.mockRejectedValueOnce(new Error('boom')).mockResolvedValue([withAna]);
    await renderScreen();

    expect(await screen.findByText('Não foi possível carregar as conversas')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Ana Souza')).toBeOnTheScreen();
  });

  it('keeps the loaded list when a background refresh fails', async () => {
    await renderWithList([withAna]);
    mockedApi.list.mockRejectedValue(new Error('boom'));

    await act(async () => {
      screen.getByTestId('conversations-list').props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByText('Ana Souza')).toBeOnTheScreen();
    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar as conversas');
    expect(screen.queryByText('Não foi possível carregar as conversas')).not.toBeOnTheScreen();
  });

  it('refetches on pull to refresh', async () => {
    await renderWithList([withAna]);
    mockedApi.list.mockResolvedValue([withAna, withJoao]);

    await act(async () => {
      screen.getByTestId('conversations-list').props.refreshControl.props.onRefresh();
    });

    expect(await screen.findByText('João Lima')).toBeOnTheScreen();
  });

  it('still opens the new conversation sheet while the list is failing', async () => {
    mockedApi.list.mockRejectedValue(new Error('boom'));
    await renderScreen();
    await screen.findByText('Não foi possível carregar as conversas');

    await act(async () => openNewConversationSheet());
    expect(await screen.findByLabelText('Buscar pessoas')).toBeOnTheScreen();
  });

  it('closes the sheet when the screen unmounts', async () => {
    await renderWithList([withAna]);
    await act(async () => openNewConversationSheet());
    await screen.unmount();

    expect(useNewConversationSheet.getState().open).toBe(false);
  });

  it('listens for a press on its own tab to scroll back to the top', async () => {
    await renderWithList([withAna]);

    expect(mockNavigation.addListener).toHaveBeenCalledWith('tabPress', expect.any(Function));
  });
});

describe('conversation rows', () => {
  it('tints an unread row, shows the dot and sets the preview in medium', async () => {
    await renderWithList([withAna, withJoao]);

    expect(screen.getByRole('button', { name: /^Ana Souza/ })).toHaveStyle({
      backgroundColor: colors.bgContrast25,
    });
    expect(screen.getByRole('button', { name: /^João Lima/ })).toHaveStyle({ backgroundColor: colors.bg });
    expect(screen.getAllByTestId('conversation-unread-dot')).toHaveLength(1);
    expect(screen.getByText('Bora jogar?')).toHaveStyle({ fontFamily: 'Inter_500Medium', color: colors.text });
    expect(screen.getByText('Você: Fechado')).toHaveStyle({
      fontFamily: 'Inter_400Regular',
      color: colors.textMedium,
    });
    expect(screen.getByText('Ana Souza')).toHaveStyle({
      fontFamily: 'Inter_600SemiBold',
      color: colors.textEmphasis,
    });
  });

  it('shows a muted conversation with the bell-off icon and never as unread', async () => {
    await renderWithList([{ ...withAna, muted: true }]);
    const row = screen.getByRole('button', { name: /^Ana Souza/ });
    const time = formatConversationTime(withAna.lastMessage!.createdAt);

    expect(row).toHaveAccessibleName(`Ana Souza, Silenciada, Bora jogar?, ${time}`);
    expect(screen.getByTestId('conversation-muted-icon')).toBeOnTheScreen();
    expect(screen.queryByTestId('conversation-unread-dot')).not.toBeOnTheScreen();
    expect(row).toHaveStyle({ backgroundColor: colors.bg });
    expect(screen.getByText('Bora jogar?')).toHaveStyle({ fontFamily: 'Inter_400Regular' });
    // Nor among the unread ones.
    expect(screen.getByRole('tab', { name: 'Não lidas (0)' })).toBeOnTheScreen();
  });
});

describe('conversation menu', () => {
  async function openMenu(name: RegExp) {
    await fireEvent(screen.getByRole('button', { name }), 'longPress');
  }
  const option = (name: string) => screen.getByRole('button', { name });

  it('opens on a long press with the haptic and the options of an unread conversation', async () => {
    await renderWithList([withAna, withJoao]);
    await openMenu(/^Ana Souza/);

    expect(haptic).toHaveBeenCalledWith('longPress');
    for (const name of [
      'Ver perfil',
      'Marcar como lida',
      'Silenciar conversa',
      'Bloquear @ana',
      'Sair da conversa',
    ]) {
      expect(option(name)).toBeOnTheScreen();
    }
    expect(screen.queryByRole('button', { name: 'Reativar conversa' })).not.toBeOnTheScreen();
  });

  it('offers to unmute and no mark-read on a read, muted conversation', async () => {
    await renderWithList([{ ...withJoao, muted: true }]);
    await openMenu(/^João Lima/);

    expect(option('Reativar conversa')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Marcar como lida' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Silenciar conversa' })).not.toBeOnTheScreen();

    await fireEvent.press(option('Reativar conversa'));
    expect(mockedApi.setMuted).toHaveBeenCalledWith('c2', false);
  });

  it('opens the profile', async () => {
    await renderWithList([withAna]);
    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Ver perfil'));

    expect(mockPush).toHaveBeenCalledWith('/users/u1');
  });

  it('marks the conversation read', async () => {
    await renderWithList([withAna]);
    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Marcar como lida'));

    expect(mockedApi.markRead).toHaveBeenCalledWith('c1');
    expect(screen.queryByTestId('conversation-unread-dot')).not.toBeOnTheScreen();
  });

  it('mutes the conversation', async () => {
    await renderWithList([withAna]);
    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Silenciar conversa'));

    expect(mockedApi.setMuted).toHaveBeenCalledWith('c1', true);
    expect(await screen.findByTestId('conversation-muted-icon')).toBeOnTheScreen();
  });

  it('blocks the person after the confirmation', async () => {
    await renderWithList([withAna]);
    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Bloquear @ana'));

    expect(screen.getByText('Bloquear @ana?')).toBeOnTheScreen();
    expect(mockBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Bloquear' }));
    expect(mockBlock).toHaveBeenCalledWith({ person: ana, on: true });
  });

  it('offers no profile or block for a conversation without the other person', async () => {
    await renderWithList([orphan]);
    await openMenu(/^Conversa/);

    expect(screen.queryByRole('button', { name: 'Ver perfil' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Bloquear/ })).not.toBeOnTheScreen();
    expect(option('Sair da conversa')).toBeOnTheScreen();
  });

  it('leaves only after the confirmation', async () => {
    await renderWithList([withAna, withJoao]);
    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Sair da conversa'));

    expect(screen.getByText('Sair da conversa?')).toBeOnTheScreen();
    expect(
      screen.getByText('A conversa some da sua lista. Se @ana mandar uma nova mensagem, ela volta.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mockedApi.leave).not.toHaveBeenCalled();
    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();

    await openMenu(/^Ana Souza/);
    await fireEvent.press(option('Sair da conversa'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(mockedApi.leave).toHaveBeenCalledWith('c1');
    expect(screen.queryByText('Ana Souza')).not.toBeOnTheScreen();
    expect(screen.getByText('João Lima')).toBeOnTheScreen();
  });
});

describe('conversation swipe', () => {
  async function swipe(id: string, translationX: number) {
    await act(async () => {
      fireGestureHandler(getByGestureTestId(`conversation-swipe-${id}`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -20 },
        { translationX },
        { state: State.END, translationX },
      ]);
    });
  }

  it('marks read past 120', async () => {
    await renderWithList([withAna]);
    await swipe('c1', -150);

    expect(mockedApi.markRead).toHaveBeenCalledWith('c1');
    expect(screen.queryByTestId('conversation-unread-dot')).not.toBeOnTheScreen();
    expect(screen.queryByText('Sair da conversa?')).not.toBeOnTheScreen();
  });

  it('asks to leave past 225', async () => {
    await renderWithList([withAna]);
    await swipe('c1', -240);

    expect(mockedApi.markRead).not.toHaveBeenCalled();
    expect(screen.getByText('Sair da conversa?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(mockedApi.leave).toHaveBeenCalledWith('c1');
  });

  it('does nothing below 120', async () => {
    await renderWithList([withAna]);
    await swipe('c1', -100);

    expect(mockedApi.markRead).not.toHaveBeenCalled();
    expect(screen.queryByText('Sair da conversa?')).not.toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers the swipe actions to screen readers', async () => {
    await renderWithList([withAna, withJoao]);
    const ana = screen.getByRole('button', { name: /^Ana Souza/ });
    const joao = screen.getByRole('button', { name: /^João Lima/ });
    expect(ana.props.accessibilityActions).toEqual([
      { name: 'read', label: 'Marcar como lida' },
      { name: 'leave', label: 'Sair da conversa' },
    ]);
    // Nothing to mark read on a read conversation.
    expect(joao.props.accessibilityActions).toEqual([{ name: 'leave', label: 'Sair da conversa' }]);

    await fireEvent(ana, 'accessibilityAction', { nativeEvent: { actionName: 'read' } });
    expect(mockedApi.markRead).toHaveBeenCalledWith('c1');

    await fireEvent(joao, 'accessibilityAction', { nativeEvent: { actionName: 'leave' } });
    expect(screen.getByText('Sair da conversa?')).toBeOnTheScreen();
    expect(mockedApi.leave).not.toHaveBeenCalled();
  });
});

function SheetHarness() {
  const [open, setOpen] = useState(true);
  return <NewConversationSheet visible={open} onClose={() => setOpen(false)} />;
}

async function renderSheet() {
  await render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        <SheetHarness />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('NewConversationSheet', () => {
  it('is titled and lists people without the follow button', async () => {
    await renderSheet();
    await type('Buscar pessoas', 'bi');

    expect(screen.getByText('Nova conversa')).toBeOnTheScreen();
    expect(screen.getByText('Bia Rocha')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Seguir/ })).not.toBeOnTheScreen();
    expect(usePeopleSearch).toHaveBeenLastCalledWith('bi');
  });

  it('hides me from the results', async () => {
    mockSearch({ data: [{ ...person, id: 'me', name: 'Eu Mesmo' }, person] });
    await renderSheet();
    await type('Buscar pessoas', 'bi');

    expect(screen.queryByText('Eu Mesmo')).not.toBeOnTheScreen();
    expect(screen.getByText('Bia Rocha')).toBeOnTheScreen();
  });

  it('starts the conversation and opens it', async () => {
    mockedApi.create.mockResolvedValue('conv-9');
    await renderSheet();
    await type('Buscar pessoas', 'bi');
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));

    expect(mockedApi.create).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/conv-9'));
    expect(screen.queryByLabelText('Buscar pessoas')).not.toBeOnTheScreen();
  });

  it('starts only one conversation when pressed twice', async () => {
    let resolve: (id: string) => void = () => undefined;
    mockedApi.create.mockReturnValue(new Promise<string>((done) => (resolve = done)));
    await renderSheet();
    await type('Buscar pessoas', 'bi');
    const row = screen.getByRole('button', { name: 'Conversar com Bia Rocha' });
    await fireEvent.press(row);
    await fireEvent.press(row);
    await act(async () => resolve('conv-9'));

    expect(mockedApi.create).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('keeps the sheet open and shows a toast when starting fails', async () => {
    mockedApi.create.mockRejectedValue(new ApiError(500, 'server_error', 'Erro no servidor'));
    await renderSheet();
    await type('Buscar pessoas', 'bi');
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Erro no servidor'));
    // The root toast host sits under the native Modal: the sheet shows the failure itself.
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro no servidor');
    expect(screen.getByLabelText('Buscar pessoas')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it.each([
    ['dm_not_allowed', 'Esta pessoa não aceita mensagens suas.'],
    ['blocked', 'Não é possível interagir com esta conta.'],
  ])('explains a %s refusal instead of asking to try again', async (code, copy) => {
    mockedApi.create.mockRejectedValue(new ApiError(403, code, 'refused'));
    await renderSheet();
    await type('Buscar pessoas', 'bi');
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(copy));
    expect(await screen.findByRole('alert')).toHaveTextContent(copy);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears the inline failure when typing or choosing again', async () => {
    mockedApi.create
      .mockRejectedValueOnce(new ApiError(500, 'server_error', 'Erro no servidor'))
      .mockResolvedValueOnce('conv-9');
    await renderSheet();
    await type('Buscar pessoas', 'bi');
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));
    await screen.findByRole('alert');

    await type('Buscar pessoas', 'bia');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    mockedApi.create.mockReset();
    mockedApi.create.mockRejectedValueOnce(new ApiError(500, 'server_error', 'Erro no servidor'));
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));
    await screen.findByRole('alert');
    mockedApi.create.mockResolvedValueOnce('conv-9');
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/conv-9'));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('closes on the Android back button', async () => {
    await renderSheet();
    // The Modal sits above the field; Android's back button calls its onRequestClose.
    let node = screen.getByLabelText('Buscar pessoas').parent;
    while (node && typeof node.props.onRequestClose !== 'function') node = node.parent;
    const onRequestClose = node?.props.onRequestClose as () => void;
    await act(async () => onRequestClose());

    expect(screen.queryByLabelText('Buscar pessoas')).not.toBeOnTheScreen();
  });

  it('closes from the close button', async () => {
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByLabelText('Buscar pessoas')).not.toBeOnTheScreen();
  });
});

describe('Messages tab', () => {
  async function renderCount() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useUnreadConversationCount(), { wrapper });
  }

  it('counts the unread conversations', async () => {
    mockedApi.list.mockResolvedValue([withJoao, withAna, { ...withCarla, unread: true }]);
    const { result } = await renderCount();

    await waitFor(() => expect(result.current).toBe(2));
  });

  it('leaves muted conversations out of the count', async () => {
    mockedApi.list.mockResolvedValue([withAna, { ...withJoao, unread: true, muted: true }]);
    const { result } = await renderCount();

    // Counting the muted one would reach 2.
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('counts none when everything is read', async () => {
    mockedApi.list.mockResolvedValue([withJoao]);
    const { result } = await renderCount();
    await waitFor(() => expect(mockedApi.list).toHaveBeenCalled());
    await act(async () => undefined);

    expect(result.current).toBe(0);
  });

  it('puts the unread count in the tab label', () => {
    expect(messagesTabLabel(0)).toBe('Mensagens');
    expect(messagesTabLabel(1)).toBe('Mensagens, 1 não lida');
    expect(messagesTabLabel(3)).toBe('Mensagens, 3 não lidas');
  });

  it('opens the new conversation sheet from the header button', async () => {
    await render(<NewConversationButton />);
    expect(screen.getByRole('button', { name: 'Nova conversa' })).toHaveStyle({ minWidth: 48, minHeight: 48 });
    await fireEvent.press(screen.getByRole('button', { name: 'Nova conversa' }));

    expect(useNewConversationSheet.getState().open).toBe(true);
  });
});

describe('Messages list actions', () => {
  async function renderMore(list: Conversation[]) {
    mockedApi.list.mockResolvedValue(list);
    await render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider initialMetrics={metrics}>
          <MessagesMoreButton />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(client.getQueryData(conversationsKey)).toBeDefined());
    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
  }

  it('marks every conversation read', async () => {
    await renderMore([withAna, withJoao]);
    const markAll = screen.getByRole('button', { name: 'Marcar todas como lidas' });
    expect(markAll).toBeEnabled();

    await fireEvent.press(markAll);
    expect(mockedApi.markAllRead).toHaveBeenCalledTimes(1);
    expect(client.getQueryData<Conversation[]>(conversationsKey)?.some((c) => c.unread)).toBe(false);
  });

  it('cannot mark all read when nothing shows as unread', async () => {
    await renderMore([withJoao, { ...withAna, muted: true }]);
    const markAll = screen.getByRole('button', { name: 'Marcar todas como lidas' });

    expect(markAll).toBeDisabled();
    await fireEvent.press(markAll);
    expect(mockedApi.markAllRead).not.toHaveBeenCalled();
  });
});

describe('NewConversationSheet suggestions', () => {
  const bia = person;
  const me: PersonResult = { ...person, id: 'me', username: 'eu', name: 'Eu Mesmo' };

  it('suggests people from my conversations, then the ones I follow, without repeats or me', async () => {
    client.setQueryData(conversationsKey, [withAna, withJoao, orphan]);
    mockedApi.list.mockResolvedValue([withAna, withJoao, orphan]);
    mockFollowing([{ ...person, ...ana, bio: null }, bia, me]);
    await renderSheet();

    expect(screen.getByText('Sugestões')).toBeOnTheScreen();
    const rows = screen.getAllByRole('button', { name: /^Conversar com / });
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      'Conversar com Ana Souza',
      'Conversar com João Lima',
      'Conversar com Bia Rocha',
    ]);
  });

  it('starts a conversation from a suggestion', async () => {
    mockFollowing([bia]);
    mockedApi.create.mockResolvedValue('conv-9');
    await renderSheet();
    await fireEvent.press(screen.getByRole('button', { name: 'Conversar com Bia Rocha' }));

    expect(mockedApi.create).toHaveBeenCalledWith('p1');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/chat/conv-9'));
  });

  it('keeps at most 10 suggestions', () => {
    const people = Array.from({ length: 14 }, (_, i) => ({ ...ana, id: `f${i}` }));
    const picked = pickSuggestions([joao, null, ana], people, 'me');

    expect(picked).toHaveLength(10);
    expect(picked.slice(0, 3).map((p) => p.id)).toEqual(['u2', 'u1', 'f0']);
  });

  it('hides the suggestions while searching', async () => {
    mockFollowing([bia]);
    mockSearch({ data: [{ ...person, id: 'p2', name: 'Bianca' }] });
    await renderSheet();
    await type('Buscar pessoas', 'bi');

    expect(screen.queryByText('Sugestões')).not.toBeOnTheScreen();
    expect(screen.getByText('Bianca')).toBeOnTheScreen();
    expect(screen.queryByText('Bia Rocha')).not.toBeOnTheScreen();
  });

  it('dims people who do not take my messages, with the reason, and does not start with them', async () => {
    mockSearch({ data: [{ ...person, canMessage: false }] });
    await renderSheet();
    await type('Buscar pessoas', 'bi');

    const row = screen.getByRole('button', { name: 'Bia Rocha, Não aceita mensagens suas' });
    expect(row).toBeDisabled();
    expect(row).toHaveStyle({ opacity: 0.5 });
    expect(screen.getByText('Não aceita mensagens suas')).toBeOnTheScreen();
    await fireEvent.press(row);
    expect(mockedApi.create).not.toHaveBeenCalled();
  });

  it('reads the profiles of the suggestions to dim people who do not take my messages', async () => {
    client.setQueryData(conversationsKey, [withAna]);
    mockedApi.list.mockResolvedValue([withAna]);
    mockFollowing([bia]);
    jest.mocked(profilesApi.get).mockImplementation(
      async (id: string) => ({ id, canMessage: id !== 'p1', isBlockedByMe: false, blocksMe: false }) as UserProfile,
    );
    await renderSheet();

    const row = await screen.findByRole('button', { name: 'Bia Rocha, Não aceita mensagens suas' });
    expect(row).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Conversar com Ana Souza' })).toBeEnabled();
    expect(profilesApi.get).toHaveBeenCalledWith('u1');
    expect(profilesApi.get).toHaveBeenCalledWith('p1');
  });

  it('does not read profiles for search results, which say it already', async () => {
    mockSearch({ data: [{ ...person, id: 'p2', name: 'Bianca' }] });
    await renderSheet();
    jest.mocked(profilesApi.get).mockClear();
    await type('Buscar pessoas', 'bi');

    expect(screen.getByText('Bianca')).toBeOnTheScreen();
    expect(profilesApi.get).not.toHaveBeenCalled();
  });

  it('marks a blocked person in the suggestions', async () => {
    client.setQueryData(conversationsKey, [withAna]);
    mockedApi.list.mockResolvedValue([withAna]);
    client.setQueryData(['profile', 'u1'], { isBlockedByMe: true } as UserProfile);
    await renderSheet();

    expect(screen.getByRole('button', { name: 'Ana Souza, Bloqueado' })).toBeDisabled();
    expect(screen.getByText('Bloqueado')).toBeOnTheScreen();
  });

  it('colours the search icon while the field has focus and clears the search', async () => {
    await renderSheet();
    const field = screen.getByLabelText('Buscar pessoas');
    expect(screen.getByTestId('search-icon')).toHaveStyle({ color: colors.textMedium });

    await fireEvent(field, 'focus');
    expect(screen.getByTestId('search-icon')).toHaveStyle({ color: colors.primary });

    expect(screen.queryByRole('button', { name: 'Limpar busca' })).not.toBeOnTheScreen();
    await type('Buscar pessoas', 'bi');
    await fireEvent.press(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByLabelText('Buscar pessoas').props.value).toBe('');
  });
});
