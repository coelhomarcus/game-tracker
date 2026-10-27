import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { FlatList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient, useSession, type User } from '@/features/auth';
import { ApiError } from '@/lib/http/errors';
import { useChatConnection } from '@/lib/realtime/connectionStore';
import { chatSocket } from '@/test-utils/fakeChatSocket';

import { chatApi } from '../api';
import { useChatStore } from '../chatStore';
import { ChatRoomScreen } from '../ChatRoomScreen';
import { conversationsKey } from '../queries';
import { realtimeBridge } from '../realtimeBridge';
import type { Conversation, Message, MessagePage } from '../types';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@/features/chat/api', () => ({
  chatApi: { list: jest.fn(), create: jest.fn(), messages: jest.fn(), markRead: jest.fn() },
}));

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn() };
let mockParams: Record<string, string | string[]> = {};
/** Every options object the screen handed to the header, in order. */
const mockHeaderOptions: Record<string, unknown>[] = [];
/** Whether the screen is focused (another screen pushed on top blurs it). */
const mockFocus = {
  focused: true,
  listeners: new Set<() => void>(),
  set(focused: boolean) {
    mockFocus.focused = focused;
    for (const listener of [...mockFocus.listeners]) listener();
  },
};
jest.mock('expo-router', () => {
  const { useEffect, useSyncExternalStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockFocus.listeners.add(listener);
    return () => mockFocus.listeners.delete(listener);
  };
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    // Mounted and focused runs the effect; blurring or unmounting runs its cleanup.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = useSyncExternalStore(subscribe, () => mockFocus.focused);
      useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
    // The header is rendered in place so the tests can read and press it.
    Stack: {
      Screen: ({ options }: { options?: { title?: string; headerTitle?: unknown } }) => {
        const { Text, View } = jest.requireActual('react-native');
        if (options && mockHeaderOptions.at(-1) !== options) mockHeaderOptions.push(options);
        const Title = options?.headerTitle as ComponentType<{ children: string }> | undefined;
        return (
          <View testID="header">
            {Title ? <Title>{options?.title ?? ''}</Title> : null}
            {options?.title ? <Text testID="header-title">{options.title}</Text> : null}
          </View>
        );
      },
    },
  };
});

const mocked = jest.mocked(chatApi);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const CONV = '6b0f6c8e-1d2a-4c3b-9e4f-5a6b7c8d9e0f';
const me: User = {
  id: 'me',
  username: 'eu',
  name: 'Eu',
  email: 'eu@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  dmPolicy: 'everyone',
};
const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };

const withAna: Conversation = { id: CONV, otherUser: ana, lastMessage: null, unread: true, muted: false };

const now = new Date();
function today(hours: number, minutes: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
}
function yesterday(hours: number, minutes: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, hours, minutes);
}

function message(
  id: string,
  senderId: string,
  content: string,
  createdAt: Date,
  overrides: Partial<Message> = {},
): Message {
  return {
    id,
    conversationId: CONV,
    senderId,
    content,
    createdAt,
    clientMessageId: null,
    sender: senderId === 'u1' ? ana : { id: senderId, username: 'eu', name: 'Eu', avatarUrl: null },
    reactions: [],
    ...overrides,
  };
}

function page(items: Message[], nextCursor: string | null = null): MessagePage {
  return { items, nextCursor };
}

let payloadSeconds = 0;

/**
 * A server payload, as `message:receive` and send acks carry it. Each one is stamped a second after
 * the previous, late in the fixtures' day, so it is always newer than the fixtures and than the
 * payloads before it, whatever time the suite runs at.
 */
function payload(id: string, senderId: string, content: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversationId: CONV,
    senderId,
    content,
    createdAt: new Date(today(23, 0).getTime() + ++payloadSeconds * 1000).toISOString(),
    clientMessageId: null,
    sender: senderId === 'u1' ? ana : { id: senderId, username: 'eu', name: 'Eu', avatarUrl: null },
    ...extra,
  };
}

function scrollEvent(y: number) {
  return {
    nativeEvent: {
      contentOffset: { x: 0, y },
      contentSize: { width: 390, height: 3000 },
      layoutMeasurement: { width: 390, height: 600 },
    },
  };
}

function ui() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={metrics}>
        <ChatRoomScreen />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

async function renderRoom(id: string = CONV) {
  mockParams = { conversationId: id };
  await render(ui());
}

/** Renders with the list cached and the given history loaded (the server keeps answering it). */
async function renderLoaded(items: Message[], nextCursor: string | null = null) {
  queryClient.setQueryData(conversationsKey, [withAna]);
  mocked.messages.mockResolvedValue(page(items, nextCursor));
  await renderRoom();
  await screen.findByTestId(items.length > 0 ? 'message-list' : 'chat-empty');
}

async function answerJoin() {
  await act(async () => chatSocket.pendingAck('conversation:join')?.resolve({ ok: true }));
}

/** Waits for the bridge's catch-up after a join: its refetch, the read mark, and the render. */
async function caughtUp(reads = 1) {
  await waitFor(() => expect(mocked.markRead).toHaveBeenCalledTimes(reads));
  await act(() => new Promise<void>((done) => setTimeout(done, 0)));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

const typingEvents = () =>
  chatSocket.emitted.filter((entry) => entry.event.startsWith('typing:')).map((entry) => entry.event);

async function type(text: string) {
  await fireEvent.changeText(screen.getByLabelText('Mensagem'), text);
}

beforeAll(() => {
  queryClient.setDefaultOptions({
    queries: { retry: false, gcTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  });
});

beforeEach(() => {
  mockParams = {};
  mockFocus.focused = true;
  mockRouter.push.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.canGoBack.mockReset().mockReturnValue(true);
  mocked.list.mockReset().mockResolvedValue([withAna]);
  mocked.messages.mockReset().mockResolvedValue(page([]));
  mocked.markRead.mockReset().mockResolvedValue(undefined);
  mocked.create.mockReset();
  useSession.setState({ status: 'signedIn', user: me });
  realtimeBridge.start();
  chatSocket.connect();
});

afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
  jest.restoreAllMocks();
  mockHeaderOptions.length = 0;
  realtimeBridge.stop();
  chatSocket.reset();
  useChatStore.getState().clear();
  useChatConnection.setState({ status: 'stopped', attempt: 0 });
  queryClient.clear();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ChatRoomScreen: opening and leaving', () => {
  it('opens the conversation, joins, asks for presence, refreshes and marks it read', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    expect(useChatStore.getState().openConversationId).toBe(CONV);
    expect(chatSocket.ackLog).toContainEqual({
      event: 'conversation:join',
      payload: { conversationId: CONV },
    });
    // Read only once the room is joined and its messages are fresh.
    expect(mocked.markRead).not.toHaveBeenCalled();
    await answerJoin();
    expect(chatSocket.ackLog).toContainEqual({
      event: 'presence:get',
      payload: { conversationId: CONV },
    });
    await caughtUp();
    expect(mocked.markRead).toHaveBeenCalledWith(CONV);
    expect(mocked.messages).toHaveBeenCalledTimes(2);
    expect(mocked.markRead.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocked.messages.mock.invocationCallOrder[1],
    );
    // The cached list is used as is: no refetch that could bring the unread flag back.
    expect(mocked.list).not.toHaveBeenCalled();
    const list = queryClient.getQueryData<Conversation[]>(conversationsKey);
    expect(list?.find((item) => item.id === CONV)?.unread).toBe(false);
  });

  it('opens the room only once the first page has loaded', async () => {
    let release: (value: MessagePage) => void = () => undefined;
    mocked.messages.mockReturnValueOnce(new Promise<MessagePage>((done) => (release = done)));
    queryClient.setQueryData(conversationsKey, [withAna]);
    await renderRoom();

    expect(useChatStore.getState().openConversationId).toBeNull();
    expect(chatSocket.ackLog).toEqual([]);
    expect(mocked.markRead).not.toHaveBeenCalled();

    await act(async () => release(page([message('m1', 'u1', 'Oi', today(9, 5))])));
    await screen.findByTestId('message-list');
    await waitFor(() => expect(useChatStore.getState().openConversationId).toBe(CONV));
    expect(chatSocket.ackLog).toContainEqual({
      event: 'conversation:join',
      payload: { conversationId: CONV },
    });
    await answerJoin();
    await caughtUp();
    expect(mocked.markRead).toHaveBeenCalledWith(CONV);
  });

  it('catches up after coming back: fetches what arrived, then marks it read', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await answerJoin();
    await caughtUp();

    // The profile opened on top: the room is left, so its messages stop arriving.
    await act(async () => mockFocus.set(false));
    expect(chatSocket.emitted).toContainEqual({
      event: 'conversation:leave',
      payload: { conversationId: CONV },
    });
    expect(useChatStore.getState().openConversationId).toBeNull();
    // Sent while away: only the server has it.
    const refetch = deferred<MessagePage>();
    mocked.messages.mockReturnValueOnce(refetch.promise);

    await act(async () => mockFocus.set(true));
    expect(useChatStore.getState().openConversationId).toBe(CONV);
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
    await answerJoin();
    expect(mocked.messages).toHaveBeenCalledTimes(3);
    expect(mocked.markRead).toHaveBeenCalledTimes(1);

    await act(async () =>
      refetch.resolve(
        page([
          message('m2', 'u1', 'Enquanto isso', today(9, 7)),
          message('m1', 'u1', 'Oi', today(9, 5)),
        ]),
      ),
    );
    expect(await screen.findByText('Enquanto isso')).toBeOnTheScreen();
    await caughtUp(2);
    expect(mocked.markRead.mock.invocationCallOrder[1]).toBeGreaterThan(
      mocked.messages.mock.invocationCallOrder[2],
    );
  });

  it('does not set the header again while scrolling or when messages arrive', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    const before = mockHeaderOptions.length;
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(0));
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'u1', 'Chegou')));
    await screen.findByText('Chegou');

    expect(mockHeaderOptions).toHaveLength(before);
  });

  it('leaves the room and clears the open conversation when it closes', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await screen.unmount();

    expect(chatSocket.emitted).toContainEqual({
      event: 'conversation:leave',
      payload: { conversationId: CONV },
    });
    expect(useChatStore.getState().openConversationId).toBeNull();
  });

  it('does not clear another conversation that opened meanwhile', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => useChatStore.getState().setOpenConversation('other'));
    await screen.unmount();

    expect(useChatStore.getState().openConversationId).toBe('other');
  });
});

describe('ChatRoomScreen: header', () => {
  it('shows the other person and opens their profile', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    const title = screen.getByRole('button', { name: 'Perfil de Ana Souza' });
    expect(title).toHaveTextContent(/Ana Souza/);
    // A real 48 dp target: hitSlop past the header column would be lost on Android.
    expect(title).toHaveStyle({ minHeight: 48 });
    expect(title.props.hitSlop).toBeUndefined();
    await fireEvent.press(title);
    expect(mockRouter.push).toHaveBeenCalledWith('/users/u1');
  });

  it('shows online from presence and typing over it', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await answerJoin();
    await act(async () => chatSocket.pendingAck('presence:get')?.resolve({ online: ['u1'] }));
    await caughtUp();

    expect(screen.getByRole('button', { name: 'Perfil de Ana Souza, online' })).toBeOnTheScreen();
    expect(screen.getByText('online')).toBeOnTheScreen();

    await act(async () => chatSocket.fire('typing:start', { conversationId: CONV, userId: 'u1' }));
    expect(
      screen.getByRole('button', { name: 'Perfil de Ana Souza, digitando…' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('digitando…')).toBeOnTheScreen();

    await act(async () => chatSocket.fire('typing:stop', { conversationId: CONV, userId: 'u1' }));
    expect(screen.getByRole('button', { name: 'Perfil de Ana Souza, online' })).toBeOnTheScreen();
  });

  it('loads the conversation from the list when it is not cached', async () => {
    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u1', 'Oi', today(9, 5))]));
    await renderRoom();

    expect(await screen.findByRole('button', { name: 'Perfil de Ana Souza' })).toBeOnTheScreen();
    expect(mocked.list).toHaveBeenCalled();
  });

  it('shows Conversa when the other person is missing', async () => {
    mocked.list.mockResolvedValue([{ ...withAna, otherUser: null }]);
    queryClient.setQueryData(conversationsKey, [{ ...withAna, otherUser: null }]);
    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u9', 'Oi', today(9, 5))]));
    await renderRoom();
    await screen.findByTestId('message-list');

    expect(screen.getByTestId('header')).toHaveTextContent(/Conversa/);
    expect(screen.queryByRole('button', { name: /^Perfil de/ })).not.toBeOnTheScreen();
  });
});

describe('ChatRoomScreen: not found', () => {
  it('treats an id that is not a UUID as not found without any request', async () => {
    await renderRoom('abc');

    expect(screen.getByText('Conversa não encontrada')).toBeOnTheScreen();
    expect(mocked.messages).not.toHaveBeenCalled();
    expect(mocked.markRead).not.toHaveBeenCalled();
    expect(chatSocket.ackLog).toEqual([]);
    expect(useChatStore.getState().openConversationId).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('treats a 404 from the messages request as not found without opening the room', async () => {
    mocked.messages.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Não encontrada'));
    mockRouter.canGoBack.mockReturnValue(false);
    queryClient.setQueryData(conversationsKey, [withAna]);
    await renderRoom();

    expect(await screen.findByText('Conversa não encontrada')).toBeOnTheScreen();
    expect(useChatStore.getState().openConversationId).toBeNull();
    expect(chatSocket.ackLog).toEqual([]);
    expect(mocked.markRead).not.toHaveBeenCalled();
    // The header loses the room's avatar and name.
    expect(mockHeaderOptions.at(-1)).toEqual({ title: '', headerTitle: '' });
    expect(screen.queryByText('Ana Souza')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/messages');
  });

  it('offers a retry when the first load fails for another reason', async () => {
    mocked.messages
      .mockRejectedValueOnce(new ApiError(500, 'server_error', 'Erro'))
      .mockResolvedValueOnce(page([message('m1', 'u1', 'Voltei', today(9, 5))]));
    await renderRoom();

    expect(await screen.findByText('Não foi possível carregar as mensagens')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Voltei')).toBeOnTheScreen();
  });
});

describe('ChatRoomScreen: history', () => {
  it('loads the next page once when reaching the top, then shows the start', async () => {
    await renderLoaded([message('m2', 'u1', 'Novo', today(9, 6))], 'cursor-1');
    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u1', 'Antigo', today(9, 5))]));

    expect(screen.queryByText('Início da conversa')).not.toBeOnTheScreen();
    const list = screen.getByTestId('message-list');
    await act(async () => {
      list.props.onEndReached();
      list.props.onEndReached();
    });

    expect(await screen.findByText('Antigo')).toBeOnTheScreen();
    expect(screen.getByText('Início da conversa')).toBeOnTheScreen();
    expect(mocked.messages).toHaveBeenCalledTimes(2);
    expect(mocked.messages).toHaveBeenLastCalledWith(CONV, 'cursor-1');

    // Nothing more to load.
    await act(async () => screen.getByTestId('message-list').props.onEndReached());
    expect(mocked.messages).toHaveBeenCalledTimes(2);
  });

  it('shows an older-page error with a retry and does not refetch it on its own', async () => {
    await renderLoaded([message('m2', 'u1', 'Novo', today(9, 6))], 'cursor-1');
    mocked.messages.mockRejectedValueOnce(new Error('boom'));

    await act(async () => screen.getByTestId('message-list').props.onEndReached());
    expect(
      await screen.findByText('Não foi possível carregar mensagens mais antigas.'),
    ).toBeOnTheScreen();
    await act(async () => screen.getByTestId('message-list').props.onEndReached());
    expect(mocked.messages).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Novo')).toBeOnTheScreen();

    let release: (value: MessagePage) => void = () => undefined;
    mocked.messages.mockReturnValueOnce(new Promise<MessagePage>((done) => (release = done)));
    const retryButton = screen.getByRole('button', { name: 'Tentar de novo' });
    await fireEvent.press(retryButton);
    await fireEvent.press(retryButton);
    // The retry in flight shows as loading, not as the old error.
    expect(await screen.findByLabelText('Carregando mensagens')).toBeOnTheScreen();
    expect(
      screen.queryByText('Não foi possível carregar mensagens mais antigas.'),
    ).not.toBeOnTheScreen();

    await act(async () => release(page([message('m1', 'u1', 'Antigo', today(9, 5))])));
    expect(await screen.findByText('Antigo')).toBeOnTheScreen();
    expect(screen.getByText('Início da conversa')).toBeOnTheScreen();
    expect(mocked.messages).toHaveBeenCalledTimes(3);
  });

  it('separates days as Hoje, Ontem and the date, above the oldest message of each day', async () => {
    await renderLoaded([
      message('m5', 'u1', 'Hoje tarde', today(23, 59)),
      message('m4', 'u1', 'Hoje cedo', today(0, 1)),
      message('m3', 'u1', 'Ontem à noite', yesterday(22, 0)),
      message('m2', 'u1', 'Ontem cedo', yesterday(8, 0)),
      message('m1', 'u1', 'Faz tempo', new Date(2020, 0, 15, 10, 30)),
    ]);

    expect(screen.getByText('Hoje')).toBeOnTheScreen();
    expect(screen.getByText('Ontem')).toBeOnTheScreen();
    expect(screen.getByText('15/01/2020')).toBeOnTheScreen();
    // Inverted list data, newest first: a separator follows the oldest message of its day, so it
    // shows above that day on screen.
    type Item = { kind: 'day'; label: string } | { kind: 'message'; row: { content: string } };
    const data = screen.getByTestId('message-list').props.data as Item[];
    expect(data.map((item) => (item.kind === 'day' ? `[${item.label}]` : item.row.content))).toEqual(
      [
        'Hoje tarde',
        'Hoje cedo',
        '[Hoje]',
        'Ontem à noite',
        'Ontem cedo',
        '[Ontem]',
        'Faz tempo',
        '[15/01/2020]',
      ],
    );
  });

  it('shows the empty conversation copy', async () => {
    await renderLoaded([]);

    expect(screen.getByText('Diga oi para Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('As mensagens aparecem aqui.')).toBeOnTheScreen();
  });
});

describe('ChatRoomScreen: bubbles', () => {
  it('labels mine with Você by sender id and others with their name, with the time', async () => {
    await renderLoaded([
      // The sender object never decides the side: only senderId does.
      message('m2', 'me', 'Fechado', today(14, 30), { sender: ana }),
      message('m1', 'u1', 'Bora jogar?', today(9, 5)),
    ]);

    expect(screen.getByLabelText('Você: Fechado, 14:30')).toBeOnTheScreen();
    expect(screen.getByLabelText('Ana Souza: Bora jogar?, 09:05')).toBeOnTheScreen();
    expect(screen.getByText('14:30')).toBeOnTheScreen();
    expect(screen.getByText('09:05')).toBeOnTheScreen();
  });

  it('shows a sent message as sending, then confirmed', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Tudo bem?');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(screen.getByText('Tudo bem?')).toBeOnTheScreen();
    expect(screen.getByText('Enviando…')).toBeOnTheScreen();
    expect(screen.getByLabelText('Mensagem').props.value).toBe('');

    const send = chatSocket.pendingAck('message:send');
    const { clientMessageId } = send?.payload as { clientMessageId: string };
    await act(async () =>
      send?.resolve({ message: payload('m9', 'me', 'Tudo bem?', { clientMessageId }) }),
    );

    expect(screen.getByText('Tudo bem?')).toBeOnTheScreen();
    expect(screen.queryByText('Enviando…')).not.toBeOnTheScreen();
  });

  it('shows Confirmando… when the answer is lost', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Alô');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.drop());

    expect(screen.getByText('Confirmando…')).toBeOnTheScreen();
  });

  it('offers retry and discard on a failed message', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Falhou');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));

    expect(screen.getByText('Não enviada')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByText('Enviando…')).toBeOnTheScreen();
    expect(chatSocket.ackLog.filter((entry) => entry.event === 'message:send')).toHaveLength(2);

    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByText('Falhou')).not.toBeOnTheScreen();
    expect(useChatStore.getState().pending[CONV]).toBeUndefined();
  });

  it('says why a message was refused for good, and shows no reason for other failures', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Bloqueada');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () =>
      chatSocket.pendingAck('message:send')?.resolve({ error: 'Bloqueio', code: 'blocked' }),
    );

    expect(screen.getByText('Não enviada')).toBeOnTheScreen();
    expect(screen.getByText('Não é possível enviar mensagens para esta conta.')).toBeOnTheScreen();
    expect(screen.queryByText('Bloqueio')).toBeNull();

    await type('Outra');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));

    expect(screen.getAllByText('Não enviada')).toHaveLength(2);
    expect(screen.queryByText('nope')).toBeNull();
  });
});

describe('ChatRoomScreen: composer', () => {
  it('sends only non-blank text, up to 2000 characters, and keeps the draft', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    const field = screen.getByLabelText('Mensagem');
    expect(field.props.placeholder).toBe('Mensagem');
    expect(field.props.maxLength).toBe(2000);
    expect(field.props.multiline).toBe(true);
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();

    await type('   ');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();

    await type('Rascunho');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled();
    expect(useChatStore.getState().drafts[CONV]).toBe('Rascunho');

    await screen.unmount();
    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u1', 'Oi', today(9, 5))]));
    await render(ui());
    await screen.findByTestId('message-list');
    expect(screen.getByLabelText('Mensagem').props.value).toBe('Rascunho');
  });

  it('signals typing on the first keystroke and stops after 3 s idle, on send and on leave', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    await type('O');
    await type('Ol');
    expect(typingEvents()).toEqual(['typing:start']);

    await act(async () => jest.advanceTimersByTime(2999));
    await type('Olá');
    await act(async () => jest.advanceTimersByTime(2999));
    expect(typingEvents()).toEqual(['typing:start']);
    await act(async () => jest.advanceTimersByTime(1));
    expect(typingEvents()).toEqual(['typing:start', 'typing:stop']);

    await type('Olá!');
    expect(typingEvents()).toEqual(['typing:start', 'typing:stop', 'typing:start']);
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    expect(typingEvents()).toEqual(['typing:start', 'typing:stop', 'typing:start', 'typing:stop']);

    await type('E aí');
    await screen.unmount();
    expect(typingEvents()).toEqual([
      'typing:start',
      'typing:stop',
      'typing:start',
      'typing:stop',
      'typing:start',
      'typing:stop',
    ]);
    // The stop goes out before the room is left, and no timer survives the screen.
    const events = chatSocket.emitted.map((entry) => entry.event);
    expect(events.lastIndexOf('typing:stop')).toBeLessThan(events.indexOf('conversation:leave'));
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops typing when the field is cleared', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Oi');
    await type('');

    expect(typingEvents()).toEqual(['typing:start', 'typing:stop']);
  });
});

describe('ChatRoomScreen: connection banner', () => {
  it('shows nothing while connected', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    expect(screen.queryByText('Conectando…')).not.toBeOnTheScreen();
    expect(screen.queryByText('Sem conexão. As mensagens saem quando voltar.')).not.toBeOnTheScreen();
  });

  it('shows Conectando… while connecting', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => useChatConnection.setState({ status: 'connecting', attempt: 0 }));

    expect(screen.getByText('Conectando…')).toBeOnTheScreen();
  });

  it('offers to reconnect now while waiting', async () => {
    const reconnect = jest.spyOn(chatSocket, 'reconnectNow');
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => chatSocket.drop());

    expect(screen.getByText('Sem conexão. As mensagens saem quando voltar.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar agora' }));
    expect(reconnect).toHaveBeenCalled();
  });
});

describe('ChatRoomScreen: new messages pill', () => {
  it('appears for a message that arrives while scrolled away, and goes to the newest', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'u1', 'Chegou')));

    expect(await screen.findByText('Chegou')).toBeOnTheScreen();
    const pill = screen.getByRole('button', { name: 'Novas mensagens' });
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent.press(pill);
    expect(scrollTo).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();
  });

  it('does not appear at the bottom, and hides when scrolled back down', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'u1', 'Chegou')));
    expect(await screen.findByText('Chegou')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();

    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await act(async () => chatSocket.fire('message:receive', payload('m3', 'u1', 'Mais uma')));
    expect(await screen.findByRole('button', { name: 'Novas mensagens' })).toBeOnTheScreen();

    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(0));
    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();
  });

  it('does not appear for my own message, which scrolls to the newest', async () => {
    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await type('Minha');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));

    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();
    expect(scrollTo).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('still appears while a failed message of mine sits at the bottom', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Falhou');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));
    expect(screen.getByText('Não enviada')).toBeOnTheScreen();

    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'u1', 'Chegou')));

    expect(await screen.findByText('Chegou')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Novas mensagens' })).toBeOnTheScreen();
  });

  it('does not appear for older pages loaded while scrolled away', async () => {
    await renderLoaded([message('m2', 'me', 'Minha', today(9, 6))], 'cursor-1');
    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u1', 'Antiga', today(9, 5))]));
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await act(async () => screen.getByTestId('message-list').props.onEndReached());

    expect(await screen.findByText('Antiga')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();
  });

  it('does not follow my messages from another device or a discard', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Primeira');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));
    await type('Segunda');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));

    const scrollTo = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    // Discarding the newest reveals the older failed one at the bottom.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Descartar' })[0]);
    expect(screen.queryByText('Segunda')).not.toBeOnTheScreen();
    // Written on another device: no pending copy here.
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'me', 'Do outro')));
    expect(await screen.findByText('Do outro')).toBeOnTheScreen();

    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Novas mensagens' })).not.toBeOnTheScreen();
  });
});
