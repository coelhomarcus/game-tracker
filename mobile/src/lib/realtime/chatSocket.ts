import { AppState, type NativeEventSubscription } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { sessionManager } from '@/features/auth/client';
import { apiOrigin } from '@/lib/env';

import { useChatConnection, type ChatConnectionStatus } from './connectionStore';

type Handler = (...args: never[]) => void;

/** Waits between failed attempts: 1 s, 2 s, 5 s, 10 s, then 30 s. */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
/** Refreshes in a row that may be followed by an immediate retry before backing off. */
const MAX_IMMEDIATE_REFRESH_RETRIES = 2;
const DEFAULT_ACK_TIMEOUT_MS = 10_000;
/** How long one connection attempt may take before it counts as failed. */
const ATTEMPT_TIMEOUT_MS = 15_000;

export function backoffDelay(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1];
}

type Pending = { reject: (error: Error) => void };

/**
 * One authenticated Socket.IO connection for the whole app.
 *
 * The built-in reconnection is off: it would resend the access token the socket was created
 * with, which expires. Here every attempt reads the current token, and a rejected token goes
 * through the session refresh first. `generation` changes on every start/stop so callbacks from
 * an earlier run (late errors, refresh results, timers) are dropped.
 */
class ChatSocket {
  private socket: Socket | null = null;
  private running = false;
  private generation = 0;
  private attempt = 0;
  private refreshRetries = 0;
  /** The token of the attempt in flight, to tell the session which one was rejected. */
  private usedToken: string | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attemptTimer: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private readonly connectedHandlers = new Set<() => void>();
  private readonly pending = new Set<Pending>();

  /** Idempotent: connects and keeps the connection alive until `stop`. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.generation += 1;
    this.attempt = 0;
    this.refreshRetries = 0;
    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useChatConnection.getState().status === 'waiting') {
        this.reconnectNow();
      }
    });
    this.connect();
  }

  /** Disconnects for good (sign-out, user switch) and ignores anything still in flight. */
  stop(): void {
    this.running = false;
    this.generation += 1;
    this.clearRetryTimer();
    this.clearAttemptTimer();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.attempt = 0;
    this.refreshRetries = 0;
    this.setStatus('stopped');
    this.socket?.disconnect();
    this.rejectPending();
  }

  /** Skips the backoff wait (app back in the foreground, "try again") or starts when stopped. */
  reconnectNow(): void {
    if (!this.running) {
      this.start();
      return;
    }
    if (useChatConnection.getState().status !== 'waiting') return;
    this.clearRetryTimer();
    this.connect();
  }

  emitWithAck<T>(event: string, payload: unknown, timeoutMs = DEFAULT_ACK_TIMEOUT_MS): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) return Promise.reject(new Error('disconnected'));
    return new Promise<T>((resolve, reject) => {
      const entry: Pending = {
        reject: (error) => {
          clearTimeout(timer);
          this.pending.delete(entry);
          reject(error);
        },
      };
      const timer = setTimeout(() => entry.reject(new Error('timeout')), timeoutMs);
      this.pending.add(entry);
      socket.emit(event, payload, (response: T) => {
        if (!this.pending.delete(entry)) return;
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  /**
   * Fire-and-forget, for events the server never acknowledges (`conversation:leave`, typing).
   * Dropped while disconnected: the server forgets rooms and typing state with the connection.
   */
  emit(event: string, payload: unknown): boolean {
    const socket = this.socket;
    if (!socket?.connected) return false;
    socket.emit(event, payload);
    return true;
  }

  /** Listens to a server event; the handler survives reconnects. Returns the unsubscribe. */
  on(event: string, handler: Handler): () => void {
    const socket = this.ensureSocket();
    socket.on(event, handler as never);
    return () => {
      socket.off(event, handler as never);
    };
  }

  /** Runs after every successful (re)connect, e.g. to rejoin rooms and flush pending sends. */
  onConnected(handler: () => void): () => void {
    this.connectedHandlers.add(handler);
    return () => {
      this.connectedHandlers.delete(handler);
    };
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;
    const socket = io(apiOrigin, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      auth: { token: sessionManager.accessToken },
    });
    socket.on('connect', () => this.handleConnect());
    socket.on('connect_error', (error: Error) => this.handleConnectError(error));
    socket.on('disconnect', () => this.handleDisconnect());
    this.socket = socket;
    return socket;
  }

  private connect(): void {
    // The token is read here, not when the socket was created, so a user switch or a refresh
    // never reconnects with an old one.
    const token = sessionManager.accessToken;
    if (!token) {
      this.stop();
      return;
    }
    const socket = this.ensureSocket();
    this.usedToken = token;
    socket.auth = { token };
    this.setStatus('connecting');
    this.startAttemptTimer();
    socket.connect();
  }

  /** A handshake the server never answers is not covered by the transport's own timeout. */
  private startAttemptTimer(): void {
    this.clearAttemptTimer();
    const generation = this.generation;
    this.attemptTimer = setTimeout(() => {
      this.attemptTimer = null;
      if (generation !== this.generation || !this.running) return;
      if (useChatConnection.getState().status !== 'connecting') return;
      // Schedule first so the disconnect this triggers is seen as already handled.
      this.scheduleRetry();
      this.socket?.disconnect();
    }, ATTEMPT_TIMEOUT_MS);
  }

  private clearAttemptTimer(): void {
    if (this.attemptTimer) clearTimeout(this.attemptTimer);
    this.attemptTimer = null;
  }

  private handleConnect(): void {
    this.clearAttemptTimer();
    if (!this.running) {
      this.socket?.disconnect();
      return;
    }
    this.attempt = 0;
    this.refreshRetries = 0;
    this.setStatus('connected');
    for (const handler of [...this.connectedHandlers]) {
      try {
        handler();
      } catch {
        // One failing subscriber must not stop the others.
      }
    }
  }

  private handleDisconnect(): void {
    this.rejectPending();
    this.clearAttemptTimer();
    if (!this.running) return;
    const { status } = useChatConnection.getState();
    // A drop after being connected retries at once; the backoff covers failed attempts.
    if (status === 'connected') this.connect();
    // The transport closed before the handshake finished, which reports no connect_error.
    else if (status === 'connecting') this.scheduleRetry();
  }

  private handleConnectError(error: Error): void {
    this.clearAttemptTimer();
    if (!this.running) return;
    const generation = this.generation;
    if (error.message === 'unauthorized') {
      void this.refreshAndRetry(generation);
      return;
    }
    this.scheduleRetry();
  }

  private async refreshAndRetry(generation: number): Promise<void> {
    let outcome: Awaited<ReturnType<typeof sessionManager.refreshAfterUnauthorized>>;
    try {
      outcome = await sessionManager.refreshAfterUnauthorized(this.usedToken);
    } catch {
      outcome = 'unavailable';
    }
    if (generation !== this.generation || !this.running) return;
    if (outcome === 'invalid') {
      // The session ends through `onExpired`; there is nothing left to connect with.
      this.stop();
      return;
    }
    // A drop while the refresh was running already scheduled the next attempt.
    if (useChatConnection.getState().status !== 'connecting') return;
    // The server may reject for another reason too, so immediate retries are capped.
    if (outcome === 'refreshed' && this.refreshRetries < MAX_IMMEDIATE_REFRESH_RETRIES) {
      this.refreshRetries += 1;
      this.connect();
      return;
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    this.attempt += 1;
    this.setStatus('waiting');
    this.clearRetryTimer();
    const generation = this.generation;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (generation !== this.generation || !this.running) return;
      this.connect();
    }, backoffDelay(this.attempt));
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private rejectPending(): void {
    for (const entry of [...this.pending]) entry.reject(new Error('disconnected'));
  }

  private setStatus(status: ChatConnectionStatus): void {
    useChatConnection.setState({ status, attempt: this.attempt });
  }
}

export const chatSocket = new ChatSocket();
