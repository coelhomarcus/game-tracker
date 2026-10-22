import { useSession } from '@/features/auth';
import { queryClient } from '@/lib/queryClient';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { useChatConnection } from '@/lib/realtime/connectionStore';

import { chatApi } from './api';
import { useChatStore } from './chatStore';
import {
  addMessagesToCache,
  applyLatestMessage,
  conversationsKey,
  markReadInList,
  messagesKey,
} from './queries';
import { parseMessage, type Conversation } from './types';

type Json = Record<string, unknown>;

const isJson = (value: unknown): value is Json => typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string => typeof value === 'string' && value !== '';

const myId = () => useSession.getState().user?.id;
const chat = () => useChatStore.getState();

/**
 * Applies socket events to the chat store and the query cache while the connection runs: new
 * messages, typing, presence, and on every (re)connect re-sends unconfirmed messages and re-joins
 * the open conversation. Every join of the open conversation is followed by a refetch of its
 * messages (whatever was sent while outside the room only reached the server) and then by one
 * read mark. Started and stopped with the connection by `SessionGate`.
 */
class RealtimeBridge {
  private subscriptions: (() => void)[] = [];
  private running = false;
  /** Changes on every start/stop so answers to an earlier run's requests are dropped. */
  private generation = 0;
  private connectedBefore = false;
  /** Changes on every join, so only the newest join's catch-up marks the conversation read. */
  private joins = 0;
  /** Conversations with a read request in flight; `true` when another is due after it. */
  private reads = new Map<string, boolean>();

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.connectedBefore = false;
    this.reads.clear();
    this.subscriptions = [
      chatSocket.on('message:receive', (payload: unknown) => this.handleMessage(payload)),
      chatSocket.on('typing:start', (payload: unknown) => this.handleTyping(payload, true)),
      chatSocket.on('typing:stop', (payload: unknown) => this.handleTyping(payload, false)),
      chatSocket.on('presence:online', (payload: unknown) => this.handlePresence(payload, true)),
      chatSocket.on('presence:offline', (payload: unknown) => this.handlePresence(payload, false)),
      chatSocket.onConnected(() => this.handleConnected()),
      useChatStore.subscribe((state, previous) => {
        if (state.openConversationId !== previous.openConversationId) {
          this.handleOpenChanged(previous.openConversationId, state.openConversationId);
        }
      }),
    ];
    const open = chat().openConversationId;
    if (open && useChatConnection.getState().status === 'connected') this.join(open);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions = [];
    this.reads.clear();
    chat().clearLive();
  }

  private handleConnected(): void {
    const store = chat();
    store.resendPending();
    const open = store.openConversationId;
    // The open conversation's messages are refetched once the join answers.
    if (open) this.join(open);
    // Whatever arrived while disconnected is only on the server.
    if (this.connectedBefore) void queryClient.invalidateQueries({ queryKey: conversationsKey });
    this.connectedBefore = true;
  }

  private handleOpenChanged(previous: string | null, next: string | null): void {
    if (previous) chatSocket.emit('conversation:leave', { conversationId: previous });
    if (next) this.join(next);
  }

  /**
   * Joins the room (needed for its events and typing), then asks who in it is online and catches
   * up on the messages sent while outside it.
   */
  private join(conversationId: string): void {
    const run = this.generation;
    const ticket = ++this.joins;
    const key = messagesKey(conversationId);
    const requestedAt = Date.now();
    // A fetch already running may have read the server before the room was joined.
    const fetchingBefore = queryClient.getQueryState(key)?.fetchStatus === 'fetching';
    chatSocket
      .emitWithAck<{ ok?: boolean; error?: unknown }>('conversation:join', { conversationId })
      .then((ack) => {
        if (run !== this.generation || !ack?.ok) return;
        if (chat().openConversationId !== conversationId) return;
        this.refreshPresence(conversationId);
        const current = () =>
          run === this.generation &&
          ticket === this.joins &&
          chat().openConversationId === conversationId;
        void this.catchUp(conversationId, requestedAt, fetchingBefore, current);
      })
      // Not connected or no answer: the next connect joins again.
      .catch(() => undefined);
  }

  /**
   * Refetches the joined conversation's messages, unless a fetch that started after the join was
   * requested already brought them, and marks it read once they are loaded. Local merges keep
   * `dataUpdatedAt` (see `addMessagesToCache`), so it only moves with server fetches.
   */
  private async catchUp(
    conversationId: string,
    requestedAt: number,
    fetchingBefore: boolean,
    current: () => boolean,
  ): Promise<void> {
    const key = messagesKey(conversationId);
    const before = queryClient.getQueryState(key);
    // Nothing loaded means nothing on screen to read.
    if (!before) return;
    if (fetchingBefore || before.dataUpdatedAt <= requestedAt) {
      // Replaces a fetch in flight; a fetch that replaces this one is waited for as well.
      await queryClient.refetchQueries({ queryKey: key, exact: true });
    }
    if (!current()) return;
    // Read only what was loaded: a failed refetch leaves the missed messages unseen.
    const after = queryClient.getQueryState(key);
    if (after?.status !== 'success' || after.fetchStatus !== 'idle') return;
    if (after.fetchFailureCount > 0) return;
    this.markRead(conversationId);
  }

  /**
   * Marks a conversation read in the list now and on the server, with at most one request in
   * flight per conversation: marks asked for meanwhile become a single one after it settles.
   */
  private markRead(conversationId: string): void {
    markReadInList(queryClient, conversationId);
    if (this.reads.has(conversationId)) {
      this.reads.set(conversationId, true);
      return;
    }
    this.reads.set(conversationId, false);
    const run = this.generation;
    chatApi
      .markRead(conversationId)
      // The list's unread flag comes from the server; let it say again.
      .catch(() => queryClient.invalidateQueries({ queryKey: conversationsKey }))
      .catch(() => undefined)
      .finally(() => {
        if (run !== this.generation) return;
        const again = this.reads.get(conversationId) === true;
        this.reads.delete(conversationId);
        if (again) this.markRead(conversationId);
      });
  }

  private refreshPresence(conversationId: string): void {
    const run = this.generation;
    chatSocket
      .emitWithAck<{ online?: unknown }>('presence:get', { conversationId })
      .then((ack) => {
        if (run !== this.generation || !Array.isArray(ack?.online)) return;
        const online = ack.online.filter(isString);
        const conversation = queryClient
          .getQueryData<Conversation[]>(conversationsKey)
          ?.find((item) => item.id === conversationId);
        const otherId = conversation?.otherUser?.id;
        const store = chat();
        for (const userId of online) store.setOnline(userId, true);
        if (otherId && !online.includes(otherId)) store.setOnline(otherId, false);
      })
      // Unknown stays unknown: a failed query does not mean offline.
      .catch(() => undefined);
  }

  private handleMessage(payload: unknown): void {
    if (!isJson(payload) || !isString(payload.id) || !isString(payload.conversationId)) return;
    if (!isString(payload.senderId)) return;
    const message = parseMessage(payload);
    const { conversationId } = message;
    const mine = message.senderId === myId();
    const store = chat();
    const open = store.openConversationId === conversationId;

    if (mine && message.clientMessageId) {
      store.confirmPending(conversationId, message.clientMessageId);
    }
    if (!mine) store.setTyping(conversationId, false);
    addMessagesToCache(queryClient, conversationId, [message]);
    applyLatestMessage(queryClient, message, !mine && !open);

    if (open && !mine) this.markRead(conversationId);
  }

  private handleTyping(payload: unknown, typing: boolean): void {
    if (!isJson(payload) || !isString(payload.conversationId)) return;
    if (payload.userId === myId()) return;
    chat().setTyping(payload.conversationId, typing);
  }

  private handlePresence(payload: unknown, online: boolean): void {
    if (!isJson(payload) || !isString(payload.userId)) return;
    chat().setOnline(payload.userId, online);
  }
}

export const realtimeBridge = new RealtimeBridge();
