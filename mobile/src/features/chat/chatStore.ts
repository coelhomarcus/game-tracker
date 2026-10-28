import { create } from 'zustand';

import { DM_NOT_ALLOWED_MESSAGE, useSession } from '@/features/auth';
import { queryClient } from '@/lib/queryClient';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { newUuid } from '@/lib/uuid';

import { addMessagesToCache, applyLatestMessage } from './queries';
import { parseMessage, type Message, type ReplyTo } from './types';

export const MAX_MESSAGE_LENGTH = 2000;
/** A `typing:start` without a `typing:stop` (the other side dropped) expires after this. */
export const TYPING_TIMEOUT_MS = 6000;

export type PendingStatus = 'sending' | 'uncertain' | 'failed';

/** A message written here that the server has not confirmed yet. */
export type PendingMessage = {
  clientMessageId: string;
  content: string;
  createdAt: Date;
  /** `uncertain`: no answer (timeout or drop); it may be stored, and is re-sent on reconnect. */
  status: PendingStatus;
  error?: string;
  /**
   * Set when the server refused it for good (a block, the recipient's message policy, or the
   * message it replies to is gone).
   */
  refusal?: string;
  /** The message it replies to: goes out on every (re)send, so a repeat stays the same send. */
  replyToId?: string;
  /** The quote shown above it; dropped when I delete the original for me (the id stays). */
  replyTo?: ReplyTo;
};

type SendAck =
  | { message?: Record<string, unknown> | null; error?: unknown; code?: unknown }
  | null
  | undefined;

/**
 * Refusals that sending again would not change: shown as the reason the message failed. Like every
 * failure, they are only sent again when the user asks.
 */
export const SEND_REFUSALS = {
  blocked: 'Não é possível enviar mensagens para esta conta.',
  dm_not_allowed: DM_NOT_ALLOWED_MESSAGE,
  reply_not_found: 'A mensagem respondida não está mais disponível.',
} as const;

function refusalReason(code: unknown): string | undefined {
  return code === 'blocked' || code === 'dm_not_allowed' || code === 'reply_not_found'
    ? SEND_REFUSALS[code]
    : undefined;
}

type ChatState = {
  pending: Record<string, PendingMessage[]>;
  drafts: Record<string, string>;
  /** The message each conversation's composer is replying to. */
  replying: Record<string, ReplyTo>;
  typing: Record<string, boolean>;
  online: Record<string, boolean>;
  /** The conversation on screen; the realtime bridge joins its room. */
  openConversationId: string | null;

  setDraft(conversationId: string, text: string): void;
  /**
   * Sends trimmed text (1–2000 chars) and clears the draft. A reply being written goes with it
   * (and is cleared too). Returns the clientMessageId.
   */
  send(conversationId: string, text: string): string | null;
  /** The composer replies to `replyTo` until it is sent or cancelled. */
  startReply(conversationId: string, replyTo: ReplyTo): void;
  /** Stops replying; with `messageId`, only when replying to that message. */
  cancelReply(conversationId: string, messageId?: string): void;
  /**
   * I deleted a message for me: a reply being written to it stops, and pending replies to it
   * lose its quote (they still go out as replies, and the server decides).
   */
  messageHidden(conversationId: string, messageId: string): void;
  retry(conversationId: string, clientMessageId: string): void;
  discard(conversationId: string, clientMessageId: string): void;
  /** Unsent text that signing out would lose: non-blank drafts plus pending messages. */
  draftCount(): number;
  setOpenConversation(conversationId: string | null): void;

  // Used by the realtime bridge.
  /** Re-sends every `sending` and `uncertain` message with its original clientMessageId. */
  resendPending(): void;
  /** A message of mine reached the server (event or ack): its pending copy goes away. */
  confirmPending(conversationId: string, clientMessageId: string): void;
  setTyping(conversationId: string, typing: boolean): void;
  setOnline(userId: string, online: boolean): void;
  /** Forgets typing and presence (connection stopped). */
  clearLive(): void;
  clear(): void;
};

const initialData = {
  pending: {},
  drafts: {},
  replying: {},
  typing: {},
  online: {},
  openConversationId: null,
} satisfies Partial<ChatState>;

/** Changes on `clear` so acks of a previous session are ignored. */
let generation = 0;
/** clientMessageIds with a `message:send` waiting for its ack. */
const inFlight = new Set<string>();
const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function clearTypingTimers(): void {
  for (const timer of typingTimers.values()) clearTimeout(timer);
  typingTimers.clear();
}

export const useChatStore = create<ChatState>((set, get) => {
  const find = (conversationId: string, clientMessageId: string) =>
    get().pending[conversationId]?.find((item) => item.clientMessageId === clientMessageId);

  const updatePending = (
    conversationId: string,
    clientMessageId: string,
    change: (item: PendingMessage) => PendingMessage,
  ) =>
    set((state) => {
      const list = state.pending[conversationId];
      if (!list?.some((item) => item.clientMessageId === clientMessageId)) return state;
      return {
        pending: {
          ...state.pending,
          [conversationId]: list.map((item) =>
            item.clientMessageId === clientMessageId ? change(item) : item,
          ),
        },
      };
    });

  const removePending = (conversationId: string, clientMessageId: string) =>
    set((state) => {
      const list = state.pending[conversationId];
      if (!list?.some((item) => item.clientMessageId === clientMessageId)) return state;
      const rest = list.filter((item) => item.clientMessageId !== clientMessageId);
      return {
        pending:
          rest.length > 0
            ? { ...state.pending, [conversationId]: rest }
            : without(state.pending, conversationId),
      };
    });

  const confirmed = (message: Message) => {
    if (message.clientMessageId) removePending(message.conversationId, message.clientMessageId);
    addMessagesToCache(queryClient, message.conversationId, [message]);
    applyLatestMessage(queryClient, message, false);
  };

  async function deliver(conversationId: string, clientMessageId: string): Promise<void> {
    const item = find(conversationId, clientMessageId);
    if (!item || inFlight.has(clientMessageId)) return;
    inFlight.add(clientMessageId);
    const run = generation;
    updatePending(conversationId, clientMessageId, ({ error: _error, refusal: _refusal, ...rest }) => ({
      ...rest,
      status: 'sending',
    }));
    let ack: SendAck;
    try {
      ack = await chatSocket.emitWithAck<SendAck>('message:send', {
        conversationId,
        content: item.content,
        clientMessageId,
        ...(item.replyToId ? { replyToId: item.replyToId } : {}),
      });
    } catch {
      // Timeout or drop: the server may have stored it. Re-sending the same id is safe.
      if (run !== generation) return;
      inFlight.delete(clientMessageId);
      updatePending(conversationId, clientMessageId, (current) => ({
        ...current,
        status: 'uncertain',
      }));
      return;
    }
    if (run !== generation) return;
    inFlight.delete(clientMessageId);
    if (ack?.message) {
      // Stored even if it was discarded meanwhile, so it shows like any other server message.
      confirmed(parseMessage(ack.message));
      return;
    }
    const refusal = refusalReason(ack?.code);
    const error = refusal ?? (typeof ack?.error === 'string' ? ack.error : 'Erro desconhecido');
    updatePending(conversationId, clientMessageId, (current) => ({
      ...current,
      status: 'failed',
      error,
      ...(refusal ? { refusal } : {}),
    }));
  }

  return {
    ...initialData,

    setDraft(conversationId, text) {
      set((state) => ({
        drafts:
          text === ''
            ? without(state.drafts, conversationId)
            : { ...state.drafts, [conversationId]: text },
      }));
    },

    send(conversationId, text) {
      const content = text.trim();
      if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return null;
      const clientMessageId = newUuid();
      const replyTo = get().replying[conversationId];
      const item: PendingMessage = {
        clientMessageId,
        content,
        createdAt: new Date(),
        status: 'sending',
        ...(replyTo ? { replyToId: replyTo.id, replyTo } : {}),
      };
      set((state) => ({
        pending: {
          ...state.pending,
          [conversationId]: [...(state.pending[conversationId] ?? []), item],
        },
        drafts: without(state.drafts, conversationId),
        replying: without(state.replying, conversationId),
      }));
      void deliver(conversationId, clientMessageId);
      return clientMessageId;
    },

    startReply(conversationId, replyTo) {
      set((state) => ({ replying: { ...state.replying, [conversationId]: replyTo } }));
    },

    cancelReply(conversationId, messageId) {
      set((state) => {
        const current = state.replying[conversationId];
        if (!current || (messageId !== undefined && current.id !== messageId)) return state;
        return { replying: without(state.replying, conversationId) };
      });
    },

    messageHidden(conversationId, messageId) {
      get().cancelReply(conversationId, messageId);
      set((state) => {
        const list = state.pending[conversationId];
        if (!list?.some((item) => item.replyTo?.id === messageId)) return state;
        return {
          pending: {
            ...state.pending,
            [conversationId]: list.map((item) => {
              if (item.replyTo?.id !== messageId) return item;
              const { replyTo: _quote, ...rest } = item;
              return rest;
            }),
          },
        };
      });
    },

    retry(conversationId, clientMessageId) {
      const item = find(conversationId, clientMessageId);
      if (!item || item.status === 'sending') return;
      void deliver(conversationId, clientMessageId);
    },

    discard(conversationId, clientMessageId) {
      removePending(conversationId, clientMessageId);
    },

    draftCount() {
      const { drafts, pending } = get();
      const written = Object.values(drafts).filter((text) => text.trim().length > 0).length;
      const unsent = Object.values(pending).reduce((total, list) => total + list.length, 0);
      return written + unsent;
    },

    setOpenConversation(conversationId) {
      set({ openConversationId: conversationId });
    },

    resendPending() {
      for (const [conversationId, list] of Object.entries(get().pending)) {
        for (const item of list) {
          if (item.status !== 'failed') void deliver(conversationId, item.clientMessageId);
        }
      }
    },

    confirmPending(conversationId, clientMessageId) {
      removePending(conversationId, clientMessageId);
    },

    setTyping(conversationId, typing) {
      const timer = typingTimers.get(conversationId);
      if (timer) clearTimeout(timer);
      typingTimers.delete(conversationId);
      if (typing) {
        typingTimers.set(
          conversationId,
          setTimeout(() => get().setTyping(conversationId, false), TYPING_TIMEOUT_MS),
        );
      }
      set((state) => {
        if ((state.typing[conversationId] ?? false) === typing) return state;
        return {
          typing: typing
            ? { ...state.typing, [conversationId]: true }
            : without(state.typing, conversationId),
        };
      });
    },

    setOnline(userId, online) {
      set((state) =>
        state.online[userId] === online ? state : { online: { ...state.online, [userId]: online } },
      );
    },

    clearLive() {
      clearTypingTimers();
      set({ typing: {}, online: {} });
    },

    clear() {
      generation += 1;
      inFlight.clear();
      clearTypingTimers();
      set(initialData);
    },
  };
});

// Drafts and unsent messages belong to the account that wrote them.
useSession.subscribe((state, previous) => {
  if (state.status === 'signedOut' && previous.status !== 'signedOut') {
    useChatStore.getState().clear();
  }
});
