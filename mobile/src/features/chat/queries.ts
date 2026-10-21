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

/** Marks the conversation read on the server, and in the list right away. */
export function useMarkRead(conversationId: string) {
  const client = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => chatApi.markRead(conversationId),
    onMutate: () => markReadInList(client, conversationId),
    // The list's unread flag comes from the server; let it say again.
    onError: () => {
      void client.invalidateQueries({ queryKey: conversationsKey });
    },
  });
}

// ---------- cache updates from the socket ----------

/**
 * Applies `update` now, and again once a fetch already in flight lands: that response may have
 * been read before the change existed and would otherwise overwrite it. `update` must be
 * idempotent.
 */
function updateNowAndAfterFetch<T>(
  client: QueryClient,
  key: QueryKey,
  update: (data: T | undefined) => T | undefined,
): void {
  client.setQueryData<T>(key, update);
  const inFlight = client.getQueryCache().find({ queryKey: key, exact: true })?.promise;
  if (!inFlight) return;
  void inFlight
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => client.setQueryData<T>(key, update));
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

export function markReadInList(client: QueryClient, conversationId: string): void {
  client.setQueryData<Conversation[]>(conversationsKey, (data) =>
    data?.some((item) => item.id === conversationId && item.unread)
      ? data.map((item) => (item.id === conversationId ? { ...item, unread: false } : item))
      : data,
  );
}
