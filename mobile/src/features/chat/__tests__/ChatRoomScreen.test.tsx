import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { getAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient, useSession, type User } from '@/features/auth';
import { ApiError } from '@/lib/http/errors';
import { useSetModeration } from '@/features/profiles/queries';
import { useChatConnection } from '@/lib/realtime/connectionStore';
import { colors } from '@/theme/tokens';
import { chatSocket } from '@/test-utils/fakeChatSocket';

import { chatApi } from '../api';
import { useChatStore } from '../chatStore';
import { ChatRoomScreen } from '../ChatRoomScreen';
import { CLUSTER_GAP, GROUP_GAP } from '../MessageBubble';
import { conversationsKey } from '../queries';
import { realtimeBridge } from '../realtimeBridge';
import type { Conversation, Message, MessagePage } from '../types';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@/features/chat/api', () => ({
  chatApi: {
    list: jest.fn(),
    create: jest.fn(),
    messages: jest.fn(),
    markRead: jest.fn(),
    setMuted: jest.fn(),
    leave: jest.fn(),
  },
}));
jest.mock('@/features/profiles/queries', () => ({
  ...jest.requireActual('@/features/profiles/queries'),
  useSetModeration: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
const mockBlock = jest.fn();

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
      Screen: ({
        options,
      }: {
        options?: { title?: string; headerTitle?: unknown; headerRight?: unknown };
      }) => {
        const { Text, View } = jest.requireActual('react-native');
        if (options && mockHeaderOptions.at(-1) !== options) mockHeaderOptions.push(options);
        const Title = options?.headerTitle as ComponentType<{ children: string }> | undefined;
        const Right = options?.headerRight as ComponentType<{ canGoBack: boolean }> | undefined;
        return (
          <View testID="header">
            {Title ? <Title>{options?.title ?? ''}</Title> : null}
            {options?.title ? <Text testID="header-title">{options.title}</Text> : null}
            {Right ? <Right canGoBack /> : null}
          </View>
        );
      },
    },
  };
});

const mocked = jest.mocked(chatApi);

let metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};
const NO_INSETS = metrics;

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

const RETRY_LINE = 'Não enviada. Toque para tentar de novo';

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
  mocked.setMuted.mockReset().mockResolvedValue(undefined);
  mocked.leave.mockReset().mockResolvedValue(undefined);
  mockBlock.mockReset();
  jest.mocked(useSetModeration).mockReturnValue({ mutate: mockBlock } as unknown as ReturnType<
    typeof useSetModeration
  >);
  metrics = NO_INSETS;
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
    expect(title).toHaveTextContent(/@ana/);
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

describe('ChatRoomScreen: header menu', () => {
  const option = (name: string) => screen.getByRole('button', { name });

  async function openMenu() {
    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
  }

  it('offers the profile, mute, block and leave, without mark-read', async () => {
    queryClient.setQueryData(conversationsKey, [withAna]);
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();

    for (const name of ['Ver perfil', 'Silenciar conversa', 'Bloquear @ana', 'Sair da conversa']) {
      expect(option(name)).toBeOnTheScreen();
    }
    // The open room is read already.
    expect(screen.queryByRole('button', { name: 'Marcar como lida' })).not.toBeOnTheScreen();
    // A real 48 dp target.
    expect(screen.getByRole('button', { name: 'Mais opções' })).toHaveStyle({ minHeight: 48, minWidth: 48 });
  });

  it('opens the profile', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();
    await fireEvent.press(option('Ver perfil'));

    expect(mockRouter.push).toHaveBeenCalledWith('/users/u1');
  });

  it('mutes, then offers to unmute', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();
    await fireEvent.press(option('Silenciar conversa'));

    expect(mocked.setMuted).toHaveBeenCalledWith(CONV, true);
    await openMenu();
    expect(option('Reativar conversa')).toBeOnTheScreen();
    await fireEvent.press(option('Reativar conversa'));
    expect(mocked.setMuted).toHaveBeenLastCalledWith(CONV, false);
  });

  it('blocks the person after the confirmation', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();
    await fireEvent.press(option('Bloquear @ana'));

    expect(screen.getByText('Bloquear @ana?')).toBeOnTheScreen();
    expect(mockBlock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Bloquear' }));
    expect(mockBlock).toHaveBeenCalledWith({ person: ana, on: true });
  });

  it('leaves only after the confirmation, going back to the list first', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();
    await fireEvent.press(option('Sair da conversa'));

    expect(screen.getByText('Sair da conversa?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));
    expect(mocked.leave).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();

    await openMenu();
    await fireEvent.press(option('Sair da conversa'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));
    expect(mockRouter.back).toHaveBeenCalled();
    expect(mocked.leave).toHaveBeenCalledWith(CONV);
    expect(mockRouter.back.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.leave.mock.invocationCallOrder[0],
    );
    expect(queryClient.getQueryData<Conversation[]>(conversationsKey)).toEqual([]);
    // The room is still on screen while the stack pops it: the header keeps the person and "…".
    expect(screen.getByRole('button', { name: 'Perfil de Ana Souza' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mais opções' })).toBeOnTheScreen();
  });

  it('goes to the list when there is nothing to go back to', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await openMenu();
    await fireEvent.press(option('Sair da conversa'));
    await fireEvent.press(screen.getByRole('button', { name: 'Sair' }));

    expect(mockRouter.replace).toHaveBeenCalledWith('/messages');
    expect(mocked.leave).toHaveBeenCalledWith(CONV);
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

  it('puts a date divider above the oldest message and after every pause of over an hour', async () => {
    await renderLoaded([
      message('m6', 'u1', 'Hoje tarde', today(23, 59)),
      message('m5', 'u1', 'Hoje cedo', today(0, 1)),
      message('m4', 'u1', 'Ontem à noite', yesterday(22, 0)),
      message('m3', 'u1', 'Ontem logo depois', yesterday(21, 0)),
      message('m2', 'u1', 'Ontem cedo', yesterday(8, 0)),
      message('m1', 'u1', 'Faz tempo', new Date(2020, 0, 15, 10, 30)),
    ]);

    expect(screen.getByText('Hoje às 23:59')).toBeOnTheScreen();
    expect(screen.getByText('Ontem às 21:00')).toBeOnTheScreen();
    // Inverted list data, newest first: a divider follows the message it shows above on screen.
    // 21:00 → 22:00 is exactly an hour, so no divider between them.
    type Item = { kind: 'divider'; label: string } | { kind: 'message'; message: { content: string } };
    const data = screen.getByTestId('message-list').props.data as Item[];
    expect(
      data.map((item) => (item.kind === 'divider' ? `[${item.label}]` : item.message.content)),
    ).toEqual([
      'Hoje tarde',
      '[Hoje às 23:59]',
      'Hoje cedo',
      '[Hoje às 00:01]',
      'Ontem à noite',
      'Ontem logo depois',
      '[Ontem às 21:00]',
      'Ontem cedo',
      '[Ontem às 08:00]',
      'Faz tempo',
      '[15 de jan de 2020 às 10:30]',
    ]);
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

    expect(screen.getByText(RETRY_LINE)).toBeOnTheScreen();
    // The failure replaces the time line, and the retry is a real 48 dp target.
    const retryLine = screen.getByRole('button', { name: RETRY_LINE });
    expect(retryLine).toHaveStyle({ minHeight: 48 });
    expect(screen.getByRole('button', { name: 'Descartar' })).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(retryLine);
    expect(screen.getByText('Enviando…')).toBeOnTheScreen();
    expect(screen.queryByText(RETRY_LINE)).not.toBeOnTheScreen();
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

    expect(
      screen.getByText('Não enviada. Não é possível enviar mensagens para esta conta.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Bloqueio/)).toBeNull();

    await type('Outra');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'nope' }));

    expect(screen.getByText(RETRY_LINE)).toBeOnTheScreen();
    expect(
      screen.getByText('Não enviada. Não é possível enviar mensagens para esta conta.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/nope/)).toBeNull();
  });

  it.each([
    ['blocked', 'Não é possível enviar mensagens para esta conta.'],
    ['dm_not_allowed', 'Esta pessoa não aceita mensagens suas.'],
  ])('offers no retry for a message refused with %s, only the reason and Descartar', async (code, reason) => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await type('Recusada');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));
    await act(async () => chatSocket.pendingAck('message:send')?.resolve({ error: 'x', code }));

    expect(screen.getByText(`Não enviada. ${reason}`)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: RETRY_LINE })).toBeNull();
    expect(screen.queryByText(RETRY_LINE)).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeOnTheScreen();
  });
});

describe('ChatRoomScreen: grouped bubbles', () => {
  const bubbles = () => screen.getAllByTestId('message-bubble');
  const rows = () => screen.getAllByTestId('message-row');

  it('joins one sender under 5 minutes into a group, squared on their side where bubbles meet', async () => {
    await renderLoaded([
      message('m3', 'u1', 'Terceira', today(9, 9)),
      message('m2', 'u1', 'Segunda', today(9, 7)),
      message('m1', 'u1', 'Primeira', today(9, 5)),
    ]);

    // Newest first, as the inverted list renders them: bottom of the group first.
    const [last, middle, first] = bubbles().map((bubble) => StyleSheet.flatten(bubble.props.style));
    expect(last).toMatchObject({ borderRadius: 20, borderTopLeftRadius: 4, borderBottomLeftRadius: 20 });
    expect(middle).toMatchObject({ borderTopLeftRadius: 4, borderBottomLeftRadius: 4 });
    expect(first).toMatchObject({ borderTopLeftRadius: 20, borderBottomLeftRadius: 4 });
    for (const style of [last, middle, first]) {
      expect(style).toMatchObject({
        maxWidth: '85%',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.bgContrast50,
      });
      expect(style.borderTopRightRadius).toBeUndefined();
    }
    // 2 dp between bubbles of the group, 12 above it.
    expect(rows().map((row) => StyleSheet.flatten(row.props.style).paddingTop)).toEqual([
      CLUSTER_GAP,
      CLUSTER_GAP,
      GROUP_GAP,
    ]);
    expect([CLUSTER_GAP, GROUP_GAP]).toEqual([2, 12]);
    // The time shows once, under the newest bubble.
    expect(screen.getByText('09:09')).toBeOnTheScreen();
    expect(screen.queryByText('09:07')).not.toBeOnTheScreen();
    expect(screen.queryByText('09:05')).not.toBeOnTheScreen();
  });

  it('squares my bubbles on the right, in primary, with Enviada under the group', async () => {
    await renderLoaded([
      message('m2', 'me', 'Fechado', today(9, 6)),
      message('m1', 'me', 'Bora', today(9, 5)),
      message('m0', 'u1', 'Jogo hoje?', today(9, 4)),
    ]);

    const [last, first, theirs] = bubbles().map((bubble) => StyleSheet.flatten(bubble.props.style));
    expect(last).toMatchObject({ borderTopRightRadius: 4, borderBottomRightRadius: 20, backgroundColor: colors.primary });
    expect(first).toMatchObject({ borderTopRightRadius: 20, borderBottomRightRadius: 4, backgroundColor: colors.primary });
    expect(last.borderTopLeftRadius).toBeUndefined();
    // A sender change starts a new group, however close in time.
    expect(theirs).toMatchObject({ borderTopLeftRadius: 20, borderBottomLeftRadius: 20 });
    expect(rows().map((row) => StyleSheet.flatten(row.props.style).paddingTop)).toEqual([2, 12, 12]);
    expect(screen.getByText('Fechado')).toHaveStyle({ color: colors.onPrimary });
    expect(screen.getByText('Jogo hoje?')).toHaveStyle({ color: colors.text });
    expect(screen.getAllByText('Enviada')).toHaveLength(1);
    expect(screen.getByText('09:06')).toBeOnTheScreen();
    expect(screen.getByText('09:04')).toBeOnTheScreen();
  });

  it('shows a pending bubble in primary at 60%, joined to my group', async () => {
    await renderLoaded([message('m1', 'me', 'Oi', new Date(Date.now() - 60_000))]);
    await type('Tudo bem?');
    await fireEvent.press(screen.getByRole('button', { name: 'Enviar mensagem' }));

    const [pending, sent] = bubbles().map((bubble) => StyleSheet.flatten(bubble.props.style));
    expect(pending.backgroundColor).toBe(colors.primaryPending);
    expect(colors.primaryPending).toBe(`${colors.primary}99`);
    expect(sent.backgroundColor).toBe(colors.primary);
    expect(pending).toMatchObject({ borderTopRightRadius: 4 });
    expect(screen.getByText('Enviando…')).toBeOnTheScreen();
    expect(screen.queryByText('Enviada')).not.toBeOnTheScreen();
  });

  it('shows 1 to 3 emoji large and without a bubble', async () => {
    await renderLoaded([
      message('m2', 'u1', '🎮🔥', today(9, 6)),
      message('m1', 'u1', 'Olha 🎮', today(9, 5)),
    ]);

    const emoji = screen.getByTestId('message-emoji');
    expect(emoji).toHaveTextContent('🎮🔥');
    expect(emoji).toHaveStyle({ fontSize: 45 });
    expect(emoji.props.accessibilityLabel).toBe('Ana Souza: 🎮🔥, 09:06');
    // Text with an emoji keeps its bubble.
    expect(bubbles()).toHaveLength(1);
    expect(screen.getByText('Olha 🎮')).toBeOnTheScreen();
  });
});

describe('ChatRoomScreen: keyboard', () => {
  const withInset = {
    frame: { x: 0, y: 0, width: 390, height: 800 },
    insets: { top: 24, left: 0, right: 0, bottom: 34 },
  };

  it('pins the composer to the keyboard, above the bottom inset while it is closed', async () => {
    metrics = withInset;
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    // Closed: the screen pads the inset under it. Open: it rides on the keyboard, which covers
    // that inset too, so it moves by the keyboard's height less the inset.
    expect(screen.getByTestId('composer-sticky').props.offset).toEqual({ closed: 0, opened: 34 });
    expect(screen.getByTestId('composer-sticky')).toContainElement(screen.getByLabelText('Mensagem'));
  });

  it('lifts the inverted list with the keyboard by as much as the composer rises', async () => {
    metrics = withInset;
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    const list = screen.getByTestId('message-list');
    expect(list.props.inverted).toBe(true);
    expect(list.props.offset).toBe(34);
    expect(list.props.keyboardLiftBehavior).toBe('always');
  });

  it('moves the new messages pill with the composer', async () => {
    metrics = withInset;
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await fireEvent.scroll(screen.getByTestId('message-list'), scrollEvent(600));
    await act(async () => chatSocket.fire('message:receive', payload('m2', 'u1', 'Chegou')));

    const sticky = await screen.findByTestId('new-messages-sticky');
    expect(sticky.props.offset).toEqual({ closed: 0, opened: 34 });
    expect(sticky).toContainElement(screen.getByRole('button', { name: 'Novas mensagens' }));
  });

  it('reports every scroll frame, so the keyboard lift never works from a stale offset', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    expect(screen.getByTestId('message-list').props.scrollEventThrottle).toBeLessThanOrEqual(16);
  });

  it('draws the fade above the connection banner, not over it', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => useChatConnection.setState({ status: 'connecting', attempt: 0 }));

    const sticky = screen.getByTestId('composer-sticky');
    const fade = screen.getByTestId('composer-fade');
    expect(fade.parent).toBe(sticky);
    expect(fade).toHaveStyle({ position: 'absolute', bottom: '100%', height: 12 });
    expect(fade.props.pointerEvents).toBe('none');
    // First in the sticky footer, which the banner and then the composer fill.
    const children = sticky.children.filter((child) => typeof child !== 'string');
    expect(children[0]).toBe(fade);
    expect(screen.getByText('Conectando…')).toBeOnTheScreen();
  });

  describe('states without a list', () => {
    const keyboard = useReanimatedKeyboardAnimation();
    // The types describe the web stub, which takes no argument; jest runs the native helper.
    const readAnimatedStyle = getAnimatedStyle as unknown as (element: unknown) => {
      paddingBottom?: number;
    };

    afterEach(() => {
      keyboard.height.value = 0;
      keyboard.progress.value = 0;
    });

    it('keeps the empty conversation above the composer when the keyboard opens', async () => {
      metrics = withInset;
      keyboard.height.value = -300;
      keyboard.progress.value = 1;
      await renderLoaded([]);

      const area = screen.getByTestId('chat-state-area');
      expect(area).toContainElement(screen.getByTestId('chat-empty'));
      // The composer rises by 300 − 34; the state area gives up as much room.
      expect(readAnimatedStyle(area).paddingBottom).toBe(266);
    });

    it('takes the full height while the keyboard is closed', async () => {
      metrics = withInset;
      await renderLoaded([]);

      expect(readAnimatedStyle(screen.getByTestId('chat-state-area')).paddingBottom).toBe(0);
    });

    it('keeps loading and the load error above the composer too', async () => {
      keyboard.height.value = -300;
      keyboard.progress.value = 1;
      let fail: (error: Error) => void = () => undefined;
      mocked.messages.mockReturnValueOnce(new Promise<MessagePage>((_, reject) => (fail = reject)));
      queryClient.setQueryData(conversationsKey, [withAna]);
      await renderRoom();

      expect(screen.getByTestId('chat-state-area')).toContainElement(screen.getByLabelText('Carregando'));
      expect(readAnimatedStyle(screen.getByTestId('chat-state-area')).paddingBottom).toBe(300);
      await act(async () => fail(new ApiError(500, 'server_error', 'Erro')));
      expect(screen.getByTestId('chat-state-area')).toContainElement(
        await screen.findByText('Não foi possível carregar as mensagens'),
      );
    });
  });

  it('uses no offset without a bottom inset', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    expect(screen.getByTestId('composer-sticky').props.offset).toEqual({ closed: 0, opened: 0 });
    expect(screen.getByTestId('message-list').props.offset).toBe(0);
  });
});

describe('ChatRoomScreen: composer', () => {
  it('sends only non-blank text, up to 2000 characters, and keeps the draft', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    const field = screen.getByLabelText('Mensagem');
    expect(field.props.placeholder).toBe('Escreva uma mensagem');
    expect(field.props.maxLength).toBe(2000);
    expect(field.props.multiline).toBe(true);
    // Grows up to 12 lines of 20 (15 at 1.3), then scrolls.
    expect(field).toHaveStyle({ maxHeight: 240, lineHeight: 20 });
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
    expect(screen.getByTestId('send-circle')).toHaveStyle({ backgroundColor: colors.controlDisabled });

    await type('   ');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();

    await type('Rascunho');
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeEnabled();
    expect(screen.getByTestId('send-circle')).toHaveStyle({
      backgroundColor: colors.primary,
      width: 40,
      height: 40,
    });
    // A real 48 dp target around the 40 dp circle.
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toHaveStyle({ width: 48, height: 48 });
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
    // Reanimated tears the send button's animated style down on a 0 ms frame; run only what is due.
    await act(async () => jest.advanceTimersByTime(0));
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
    expect(screen.getByText(RETRY_LINE)).toBeOnTheScreen();

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
