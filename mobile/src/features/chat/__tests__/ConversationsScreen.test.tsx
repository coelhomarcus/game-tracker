import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { usePeopleSearch } from '@/features/profiles/queries';
import type { PersonResult } from '@/features/profiles/types';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { chatApi } from '../api';
import ConversationsScreen from '../ConversationsScreen';
import { messagesTabLabel, NewConversationButton, useUnreadConversationCount } from '../MessagesTab';
import { NewConversationSheet } from '../NewConversationSheet';
import { openNewConversationSheet, useNewConversationSheet } from '../sheetStore';
import type { Conversation, Message } from '../types';

const mockPush = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => mockNavigation,
}));

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

jest.mock('@/features/chat/api', () => ({
  chatApi: { list: jest.fn(), create: jest.fn(), messages: jest.fn(), markRead: jest.fn() },
}));

jest.mock('@/features/profiles/queries', () => ({
  usePeopleSearch: jest.fn(),
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
        <ConversationsScreen />
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
  jest.mocked(showToast).mockReset();
  mockSearch();
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
  it('shows skeleton rows while the first load is pending', async () => {
    mockedApi.list.mockReturnValue(new Promise(() => undefined));
    await renderScreen();

    expect(screen.getAllByTestId('conversation-skeleton-row').length).toBeGreaterThan(0);
  });

  it('lists the conversations with previews, times and the unread label', async () => {
    await renderWithList([withAna, withJoao, withCarla, orphan]);

    expect(
      screen.getByRole('button', { name: 'Ana Souza, Não lida, Bora jogar?, há 5 min' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'João Lima, Você: Fechado, há 2 h' }),
    ).toBeOnTheScreen();
    // A blank name falls back to the username; no message has no time.
    expect(screen.getByRole('button', { name: 'carla, Nenhuma mensagem' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Conversa, Oi, há 1 min' })).toBeOnTheScreen();
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
    expect(screen.getByText('Converse com quem você encontrar na comunidade.')).toBeOnTheScreen();
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
