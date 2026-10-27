import { useSession, type User } from '@/features/auth';
import { queryClient } from '@/lib/queryClient';
import { chatSocket } from '@/test-utils/fakeChatSocket';

import { useChatStore } from '../chatStore';
import { addMessagesToCache, conversationsKey, messagesKey, type MessagePages } from '../queries';
import type { Conversation, Message } from '../types';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** What the server answers for a stored message (JSON, as it travels on the socket). */
function serverJson(id: string, clientMessageId: string | null, content = 'oi') {
  return {
    id,
    conversationId: 'c1',
    senderId: 'me',
    content,
    createdAt: '2026-01-01T12:05:00.000Z',
    clientMessageId,
    sender: { id: 'me', username: 'eu', name: 'Eu', avatarUrl: null },
  };
}

function cachedMessage(id: string, minute: number): Message {
  return {
    id,
    conversationId: 'c1',
    senderId: 'u2',
    content: 'antes',
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)),
    clientMessageId: null,
    sender: { id: 'u2', username: 'bia', name: null, avatarUrl: null },
    reactions: [],
  };
}

function seedCache() {
  queryClient.setQueryData<MessagePages>(messagesKey('c1'), {
    pages: [{ items: [cachedMessage('m0', 0)], nextCursor: null }],
    pageParams: [undefined],
  });
  queryClient.setQueryData<Conversation[]>(conversationsKey, [
    {
      id: 'c2',
      otherUser: null,
      lastMessage: { ...cachedMessage('x', 1), conversationId: 'c2' },
      unread: false,
      muted: false,
    },
    { id: 'c1', otherUser: null, lastMessage: cachedMessage('m0', 0), unread: true, muted: false },
  ]);
}

function cachedIds(): string[] {
  const data = queryClient.getQueryData<MessagePages>(messagesKey('c1'));
  return data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const store = () => useChatStore.getState();
const pendingOf = (conversationId = 'c1') => store().pending[conversationId] ?? [];

beforeEach(() => {
  useSession.setState({ status: 'signedIn', user: me });
  chatSocket.connect();
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
  chatSocket.reset();
  queryClient.clear();
  jest.useRealTimers();
});

describe('send', () => {
  it('trims the text, adds a sending message and emits it with a new clientMessageId', () => {
    store().setDraft('c1', '  oi  ');

    const id = store().send('c1', '  oi  ');

    expect(id).toMatch(UUID);
    expect(pendingOf()).toEqual([
      { clientMessageId: id, content: 'oi', createdAt: expect.any(Date), status: 'sending' },
    ]);
    expect(store().drafts.c1).toBeUndefined();
    expect(chatSocket.pendingAck('message:send')?.payload).toEqual({
      conversationId: 'c1',
      content: 'oi',
      clientMessageId: id,
    });
  });

  it('ignores blank and too long text', () => {
    expect(store().send('c1', '   ')).toBeNull();
    expect(store().send('c1', 'a'.repeat(2001))).toBeNull();

    expect(pendingOf()).toEqual([]);
    expect(chatSocket.ackLog).toEqual([]);
  });

  it('replaces the pending message with the server message on ack', async () => {
    seedCache();
    const id = store().send('c1', 'oi');

    chatSocket.pendingAck('message:send')?.resolve({ message: serverJson('m1', id) });
    await flush();

    expect(pendingOf()).toEqual([]);
    expect(store().pending.c1).toBeUndefined();
    expect(cachedIds()).toEqual(['m1', 'm0']);
    const list = queryClient.getQueryData<Conversation[]>(conversationsKey);
    expect(list?.map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(list?.[0].lastMessage?.id).toBe('m1');
    expect(list?.[0].unread).toBe(false);
  });

  it('keeps one copy when the message event arrived before the ack', async () => {
    seedCache();
    const id = store().send('c1', 'oi');
    addMessagesToCache(queryClient, 'c1', [
      { ...cachedMessage('m1', 5), senderId: 'me', clientMessageId: id },
    ]);

    chatSocket.pendingAck('message:send')?.resolve({ message: serverJson('m1', id) });
    await flush();

    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(pendingOf()).toEqual([]);
  });

  it('marks the message failed with the server error', async () => {
    const id = store().send('c1', 'oi');

    chatSocket.pendingAck('message:send')?.resolve({ error: 'Conversa não encontrada' });
    await flush();

    expect(pendingOf()).toEqual([
      expect.objectContaining({
        clientMessageId: id,
        status: 'failed',
        error: 'Conversa não encontrada',
      }),
    ]);
  });

  it.each([
    ['blocked', 'Não é possível enviar mensagens para esta conta.'],
    ['dm_not_allowed', 'Esta pessoa não aceita mensagens suas.'],
  ])('marks a send refused with %s failed with its reason, and never re-sends it', async (code, reason) => {
    const id = store().send('c1', 'oi');

    chatSocket
      .pendingAck('message:send')
      ?.resolve({ error: 'Esta pessoa só recebe mensagens de quem ela segue', code });
    await flush();

    expect(pendingOf()).toEqual([
      expect.objectContaining({ clientMessageId: id, status: 'failed', error: reason, refusal: reason }),
    ]);
    chatSocket.drop();
    chatSocket.connect();
    chatSocket.ackLog = [];
    store().resendPending();
    expect(chatSocket.ackLog).toEqual([]);
    expect(pendingOf()[0].status).toBe('failed');
  });

  it('keeps the server error, with no refusal, for other codes', async () => {
    store().send('c1', 'oi');

    chatSocket.pendingAck('message:send')?.resolve({ error: 'Conversa não encontrada', code: 'not_found' });
    await flush();

    expect(pendingOf()[0]).toMatchObject({ status: 'failed', error: 'Conversa não encontrada' });
    expect(pendingOf()[0].refusal).toBeUndefined();
  });

  it('marks the message uncertain on timeout and re-sends it with the same id', async () => {
    seedCache();
    const id = store().send('c1', 'oi');

    chatSocket.pendingAck('message:send')?.reject(new Error('timeout'));
    await flush();
    expect(pendingOf()[0].status).toBe('uncertain');

    store().resendPending();
    expect(pendingOf()[0].status).toBe('sending');
    expect(chatSocket.pendingAck('message:send')?.payload).toEqual({
      conversationId: 'c1',
      content: 'oi',
      clientMessageId: id,
    });

    // The server had stored the first attempt; the repeat returns the same message.
    chatSocket.pendingAck('message:send')?.resolve({ message: serverJson('m1', id) });
    await flush();
    expect(pendingOf()).toEqual([]);
    expect(cachedIds()).toEqual(['m1', 'm0']);
  });

  it('marks the message uncertain when sent while disconnected', async () => {
    chatSocket.drop();
    store().send('c1', 'oi');
    await flush();

    expect(pendingOf()[0].status).toBe('uncertain');
  });

  it('re-sends sending and uncertain messages but not failed ones, and none twice', async () => {
    store().send('c1', 'falha');
    chatSocket.pendingAck('message:send')?.resolve({ error: 'Payload inválido' });
    await flush();
    chatSocket.drop();
    store().send('c1', 'offline');
    await flush();
    chatSocket.connect();
    chatSocket.ackLog = [];

    store().resendPending();
    store().resendPending();

    const contents = chatSocket.ackLog.map((entry) => (entry.payload as { content: string }).content);
    expect(contents).toEqual([
      'offline',
    ]);
    expect(pendingOf().map((item) => item.status)).toEqual(['failed', 'sending']);
  });
});

describe('retry and discard', () => {
  it('retries a failed message with the same clientMessageId', async () => {
    const id = store().send('c1', 'oi');
    chatSocket.pendingAck('message:send')?.resolve({ error: 'Erro interno' });
    await flush();

    store().retry('c1', id ?? '');

    expect(pendingOf()).toEqual([
      { clientMessageId: id, content: 'oi', createdAt: expect.any(Date), status: 'sending' },
    ]);
    expect(chatSocket.pendingAck('message:send')?.payload).toMatchObject({ clientMessageId: id });
  });

  it('drops the refusal on a manual retry and sets it again if refused again', async () => {
    const id = store().send('c1', 'oi');
    chatSocket.pendingAck('message:send')?.resolve({ error: 'x', code: 'blocked' });
    await flush();

    store().retry('c1', id ?? '');
    expect(pendingOf()).toEqual([
      { clientMessageId: id, content: 'oi', createdAt: expect.any(Date), status: 'sending' },
    ]);
    chatSocket.pendingAck('message:send')?.resolve({ error: 'x', code: 'dm_not_allowed' });
    await flush();

    expect(pendingOf()[0]).toMatchObject({
      status: 'failed',
      refusal: 'Esta pessoa não aceita mensagens suas.',
    });
  });

  it('discards a pending message', async () => {
    const id = store().send('c1', 'oi');
    chatSocket.pendingAck('message:send')?.resolve({ error: 'Erro interno' });
    await flush();

    store().discard('c1', id ?? '');

    expect(store().pending.c1).toBeUndefined();
  });
});

describe('drafts', () => {
  it('stores drafts per conversation and counts unsent text', async () => {
    store().setDraft('c1', 'rascunho');
    store().setDraft('c2', '   ');
    expect(store().draftCount()).toBe(1);

    store().setDraft('c1', '');
    expect(store().drafts).toEqual({ c2: '   ' });
    expect(store().draftCount()).toBe(0);

    chatSocket.drop();
    store().send('c3', 'pendente');
    await flush();
    expect(store().draftCount()).toBe(1);
  });
});

describe('typing', () => {
  it('clears the typing flag by itself after 6 s without a stop', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    store().setTyping('c1', true);
    jest.advanceTimersByTime(5999);
    expect(store().typing.c1).toBe(true);
    // A new start restarts the wait.
    store().setTyping('c1', true);
    jest.advanceTimersByTime(5999);
    expect(store().typing.c1).toBe(true);
    jest.advanceTimersByTime(1);

    expect(store().typing.c1).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels the timer on stop', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    store().setTyping('c1', true);
    store().setTyping('c1', false);

    expect(store().typing.c1).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('sign-out', () => {
  it('clears everything, including typing timers and late acks', async () => {
    seedCache();
    // After seeding, so the cache's own cleanup timers stay real and only the store's are counted.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    store().setDraft('c1', 'rascunho');
    store().setTyping('c1', true);
    store().setOnline('u2', true);
    store().setOpenConversation('c1');
    const id = store().send('c1', 'oi');
    const ack = chatSocket.pendingAck('message:send');

    useSession.setState({ status: 'signedOut', user: null });

    expect(store()).toMatchObject({
      pending: {},
      drafts: {},
      typing: {},
      online: {},
      openConversationId: null,
    });
    expect(jest.getTimerCount()).toBe(0);

    // The previous user's ack must not write into the next session.
    useSession.setState({ status: 'signedIn', user: me });
    queryClient.clear();
    seedCache();
    ack?.resolve({ message: serverJson('m1', id) });
    await flush();
    expect(cachedIds()).toEqual(['m0']);
  });
});
