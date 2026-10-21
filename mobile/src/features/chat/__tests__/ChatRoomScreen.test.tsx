import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
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
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    // Mounted means focused here; unmounting blurs.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    // The header is rendered in place so the tests can read and press it.
    Stack: {
      Screen: ({ options }: { options?: { title?: string; headerTitle?: unknown } }) => {
        const { Text, View } = jest.requireActual('react-native');
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
};
const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };

const withAna: Conversation = { id: CONV, otherUser: ana, lastMessage: null, unread: true };

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
    ...overrides,
  };
}

function page(items: Message[], nextCursor: string | null = null): MessagePage {
  return { items, nextCursor };
}

/** A server payload, as `message:receive` and send acks carry it. */
function payload(id: string, senderId: string, content: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    conversationId: CONV,
    senderId,
    content,
    createdAt: new Date().toISOString(),
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

/** Renders with the list cached and the given history loaded. */
async function renderLoaded(items: Message[], nextCursor: string | null = null) {
  queryClient.setQueryData(conversationsKey, [withAna]);
  mocked.messages.mockResolvedValueOnce(page(items, nextCursor));
  await renderRoom();
  await screen.findByTestId(items.length > 0 ? 'message-list' : 'chat-empty');
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
  realtimeBridge.stop();
  chatSocket.reset();
  useChatStore.getState().clear();
  useChatConnection.setState({ status: 'stopped', attempt: 0 });
  queryClient.clear();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('ChatRoomScreen: opening and leaving', () => {
  it('opens the conversation, joins its room, asks for presence and marks it read', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);

    expect(useChatStore.getState().openConversationId).toBe(CONV);
    expect(chatSocket.ackLog).toContainEqual({
      event: 'conversation:join',
      payload: { conversationId: CONV },
    });
    await act(async () => chatSocket.pendingAck('conversation:join')?.resolve({ ok: true }));
    expect(chatSocket.ackLog).toContainEqual({
      event: 'presence:get',
      payload: { conversationId: CONV },
    });
    expect(mocked.markRead).toHaveBeenCalledWith(CONV);
    // The cached list is used as is: no refetch that could bring the unread flag back.
    expect(mocked.list).not.toHaveBeenCalled();
    const list = queryClient.getQueryData<Conversation[]>(conversationsKey);
    expect(list?.find((item) => item.id === CONV)?.unread).toBe(false);
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
    await fireEvent.press(title);
    expect(mockRouter.push).toHaveBeenCalledWith('/users/u1');
  });

  it('shows online from presence and typing over it', async () => {
    await renderLoaded([message('m1', 'u1', 'Oi', today(9, 5))]);
    await act(async () => chatSocket.pendingAck('conversation:join')?.resolve({ ok: true }));
    await act(async () => chatSocket.pendingAck('presence:get')?.resolve({ online: ['u1'] }));

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

  it('treats a 404 from the messages request as not found and leaves the room', async () => {
    mocked.messages.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Não encontrada'));
    mockRouter.canGoBack.mockReturnValue(false);
    await renderRoom();

    expect(await screen.findByText('Conversa não encontrada')).toBeOnTheScreen();
    expect(useChatStore.getState().openConversationId).toBeNull();
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

    mocked.messages.mockResolvedValueOnce(page([message('m1', 'u1', 'Antigo', today(9, 5))]));
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Antigo')).toBeOnTheScreen();
    expect(screen.getByText('Início da conversa')).toBeOnTheScreen();
  });

  it('separates days as Hoje, Ontem and the date', async () => {
    await renderLoaded([
      message('m3', 'u1', 'Hoje cedo', today(0, 1)),
      message('m2', 'u1', 'Ontem à noite', yesterday(22, 0)),
      message('m1', 'u1', 'Faz tempo', new Date(2020, 0, 15, 10, 30)),
    ]);

    expect(screen.getByText('Hoje')).toBeOnTheScreen();
    expect(screen.getByText('Ontem')).toBeOnTheScreen();
    expect(screen.getByText('15/01/2020')).toBeOnTheScreen();
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
    reconnect.mockRestore();
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
    scrollTo.mockRestore();
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
    scrollTo.mockRestore();
  });
});
