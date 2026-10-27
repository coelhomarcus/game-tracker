import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { chatApi } from '../api';
import {
  addMessagesToCache,
  applyLatestMessage,
  conversationsKey,
  markReadInList,
  messagesKey,
  useConversations,
  useLeaveConversation,
  useMarkAllRead,
  useMarkRead,
  useMessages,
  useMuteConversation,
  useStartConversation,
  type MessagePages,
} from '../queries';
import type { Conversation, Message, MessagePage } from '../types';

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

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mocked = jest.mocked(chatApi);

function message(id: string, minute: number, conversationId = 'c1'): Message {
  return {
    id,
    conversationId,
    senderId: 'u2',
    content: `text ${id}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)),
    clientMessageId: null,
    sender: { id: 'u2', username: 'bia', name: null, avatarUrl: null },
    reactions: [],
  };
}

function conversation(id: string, last: Message | null, unread = false): Conversation {
  return {
    id,
    otherUser: { id: `other-${id}`, username: `user-${id}`, name: null, avatarUrl: null },
    lastMessage: last,
    unread,
    muted: false,
  };
}

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let client: QueryClient;

beforeEach(() => {
  jest.resetAllMocks();
  client = freshClient();
  useSession.setState({ status: 'signedIn' });
});

afterEach(() => {
  client.clear();
  useSession.setState({ status: 'signedOut', user: null });
});

describe('useConversations', () => {
  it('loads the conversation list', async () => {
    const list = [conversation('c1', message('m1', 1))];
    mocked.list.mockResolvedValue(list);

    const { result, unmount } = await renderHook(() => useConversations(), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data).toEqual(list));
    expect(client.getQueryData(conversationsKey)).toEqual(list);
    await unmount();
  });

  it('does not fetch while signed out', async () => {
    useSession.setState({ status: 'signedOut' });

    const { result, unmount } = await renderHook(() => useConversations(), {
      wrapper: wrapperFor(client),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.list).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('useMessages', () => {
  it('loads pages newest first and fetches older ones with the cursor', async () => {
    mocked.messages.mockImplementation(async (_id, cursor) =>
      cursor
        ? { items: [message('m1', 1)], nextCursor: null }
        : { items: [message('m2', 2)], nextCursor: 'older' },
    );

    const { result, unmount } = await renderHook(() => useMessages('c1'), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    expect(mocked.messages.mock.calls).toEqual([
      ['c1', undefined],
      ['c1', 'older'],
    ]);
    await waitFor(() =>
      expect(result.current.data?.pages.map((page) => page.items[0].id)).toEqual(['m2', 'm1']),
    );
    expect(result.current.hasNextPage).toBe(false);
    expect(client.getQueryData(messagesKey('c1'))).toBeDefined();
    await unmount();
  });

  it('does not fetch without a conversation id', async () => {
    const { result, unmount } = await renderHook(() => useMessages(undefined), {
      wrapper: wrapperFor(client),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mocked.messages).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('useStartConversation', () => {
  it('resolves with the conversation id and refreshes the list', async () => {
    mocked.create.mockResolvedValue('c9');
    client.setQueryData(conversationsKey, [conversation('c1', null)]);

    const { result, unmount } = await renderHook(() => useStartConversation(), {
      wrapper: wrapperFor(client),
    });
    let id: string | undefined;
    await act(async () => {
      id = await result.current.mutateAsync('u7');
    });

    expect(id).toBe('c9');
    expect(mocked.create).toHaveBeenCalledWith('u7');
    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    await unmount();
  });
});

// The server side of marking read lives in the realtime bridge (after each join's refetch).
describe('markReadInList', () => {
  it('marks only that conversation read in the list right away', () => {
    client.setQueryData(conversationsKey, [
      conversation('c1', message('m1', 1), true),
      conversation('c2', message('m2', 2), true),
    ]);

    markReadInList(client, 'c1');

    const list = client.getQueryData<Conversation[]>(conversationsKey);
    expect(list?.map((item) => item.unread)).toEqual([false, true]);
  });

  it('marks it read again on top of a list response that was already on its way', async () => {
    const response = deferred<Conversation[]>();
    mocked.list.mockReturnValue(response.promise);
    const { result, unmount } = await renderHook(() => useConversations(), {
      wrapper: wrapperFor(client),
    });

    // Read on the server before the conversation was marked read there.
    markReadInList(client, 'c1');
    await act(async () => response.resolve([conversation('c1', message('m1', 1), true)]));

    await waitFor(() => expect(result.current.data?.[0].unread).toBe(false));
    await unmount();
  });
});

describe('cache helpers', () => {
  const page = (...items: Message[]): MessagePage => ({ items, nextCursor: null });

  it('merges messages only into a cached conversation', () => {
    addMessagesToCache(client, 'c1', [message('m1', 1)]);
    expect(client.getQueryData(messagesKey('c1'))).toBeUndefined();

    client.setQueryData<MessagePages>(messagesKey('c1'), {
      pages: [page(message('m1', 1))],
      pageParams: [undefined],
    });
    addMessagesToCache(client, 'c1', [message('m2', 2), message('m1', 1)]);

    const data = client.getQueryData<MessagePages>(messagesKey('c1'));
    expect(data?.pages[0].items.map((item) => item.id)).toEqual(['m2', 'm1']);
  });

  it('keeps the time the server was last read when merging locally', () => {
    client.setQueryData<MessagePages>(
      messagesKey('c1'),
      { pages: [page(message('m1', 1))], pageParams: [undefined] },
      { updatedAt: 1_000 },
    );
    client.setQueryData(conversationsKey, [conversation('c1', message('m1', 1), true)], {
      updatedAt: 2_000,
    });

    addMessagesToCache(client, 'c1', [message('m2', 2)]);
    applyLatestMessage(client, message('m2', 2), true);
    markReadInList(client, 'c1');

    expect(client.getQueryState(messagesKey('c1'))?.dataUpdatedAt).toBe(1_000);
    expect(client.getQueryState(conversationsKey)?.dataUpdatedAt).toBe(2_000);
  });

  it('applies a message again on top of a response that was already on its way', async () => {
    const response = deferred<MessagePage>();
    mocked.messages.mockReturnValue(response.promise);
    const { result, unmount } = await renderHook(() => useMessages('c1'), {
      wrapper: wrapperFor(client),
    });

    // Arrives while the first page is loading; the page itself was read before it existed.
    addMessagesToCache(client, 'c1', [message('m2', 2)]);
    await act(async () => response.resolve(page(message('m1', 1))));

    await waitFor(() =>
      expect(result.current.data?.pages[0].items.map((item) => item.id)).toEqual(['m2', 'm1']),
    );
    await unmount();
  });

  it('moves the conversation to the top with the new last message and unread flag', () => {
    client.setQueryData(conversationsKey, [
      conversation('c2', message('m2', 2, 'c2')),
      conversation('c1', message('m1', 1)),
    ]);

    applyLatestMessage(client, message('m3', 3), true);

    const list = client.getQueryData<Conversation[]>(conversationsKey);
    expect(list?.map((item) => item.id)).toEqual(['c1', 'c2']);
    expect(list?.[0].lastMessage?.id).toBe('m3');
    expect(list?.[0].unread).toBe(true);
  });

  it('ignores a message older than the current last message', () => {
    const list = [conversation('c1', message('m2', 2), false)];
    client.setQueryData(conversationsKey, list);

    applyLatestMessage(client, message('m1', 1), true);

    expect(client.getQueryData(conversationsKey)).toBe(list);
  });

  it('refreshes the list when the conversation is not in it yet', () => {
    client.setQueryData(conversationsKey, [conversation('c2', null)]);

    applyLatestMessage(client, message('m1', 1), true);

    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
  });
});

describe('list actions', () => {
  async function run<V>(hook: () => { mutateAsync: (v: V) => Promise<void> }, variables: V) {
    const { result, unmount } = await renderHook(hook, { wrapper: wrapperFor(client) });
    await act(async () => {
      await result.current.mutateAsync(variables).catch(() => undefined);
    });
    await unmount();
  }
  const list = () => client.getQueryData<Conversation[]>(conversationsKey);

  it('marks one conversation read in the list and on the server', async () => {
    mocked.markRead.mockResolvedValue();
    client.setQueryData(conversationsKey, [conversation('c1', null, true), conversation('c2', null, true)]);

    await run(() => useMarkRead(), 'c1');

    expect(mocked.markRead).toHaveBeenCalledWith('c1');
    expect(list()?.map((item) => item.unread)).toEqual([false, true]);
  });

  it('reads the list again and says so when marking read fails', async () => {
    mocked.markRead.mockRejectedValue(new Error('boom'));
    client.setQueryData(conversationsKey, [conversation('c1', null, true)]);

    await run(() => useMarkRead(), 'c1');

    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Não foi possível marcar a conversa como lida');
  });

  it('marks every conversation read, muted ones too', async () => {
    mocked.markAllRead.mockResolvedValue();
    client.setQueryData(conversationsKey, [
      conversation('c1', null, true),
      { ...conversation('c2', null, true), muted: true },
      conversation('c3', null, false),
    ]);

    await run<void>(() => useMarkAllRead(), undefined);

    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);
    expect(list()?.map((item) => item.unread)).toEqual([false, false, false]);
  });

  it('reads the list again when marking all read fails', async () => {
    mocked.markAllRead.mockRejectedValue(new Error('boom'));
    client.setQueryData(conversationsKey, [conversation('c1', null, true)]);

    await run<void>(() => useMarkAllRead(), undefined);

    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Não foi possível marcar as conversas como lidas');
  });

  it('mutes and unmutes a conversation at once', async () => {
    mocked.setMuted.mockResolvedValue();
    client.setQueryData(conversationsKey, [conversation('c1', null), conversation('c2', null)]);

    await run(() => useMuteConversation(), { conversationId: 'c1', muted: true });
    expect(mocked.setMuted).toHaveBeenLastCalledWith('c1', true);
    expect(list()?.map((item) => item.muted)).toEqual([true, false]);
    expect(showToast).toHaveBeenLastCalledWith('Conversa silenciada');

    await run(() => useMuteConversation(), { conversationId: 'c1', muted: false });
    expect(mocked.setMuted).toHaveBeenLastCalledWith('c1', false);
    expect(list()?.[0].muted).toBe(false);
    expect(showToast).toHaveBeenLastCalledWith('Conversa reativada');
  });

  it('puts the server state back when muting fails', async () => {
    mocked.setMuted.mockRejectedValue(new Error('boom'));
    mocked.list.mockResolvedValue([conversation('c1', null)]);
    client.setQueryData(conversationsKey, [conversation('c1', null)]);

    await run(() => useMuteConversation(), { conversationId: 'c1', muted: true });

    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Não foi possível silenciar a conversa');
  });

  it('takes a left conversation out of the list and forgets its messages', async () => {
    mocked.leave.mockResolvedValue();
    client.setQueryData(conversationsKey, [conversation('c1', null), conversation('c2', null)]);
    client.setQueryData(messagesKey('c1'), { pages: [], pageParams: [] });

    await run(() => useLeaveConversation(), 'c1');

    expect(mocked.leave).toHaveBeenCalledWith('c1');
    expect(list()?.map((item) => item.id)).toEqual(['c2']);
    expect(client.getQueryData(messagesKey('c1'))).toBeUndefined();
  });

  it('keeps a left conversation out of a list response already on its way', async () => {
    mocked.leave.mockResolvedValue();
    const response = deferred<Conversation[]>();
    mocked.list.mockReturnValue(response.promise);
    const { result, unmount } = await renderHook(() => useConversations(), {
      wrapper: wrapperFor(client),
    });
    await run(() => useLeaveConversation(), 'c1');
    await act(async () => response.resolve([conversation('c1', null), conversation('c2', null)]));

    await waitFor(() => expect(result.current.data?.map((item) => item.id)).toEqual(['c2']));
    await unmount();
  });

  it('reads the list again and says so when leaving fails', async () => {
    mocked.leave.mockRejectedValue(new Error('boom'));
    client.setQueryData(conversationsKey, [conversation('c1', null)]);

    await run(() => useLeaveConversation(), 'c1');

    expect(client.getQueryState(conversationsKey)?.isInvalidated).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Não foi possível sair da conversa');
  });
});
