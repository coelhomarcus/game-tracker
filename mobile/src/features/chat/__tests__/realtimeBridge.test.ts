import { useSession, type User } from '@/features/auth';
import { queryClient } from '@/lib/queryClient';
import { chatSocket } from '@/test-utils/fakeChatSocket';

import { chatApi } from '../api';
import { useChatStore } from '../chatStore';
import { conversationsKey, messagesKey, type MessagePages } from '../queries';
import { realtimeBridge } from '../realtimeBridge';
import { parseMessage, type Conversation, type Message, type MessagePage } from '../types';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@/features/chat/api', () => ({
  chatApi: { list: jest.fn(), create: jest.fn(), messages: jest.fn(), markRead: jest.fn() },
}));

const mocked = jest.mocked(chatApi);

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

type JsonOptions = {
  conversationId?: string;
  senderId?: string;
  minute?: number;
  clientMessageId?: string | null;
};

function json(
  id: string,
  { conversationId = 'c1', senderId = 'u2', minute = 5, clientMessageId = null }: JsonOptions = {},
) {
  return {
    id,
    conversationId,
    senderId,
    content: `text ${id}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString(),
    clientMessageId,
    sender: { id: senderId, username: senderId, name: null, avatarUrl: null },
  };
}

function cached(id: string, conversationId: string, minute: number): Message {
  return {
    id,
    conversationId,
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
    pages: [{ items: [cached('m0', 'c1', 0)], nextCursor: null }],
    pageParams: [undefined],
  });
  queryClient.setQueryData<Conversation[]>(conversationsKey, [
    {
      id: 'c2',
      otherUser: { id: 'u3', username: 'caio', name: null, avatarUrl: null },
      lastMessage: cached('x', 'c2', 1),
      unread: false,
      muted: false,
    },
    {
      id: 'c1',
      otherUser: { id: 'u2', username: 'bia', name: null, avatarUrl: null },
      lastMessage: cached('m0', 'c1', 0),
      unread: false,
      muted: false,
    },
  ]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const page = (...items: Message[]): MessagePage => ({
  items,
  nextCursor: null,
});

/** Loads c1's messages through a real query (as the room does), so it can be refetched. */
async function loadMessages(...items: Message[]) {
  mocked.messages.mockResolvedValueOnce(page(...items));
  await queryClient.fetchInfiniteQuery({
    queryKey: messagesKey('c1'),
    queryFn: ({ pageParam }) => chatApi.messages('c1', pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MessagePage) => last.nextCursor ?? undefined,
    retry: false,
  });
}

/** Records the order of message fetches and read marks. */
function trackOrder(serverItems: () => Message[]) {
  const order: string[] = [];
  mocked.messages.mockImplementation(async () => {
    order.push('fetch');
    return page(...serverItems());
  });
  mocked.markRead.mockImplementation(async () => {
    order.push('read');
  });
  return order;
}

async function answerJoin() {
  chatSocket.pendingAck('conversation:join')?.resolve({ ok: true });
  await flush();
  await flush();
}

function cachedIds(conversationId = 'c1'): string[] {
  const data = queryClient.getQueryData<MessagePages>(messagesKey(conversationId));
  return data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
}

const conversations = () => queryClient.getQueryData<Conversation[]>(conversationsKey) ?? [];
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const store = () => useChatStore.getState();

beforeEach(() => {
  mocked.markRead.mockResolvedValue(undefined);
  useSession.setState({ status: 'signedIn', user: me });
  realtimeBridge.start();
  chatSocket.connect();
});

afterEach(() => {
  realtimeBridge.stop();
  useSession.setState({ status: 'signedOut', user: null });
  chatSocket.reset();
  queryClient.clear();
  jest.resetAllMocks();
  jest.useRealTimers();
});

describe('lifecycle', () => {
  it('removes every listener and typing timer on stop and is idempotent', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    realtimeBridge.start();
    // Seven server events and the reconnect hook, registered once.
    expect(chatSocket.listenerCount()).toBe(8);
    chatSocket.fire('typing:start', { conversationId: 'c1', userId: 'u2' });

    realtimeBridge.stop();
    realtimeBridge.stop();

    expect(chatSocket.listenerCount()).toBe(0);
    expect(store().typing).toEqual({});
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('message:receive', () => {
  it('updates a closed conversation in the list as unread without marking it read', () => {
    seedCache();

    chatSocket.fire('message:receive', json('m1'));

    expect(conversations().map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(conversations()[0]).toMatchObject({ unread: true, lastMessage: { id: 'm1' } });
    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(mocked.markRead).not.toHaveBeenCalled();
  });

  it('appends a message for the open conversation once and marks it read', () => {
    seedCache();
    store().setOpenConversation('c1');

    chatSocket.fire('message:receive', json('m1'));
    chatSocket.fire('message:receive', json('m1'));

    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(conversations()[0]).toMatchObject({ id: 'c1', unread: false });
    expect(mocked.markRead).toHaveBeenCalledWith('c1');
  });

  it('marks a burst read with one request in flight and at most one after it', async () => {
    seedCache();
    store().setOpenConversation('c1');
    const request = deferred<void>();
    mocked.markRead.mockReturnValueOnce(request.promise);

    for (const id of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      chatSocket.fire('message:receive', json(id, { minute: 10 + Number(id.slice(1)) }));
    }
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
    request.resolve();
    await flush();

    expect(mocked.markRead).toHaveBeenCalledTimes(2);
    expect(mocked.markRead).toHaveBeenLastCalledWith('c1');
    expect(conversations()[0]).toMatchObject({ id: 'c1', unread: false });
  });

  it('does not mark my own message unread or read', () => {
    seedCache();

    chatSocket.fire('message:receive', json('m1', { senderId: 'me' }));

    expect(conversations()[0]).toMatchObject({ id: 'c1', unread: false });
    expect(mocked.markRead).not.toHaveBeenCalled();
  });

  it('refreshes the list for a conversation it does not know yet', () => {
    seedCache();

    chatSocket.fire('message:receive', json('n1', { conversationId: 'c9' }));

    expect(queryClient.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
  });

  it('clears the typing flag when the other person sends', () => {
    chatSocket.fire('typing:start', { conversationId: 'c1', userId: 'u2' });

    chatSocket.fire('message:receive', json('m1'));

    expect(store().typing.c1).toBeUndefined();
  });

  it('ignores malformed payloads', () => {
    seedCache();

    chatSocket.fire('message:receive', null);
    chatSocket.fire('message:receive', { id: 'm1' });

    expect(cachedIds()).toEqual(['m0']);
  });
});

describe('message:hidden', () => {
  it('removes the message from the loaded pages, on any page', () => {
    seedCache();
    queryClient.setQueryData<MessagePages>(messagesKey('c1'), {
      pages: [
        { items: [cached('m2', 'c1', 2), cached('m1', 'c1', 1)], nextCursor: 'older' },
        { items: [cached('m0', 'c1', 0)], nextCursor: null },
      ],
      pageParams: [undefined, 'older'],
    });

    chatSocket.fire('message:hidden', { conversationId: 'c1', messageId: 'm1' });
    chatSocket.fire('message:hidden', { conversationId: 'c1', messageId: 'm0' });

    expect(cachedIds()).toEqual(['m2']);
    // m0 is the last message in the seeded list: the list is read again for the new one.
    expect(queryClient.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
  });

  it('reads the list again only when the hidden message was the last one', () => {
    seedCache();
    queryClient.setQueryData<MessagePages>(messagesKey('c1'), {
      pages: [{ items: [cached('m1', 'c1', 1), cached('m0', 'c1', 0)], nextCursor: null }],
      pageParams: [undefined],
    });

    chatSocket.fire('message:hidden', { conversationId: 'c1', messageId: 'm1' });

    expect(cachedIds()).toEqual(['m0']);
    expect(queryClient.getQueryState(conversationsKey)?.isInvalidated).toBe(false);
  });

  it('ignores unknown messages and conversations without creating anything', () => {
    seedCache();
    const before = queryClient.getQueryData(messagesKey('c1'));

    chatSocket.fire('message:hidden', { conversationId: 'c1', messageId: 'nope' });
    chatSocket.fire('message:hidden', { conversationId: 'c9', messageId: 'm0' });

    expect(queryClient.getQueryData(messagesKey('c1'))).toBe(before);
    expect(queryClient.getQueryData(messagesKey('c9'))).toBeUndefined();
    expect(queryClient.getQueryState(conversationsKey)?.isInvalidated).toBe(false);
  });

  it('applies again on top of a fetch already in flight', async () => {
    await loadMessages(cached('m1', 'c1', 1), cached('m0', 'c1', 0));
    const refetch = deferred<MessagePage>();
    mocked.messages.mockReturnValueOnce(refetch.promise);
    void queryClient.refetchQueries({ queryKey: messagesKey('c1'), exact: true });

    chatSocket.fire('message:hidden', { conversationId: 'c1', messageId: 'm1' });
    // Read by the server before the message was hidden.
    refetch.resolve(page(cached('m1', 'c1', 1), cached('m0', 'c1', 0)));
    await flush();
    await flush();

    expect(cachedIds()).toEqual(['m0']);
  });

  it('ignores malformed payloads', () => {
    seedCache();

    chatSocket.fire('message:hidden', null);
    chatSocket.fire('message:hidden', { conversationId: 'c1' });
    chatSocket.fire('message:hidden', { messageId: 'm0' });

    expect(cachedIds()).toEqual(['m0']);
  });
});

describe('message:reaction', () => {
  const reactionsOf = (id: string) =>
    queryClient
      .getQueryData<MessagePages>(messagesKey('c1'))
      ?.pages.flatMap((p) => p.items)
      .find((item) => item.id === id)?.reactions;
  const previewOf = (conversationId: string) =>
    conversations().find((item) => item.id === conversationId)?.lastMessage?.reactions;
  const event = (action: string, emoji = '👍', userId = 'u2', messageId = 'm0') => ({
    conversationId: 'c1',
    messageId,
    emoji,
    userId,
    action,
  });

  it('adds and removes a reaction on a loaded message and on the list preview', () => {
    seedCache();

    chatSocket.fire('message:reaction', event('add'));
    chatSocket.fire('message:reaction', event('add', '❤️', 'me'));

    const both = [
      { emoji: '👍', userId: 'u2' },
      { emoji: '❤️', userId: 'me' },
    ];
    expect(reactionsOf('m0')).toEqual(both);
    expect(previewOf('c1')).toEqual(both);

    chatSocket.fire('message:reaction', event('remove'));

    expect(reactionsOf('m0')).toEqual([{ emoji: '❤️', userId: 'me' }]);
    expect(previewOf('c1')).toEqual([{ emoji: '❤️', userId: 'me' }]);
  });

  it('is idempotent: a repeated add or remove changes nothing', () => {
    seedCache();

    chatSocket.fire('message:reaction', event('add'));
    const once = queryClient.getQueryData(messagesKey('c1'));
    chatSocket.fire('message:reaction', event('add'));
    expect(queryClient.getQueryData(messagesKey('c1'))).toBe(once);

    chatSocket.fire('message:reaction', event('remove'));
    const removed = queryClient.getQueryData(messagesKey('c1'));
    chatSocket.fire('message:reaction', event('remove'));
    expect(queryClient.getQueryData(messagesKey('c1'))).toBe(removed);
    expect(reactionsOf('m0')).toEqual([]);
  });

  it('ignores unknown messages and conversations and creates no entries', () => {
    seedCache();
    const before = queryClient.getQueryData(messagesKey('c1'));
    const list = queryClient.getQueryData(conversationsKey);

    chatSocket.fire('message:reaction', event('add', '👍', 'u2', 'nope'));
    chatSocket.fire('message:reaction', { ...event('add'), conversationId: 'c9' });

    expect(queryClient.getQueryData(messagesKey('c1'))).toBe(before);
    expect(queryClient.getQueryData(conversationsKey)).toBe(list);
    expect(queryClient.getQueryData(messagesKey('c9'))).toBeUndefined();
  });

  it('works with nothing cached at all', () => {
    chatSocket.fire('message:reaction', event('add'));

    expect(queryClient.getQueryData(messagesKey('c1'))).toBeUndefined();
    expect(queryClient.getQueryData(conversationsKey)).toBeUndefined();
  });

  it('ignores malformed payloads and unknown actions', () => {
    seedCache();

    chatSocket.fire('message:reaction', null);
    chatSocket.fire('message:reaction', event('toggle'));
    chatSocket.fire('message:reaction', { ...event('add'), emoji: '' });
    chatSocket.fire('message:reaction', { ...event('add'), userId: 3 });
    chatSocket.fire('message:reaction', { ...event('add'), messageId: undefined });

    expect(reactionsOf('m0')).toEqual([]);
  });
});

describe('reliable sending', () => {
  it('ends with the message in the cache once when the event arrives before the ack', async () => {
    seedCache();
    const id = store().send('c1', 'oi');

    chatSocket.fire('message:receive', json('m1', { senderId: 'me', clientMessageId: id }));
    expect(store().pending.c1).toBeUndefined();
    chatSocket
      .pendingAck('message:send')
      ?.resolve({ message: json('m1', { senderId: 'me', clientMessageId: id }) });
    await flush();

    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(store().pending.c1).toBeUndefined();
  });

  it('re-sends an unconfirmed message with the same id on reconnect', async () => {
    seedCache();
    const id = store().send('c1', 'oi');
    chatSocket.pendingAck('message:send')?.reject(new Error('timeout'));
    await flush();
    expect(store().pending.c1?.[0].status).toBe('uncertain');
    chatSocket.drop();
    chatSocket.ackLog = [];

    chatSocket.connect();

    expect(chatSocket.ackLog).toEqual([
      {
        event: 'message:send',
        payload: { conversationId: 'c1', content: 'oi', clientMessageId: id },
      },
    ]);
    chatSocket
      .pendingAck('message:send')
      ?.resolve({ message: json('m1', { senderId: 'me', clientMessageId: id }) });
    await flush();
    expect(cachedIds()).toEqual(['m1', 'm0']);
  });
});

describe('typing and presence', () => {
  it('tracks the other person typing and clears it after 6 s without a stop', () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });

    chatSocket.fire('typing:start', { conversationId: 'c1', userId: 'u2' });
    expect(store().typing.c1).toBe(true);
    jest.advanceTimersByTime(6000);
    expect(store().typing.c1).toBeUndefined();

    chatSocket.fire('typing:start', { conversationId: 'c1', userId: 'u2' });
    chatSocket.fire('typing:stop', { conversationId: 'c1', userId: 'u2' });
    expect(store().typing.c1).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores my own typing from another device', () => {
    chatSocket.fire('typing:start', { conversationId: 'c1', userId: 'me' });

    expect(store().typing.c1).toBeUndefined();
  });

  it('tracks presence events', () => {
    chatSocket.fire('presence:online', { userId: 'u2' });
    expect(store().online.u2).toBe(true);

    chatSocket.fire('presence:offline', { userId: 'u2' });
    expect(store().online.u2).toBe(false);
  });
});

describe('open conversation', () => {
  it('joins the room and asks who is online, then leaves it when closed', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    mocked.messages.mockResolvedValue(page(cached('m0', 'c1', 0)));

    store().setOpenConversation('c1');
    expect(chatSocket.pendingAck('conversation:join')?.payload).toEqual({ conversationId: 'c1' });
    chatSocket.pendingAck('conversation:join')?.resolve({ ok: true });
    await flush();
    expect(chatSocket.pendingAck('presence:get')?.payload).toEqual({ conversationId: 'c1' });
    chatSocket.pendingAck('presence:get')?.resolve({ online: [] });
    await flush();
    expect(store().online.u2).toBe(false);

    store().setOpenConversation(null);
    expect(chatSocket.emitted).toEqual([
      { event: 'conversation:leave', payload: { conversationId: 'c1' } },
    ]);
  });

  it('re-joins and refreshes presence and data after a reconnect, then marks it read', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    store().setOpenConversation('c1');
    await answerJoin();
    chatSocket.pendingAck('presence:get')?.resolve({ online: [] });
    await flush();
    chatSocket.drop();
    chatSocket.ackLog = [];
    // Sent while the connection was down: only the server has it.
    const order = trackOrder(() => [cached('m1', 'c1', 1), cached('m0', 'c1', 0)]);

    chatSocket.connect();
    expect(order).toEqual([]);
    expect(queryClient.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    await answerJoin();
    chatSocket.pendingAck('presence:get')?.resolve({ online: ['u2'] });
    await flush();

    expect(chatSocket.ackLog.map((entry) => entry.event)).toEqual([
      'conversation:join',
      'presence:get',
    ]);
    expect(store().online.u2).toBe(true);
    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(order).toEqual(['fetch', 'read']);
    expect(mocked.markRead).toHaveBeenCalledWith('c1');
  });

  it('refetches the open conversation after the join answers, then marks it read', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    const refetch = deferred<MessagePage>();
    mocked.messages.mockReturnValueOnce(refetch.promise);

    store().setOpenConversation('c1');
    expect(mocked.messages).toHaveBeenCalledTimes(1);
    await answerJoin();
    expect(mocked.messages).toHaveBeenCalledTimes(2);
    expect(mocked.markRead).not.toHaveBeenCalled();

    refetch.resolve(page(cached('m1', 'c1', 1), cached('m0', 'c1', 0)));
    await flush();
    await flush();

    expect(cachedIds()).toEqual(['m1', 'm0']);
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
    expect(mocked.markRead).toHaveBeenCalledWith('c1');
  });

  it('refetches even when a message was merged before the join answered', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    const mine = parseMessage(json('m2', { senderId: 'me', minute: 2 }));
    // m1 was sent while outside the room; the server has both.
    const order = trackOrder(() => [mine, cached('m1', 'c1', 1), cached('m0', 'c1', 0)]);
    store().setOpenConversation('c1');

    // My message from another device, merged locally while the join is on its way.
    chatSocket.fire('message:receive', json('m2', { senderId: 'me', minute: 2 }));
    expect(cachedIds()).toEqual(['m2', 'm0']);
    await answerJoin();
    await flush();

    expect(order).toEqual(['fetch', 'read']);
    expect(cachedIds()).toEqual(['m2', 'm1', 'm0']);
  });

  it('does not mark read when the room closed or re-joined before the refetch landed', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    const refetch = deferred<MessagePage>();
    mocked.messages.mockReturnValueOnce(refetch.promise);
    store().setOpenConversation('c1');
    await answerJoin();

    store().setOpenConversation(null);
    refetch.resolve(page(cached('m0', 'c1', 0)));
    await flush();
    await flush();
    expect(mocked.markRead).not.toHaveBeenCalled();

    // Left and opened again: only the newest join's refetch may mark it read.
    const stale = deferred<MessagePage>();
    mocked.messages.mockReturnValueOnce(stale.promise);
    store().setOpenConversation('c1');
    await answerJoin();
    store().setOpenConversation(null);
    store().setOpenConversation('c1');
    stale.resolve(page(cached('m0', 'c1', 0)));
    await flush();
    await flush();
    expect(mocked.markRead).not.toHaveBeenCalled();

    mocked.messages.mockResolvedValueOnce(page(cached('m0', 'c1', 0)));
    await answerJoin();
    await flush();
    expect(mocked.markRead).toHaveBeenCalledTimes(1);
  });

  it('does not mark read when the refetch fails', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    mocked.messages.mockRejectedValueOnce(new Error('offline'));
    store().setOpenConversation('c1');

    await answerJoin();
    await flush();

    expect(mocked.messages).toHaveBeenCalledTimes(2);
    expect(mocked.markRead).not.toHaveBeenCalled();
  });

  it('does not refetch or mark read when the join is refused', async () => {
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    store().setOpenConversation('c1');

    chatSocket.pendingAck('conversation:join')?.resolve({ error: 'Conversa não encontrada' });
    await flush();
    await flush();

    expect(mocked.messages).toHaveBeenCalledTimes(1);
    expect(mocked.markRead).not.toHaveBeenCalled();
  });

  it('catches up on the first connect after starting with a conversation open', async () => {
    realtimeBridge.stop();
    chatSocket.drop();
    seedCache();
    await loadMessages(cached('m0', 'c1', 0));
    store().setOpenConversation('c1');
    const order = trackOrder(() => [cached('m1', 'c1', 1), cached('m0', 'c1', 0)]);
    realtimeBridge.start();

    chatSocket.connect();
    await answerJoin();
    await flush();

    expect(order).toEqual(['fetch', 'read']);
    expect(cachedIds()).toEqual(['m1', 'm0']);
  });

  it('joins right away when started while a conversation is already open', () => {
    realtimeBridge.stop();
    store().setOpenConversation('c1');
    expect(chatSocket.ackLog).toEqual([]);

    realtimeBridge.start();

    expect(chatSocket.pendingAck('conversation:join')?.payload).toEqual({ conversationId: 'c1' });
  });
});
