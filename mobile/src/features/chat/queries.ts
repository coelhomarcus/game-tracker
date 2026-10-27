import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { useSession } from '@/features/auth';

import { chatApi } from './api';
import { mergeIntoPages } from './mergeMessages';
import type { Conversation, Message, MessagePage } from './types';

/** The list has no live event for conversations the app is not in, so it is polled lightly. */
const CONVERSATIONS_POLL_MS = 30_000;

export const conversationsKey = ['conversations'] as const;
export const messagesKey = (conversationId: string) => ['messages', conversationId] as const;

/** Newest page first; each page is newest first. */
export type MessagePages = InfiniteData<MessagePage, string | undefined>;

export function useConversations() {
  const signedIn = useSession((state) => state.status === 'signedIn');
  return useQuery({
    queryKey: conversationsKey,
    queryFn: () => chatApi.list(),
    enabled: signedIn,
    refetchInterval: CONVERSATIONS_POLL_MS,
  });
}

/**
 * One conversation from the list (`null` when the list does not have it). A cached list is used
 * as is; it is fetched only when missing (a deep link), so opening a room never races its own
 * mark-read with a list refetch.
 */
export function useConversation(conversationId: string) {
  const signedIn = useSession((state) => state.status === 'signedIn');
  return useQuery({
    queryKey: conversationsKey,
    queryFn: () => chatApi.list(),
    enabled: signedIn,
    refetchOnMount: false,
    select: (list: Conversation[]) => list.find((item) => item.id === conversationId) ?? null,
  });
}

export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery<MessagePage, Error, MessagePages, QueryKey, string | undefined>({
    queryKey: messagesKey(conversationId ?? ''),
    queryFn:
      conversationId === undefined
        ? skipToken
        : ({ pageParam }) => chatApi.messages(conversationId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Finds or creates the conversation with a user; resolves with its id. */
export function useStartConversation() {
  const client = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: (userId) => chatApi.create(userId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

// ---------- cache updates from the socket ----------

/**
 * Applies `update` now, and again once a fetch already in flight lands: that response may have
 * been read before the change existed and would otherwise overwrite it. `update` must be
 * idempotent. `dataUpdatedAt` is kept, so it keeps telling when the server was last read (the
 * realtime bridge relies on it to know whether a join still needs a refetch).
 */
function updateNowAndAfterFetch<T>(
  client: QueryClient,
  key: QueryKey,
  update: (data: T | undefined) => T | undefined,
): void {
  const apply = () =>
    client.setQueryData<T>(key, update, {
      updatedAt: client.getQueryState(key)?.dataUpdatedAt,
    });
  apply();
  const inFlight = client.getQueryCache().find({ queryKey: key, exact: true })?.promise;
  if (!inFlight) return;
  void inFlight
    .then(
      () => undefined,
      () => undefined,
    )
    .then(apply);
}

/** Merges server messages into a conversation's loaded pages; nothing happens if none are. */
export function addMessagesToCache(
  client: QueryClient,
  conversationId: string,
  messages: Message[],
): void {
  if (messages.length === 0) return;
  updateNowAndAfterFetch<MessagePages>(client, messagesKey(conversationId), (data) =>
    data ? mergeIntoPages(data, messages) : data,
  );
}

/**
 * A new message in a conversation: it becomes the last message, the conversation moves to the top
 * and its unread flag is set to `unread`. An unknown conversation makes the list refetch.
 */
export function applyLatestMessage(client: QueryClient, message: Message, unread: boolean): void {
  const list = client.getQueryData<Conversation[]>(conversationsKey);
  if (!list) return;
  if (!list.some((item) => item.id === message.conversationId)) {
    void client.invalidateQueries({ queryKey: conversationsKey });
    return;
  }
  updateNowAndAfterFetch<Conversation[]>(client, conversationsKey, (data) => {
    const index = data?.findIndex((item) => item.id === message.conversationId) ?? -1;
    if (!data || index < 0) return data;
    const current = data[index];
    const last = current.lastMessage;
    if (last && (last.id === message.id || last.createdAt > message.createdAt)) return data;
    const updated: Conversation = { ...current, lastMessage: message, unread };
    return [updated, ...data.filter((_, at) => at !== index)];
  });
}

/**
 * Clears a conversation's unread flag in the list, now and on top of a list response already on
 * its way (it may have been read before the conversation was marked read on the server).
 */
export function markReadInList(client: QueryClient, conversationId: string): void {
  updateNowAndAfterFetch<Conversation[]>(client, conversationsKey, (data) =>
    data?.some((item) => item.id === conversationId && item.unread)
      ? data.map((item) => (item.id === conversationId ? { ...item, unread: false } : item))
      : data,
  );
}

/** True when the loaded pages hold the message. */
function pagesHold(data: MessagePages | undefined, messageId: string): boolean {
  return data?.pages.some((page) => page.items.some((item) => item.id === messageId)) ?? false;
}

/**
 * A message I deleted for myself (here or on another device) leaves the loaded pages. If it was
 * the conversation's last message the list is read again: the server knows the new last one.
 */
export function removeMessageFromCache(
  client: QueryClient,
  conversationId: string,
  messageId: string,
): void {
  updateNowAndAfterFetch<MessagePages>(client, messagesKey(conversationId), (data) =>
    data && pagesHold(data, messageId)
      ? {
          ...data,
          pages: data.pages.map((page) =>
            page.items.some((item) => item.id === messageId)
              ? { ...page, items: page.items.filter((item) => item.id !== messageId) }
              : page,
          ),
        }
      : data,
  );
  const list = client.getQueryData<Conversation[]>(conversationsKey);
  if (list?.some((item) => item.id === conversationId && item.lastMessage?.id === messageId)) {
    void client.invalidateQueries({ queryKey: conversationsKey });
  }
}

export type ReactionChange = {
  conversationId: string;
  messageId: string;
  emoji: string;
  userId: string;
  action: 'add' | 'remove';
};

/** The message with the change applied; the same object when it changes nothing. */
function withReaction(message: Message, { emoji, userId, action }: ReactionChange): Message {
  const has = message.reactions.some((item) => item.emoji === emoji && item.userId === userId);
  if (action === 'add') {
    return has ? message : { ...message, reactions: [...message.reactions, { emoji, userId }] };
  }
  if (!has) return message;
  return {
    ...message,
    reactions: message.reactions.filter((item) => item.emoji !== emoji || item.userId !== userId),
  };
}

/**
 * Applies a reaction added or removed to the message wherever it is loaded: the conversation's
 * pages and the list's last message. A message that is not loaded is left alone (nothing is
 * created for it); the next fetch brings its reactions.
 */
export function applyReactionToCache(client: QueryClient, change: ReactionChange): void {
  updateNowAndAfterFetch<MessagePages>(client, messagesKey(change.conversationId), (data) => {
    if (!data || !pagesHold(data, change.messageId)) return data;
    return {
      ...data,
      pages: data.pages.map((page) => {
        if (!page.items.some((item) => item.id === change.messageId)) return page;
        return {
          ...page,
          items: page.items.map((item) =>
            item.id === change.messageId ? withReaction(item, change) : item,
          ),
        };
      }),
    };
  });
  const isPreview = (item: Conversation) =>
    item.id === change.conversationId && item.lastMessage?.id === change.messageId;
  updateNowAndAfterFetch<Conversation[]>(client, conversationsKey, (data) => {
    const at = data?.findIndex(isPreview) ?? -1;
    const current = at >= 0 ? data?.[at] : undefined;
    if (!data || !current?.lastMessage) return data;
    const lastMessage = withReaction(current.lastMessage, change);
    if (lastMessage === current.lastMessage) return data;
    return data.map((item, index) => (index === at ? { ...item, lastMessage } : item));
  });
}
