import { useChatConnection } from '@/lib/realtime/connectionStore';

/**
 * Stand-in for `@/lib/realtime/chatSocket` (the real one imports the auth client):
 *
 *   jest.mock('@/lib/realtime/chatSocket', () =>
 *     jest.requireActual('@/test-utils/fakeChatSocket'),
 *   );
 *
 * Tests drive the server side by hand: `connect()` / `drop()`, `fire(event, payload)` and
 * `acks` to answer (or fail) the requests the code under test made.
 */

type Handler = (...args: never[]) => void;

export type FakeAck = {
  event: string;
  payload: unknown;
  timeoutMs: number | undefined;
  resolve(response: unknown): void;
  reject(error: Error): void;
};

class FakeChatSocket {
  connected = false;
  started = false;
  /** Requests waiting for an answer; settled ones are removed. */
  acks: FakeAck[] = [];
  /** Every request made, answered or not, in order. */
  ackLog: { event: string; payload: unknown }[] = [];
  /** Fire-and-forget events sent while connected. */
  emitted: { event: string; payload: unknown }[] = [];
  private handlers = new Map<string, Set<Handler>>();
  private connectedHandlers = new Set<() => void>();

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
    this.drop('stopped');
  }

  reconnectNow(): void {}

  emitWithAck<T>(event: string, payload: unknown, timeoutMs?: number): Promise<T> {
    this.ackLog.push({ event, payload });
    if (!this.connected) return Promise.reject(new Error('disconnected'));
    return new Promise<T>((resolve, reject) => {
      const entry: FakeAck = {
        event,
        payload,
        timeoutMs,
        resolve: (response) => {
          this.acks = this.acks.filter((item) => item !== entry);
          resolve(response as T);
        },
        reject: (error) => {
          this.acks = this.acks.filter((item) => item !== entry);
          reject(error);
        },
      };
      this.acks.push(entry);
    });
  }

  emit(event: string, payload: unknown): boolean {
    if (!this.connected) return false;
    this.emitted.push({ event, payload });
    return true;
  }

  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  onConnected(handler: () => void): () => void {
    this.connectedHandlers.add(handler);
    return () => {
      this.connectedHandlers.delete(handler);
    };
  }

  // ---------- test controls ----------

  /** The server accepted a (re)connection. */
  connect(): void {
    this.connected = true;
    useChatConnection.setState({ status: 'connected', attempt: 0 });
    for (const handler of [...this.connectedHandlers]) handler();
  }

  /** The connection dropped: every pending request rejects like the real socket does. */
  drop(status: 'waiting' | 'stopped' = 'waiting'): void {
    this.connected = false;
    useChatConnection.setState({ status, attempt: 0 });
    for (const entry of [...this.acks]) entry.reject(new Error('disconnected'));
  }

  /** A server → client event. */
  fire(event: string, ...args: unknown[]): void {
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      (handler as (...values: unknown[]) => void)(...args);
    }
  }

  /** The oldest pending request for `event`. */
  pendingAck(event: string): FakeAck | undefined {
    return this.acks.find((entry) => entry.event === event);
  }

  listenerCount(): number {
    let count = this.connectedHandlers.size;
    for (const set of this.handlers.values()) count += set.size;
    return count;
  }

  reset(): void {
    this.drop('stopped');
    this.started = false;
    this.acks = [];
    this.ackLog = [];
    this.emitted = [];
    this.handlers.clear();
    this.connectedHandlers.clear();
  }
}

export const chatSocket = new FakeChatSocket();
