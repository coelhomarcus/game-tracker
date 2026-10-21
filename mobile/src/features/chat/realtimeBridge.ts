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
 * the open conversation. Started and stopped with the connection by `SessionGate`.
 */
class RealtimeBridge {
  private subscriptions: (() => void)[] = [];
  private running = false;
  /** Changes on every start/stop so answers to an earlier run's requests are dropped. */
  private generation = 0;
  private connectedBefore = false;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.connectedBefore = false;
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
    chat().clearLive();
  }

  private handleConnected(): void {
    const store = chat();
    store.resendPending();
    const open = store.openConversationId;
    if (open) this.join(open);
    // Whatever arrived while disconnected is only on the server.
    if (this.connectedBefore) {
      void queryClient.invalidateQueries({ queryKey: conversationsKey });
      if (open) void queryClient.invalidateQueries({ queryKey: messagesKey(open) });
    }
    this.connectedBefore = true;
  }

  private handleOpenChanged(previous: string | null, next: string | null): void {
    if (previous) chatSocket.emit('conversation:leave', { conversationId: previous });
    if (next) this.join(next);
  }

  /** Joins the room (needed for its events and typing), then asks who in it is online. */
  private join(conversationId: string): void {
    const run = this.generation;
    chatSocket
      .emitWithAck<{ ok?: boolean; error?: unknown }>('conversation:join', { conversationId })
      .then((ack) => {
        if (run !== this.generation || !ack?.ok) return;
        if (chat().openConversationId !== conversationId) return;
        this.refreshPresence(conversationId);
      })
      // Not connected or no answer: the next connect joins again.
      .catch(() => undefined);
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

    if (open && !mine) {
      markReadInList(queryClient, conversationId);
      chatApi.markRead(conversationId).catch(() => undefined);
    }
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
