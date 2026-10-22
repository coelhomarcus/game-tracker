import { AppState } from 'react-native';

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  auth: { token?: string | null } = {};
  emitted: { event: string; payload: unknown; ack?: Handler }[] = [];
  connectTokens: (string | null | undefined)[] = [];
  private handlers = new Map<string, Set<Handler>>();

  connect = jest.fn(() => {
    this.connectTokens.push(this.auth.token);
    return this;
  });
  disconnect = jest.fn(() => {
    const wasConnected = this.connected;
    this.connected = false;
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
    return this;
  });
  emit = jest.fn((event: string, payload: unknown, ack?: Handler) => {
    this.emitted.push({ event, payload, ack });
    return this;
  });
  on = jest.fn((event: string, handler: Handler) => {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)?.add(handler);
    return this;
  });
  off = jest.fn((event: string, handler?: Handler) => {
    if (handler) this.handlers.get(event)?.delete(handler);
    else this.handlers.delete(event);
    return this;
  });

  fire(event: string, ...args: unknown[]) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(...args);
  }
  serverAccepts() {
    this.connected = true;
    this.fire('connect');
  }
  serverRejects(message = 'xhr poll error') {
    this.fire('connect_error', new Error(message));
  }
  serverDrops(reason = 'transport close') {
    this.connected = false;
    this.fire('disconnect', reason);
  }
}

const mockSockets: FakeSocket[] = [];
const mockIo = jest.fn((..._args: unknown[]) => {
  const fake = new FakeSocket();
  mockSockets.push(fake);
  return fake;
});
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));

const mockSession = {
  accessToken: 'token-1' as string | null,
  refreshAfterUnauthorized: jest.fn(),
};
jest.mock('@/features/auth/client', () => ({ sessionManager: mockSession }));
jest.mock('@/lib/env', () => ({ apiOrigin: 'http://api.test' }));

let appStateListener: ((state: string) => void) | undefined;
const removeAppState = jest.fn();

type ChatSocketModule = typeof import('../chatSocket');
type StoreModule = typeof import('../connectionStore');
let chat: ChatSocketModule['chatSocket'];
let store: StoreModule['useChatConnection'];

function socket(): FakeSocket {
  return mockSockets[mockSockets.length - 1];
}
function state() {
  const { status, attempt } = store.getState();
  return { status, attempt };
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  jest.resetModules();
  mockSockets.length = 0;
  mockIo.mockClear();
  mockSession.accessToken = 'token-1';
  mockSession.refreshAfterUnauthorized.mockReset();
  removeAppState.mockClear();
  appStateListener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: never) => {
    appStateListener = listener;
    return { remove: removeAppState };
  }) as never);
  chat = jest.requireActual<ChatSocketModule>('../chatSocket').chatSocket;
  store = jest.requireActual<StoreModule>('../connectionStore').useChatConnection;
});

afterEach(() => {
  chat.stop();
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('chatSocket', () => {
  it('starts connecting with the current token and the configured options', () => {
    chat.start();

    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(mockIo.mock.calls[0][0]).toBe('http://api.test');
    expect(mockIo.mock.calls[0][1]).toMatchObject({
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    expect(socket().connectTokens).toEqual(['token-1']);
    expect(state()).toEqual({ status: 'connecting', attempt: 0 });

    socket().serverAccepts();
    expect(state()).toEqual({ status: 'connected', attempt: 0 });
  });

  it('is idempotent while running', () => {
    chat.start();
    chat.start();

    expect(socket().connect).toHaveBeenCalledTimes(1);
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('backs off 1s, 2s, 5s, 10s and then 30s between failed attempts', () => {
    chat.start();
    const delays = [1000, 2000, 5000, 10_000, 30_000, 30_000];

    delays.forEach((delay, index) => {
      socket().serverRejects();
      expect(state()).toEqual({ status: 'waiting', attempt: index + 1 });
      expect(socket().connect).toHaveBeenCalledTimes(index + 1);

      jest.advanceTimersByTime(delay - 1);
      expect(socket().connect).toHaveBeenCalledTimes(index + 1);
      jest.advanceTimersByTime(1);
      expect(socket().connect).toHaveBeenCalledTimes(index + 2);
      expect(state().status).toBe('connecting');
    });

    socket().serverAccepts();
    expect(state()).toEqual({ status: 'connected', attempt: 0 });
  });

  it('reads the access token again before every attempt', () => {
    chat.start();
    socket().serverRejects();
    mockSession.accessToken = 'token-2';
    jest.advanceTimersByTime(1000);

    expect(socket().connectTokens).toEqual(['token-1', 'token-2']);
    expect(socket().auth).toEqual({ token: 'token-2' });
  });

  it('refreshes once on unauthorized and reconnects with the new token', async () => {
    mockSession.refreshAfterUnauthorized.mockImplementation(async () => {
      mockSession.accessToken = 'token-2';
      return 'refreshed';
    });
    chat.start();
    socket().serverRejects('unauthorized');
    await jest.advanceTimersByTimeAsync(0);

    expect(mockSession.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
    expect(mockSession.refreshAfterUnauthorized).toHaveBeenCalledWith('token-1');
    expect(socket().connectTokens).toEqual(['token-1', 'token-2']);

    socket().serverAccepts();
    expect(state().status).toBe('connected');
    expect(mockSession.refreshAfterUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('stops when the refresh says the session is invalid', async () => {
    mockSession.refreshAfterUnauthorized.mockResolvedValue('invalid');
    chat.start();
    socket().serverRejects('unauthorized');
    await jest.advanceTimersByTimeAsync(0);

    expect(state().status).toBe('stopped');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(socket().connect).toHaveBeenCalledTimes(1);
  });

  it('backs off when the refresh is unavailable', async () => {
    mockSession.refreshAfterUnauthorized.mockResolvedValue('unavailable');
    chat.start();
    socket().serverRejects('unauthorized');
    await jest.advanceTimersByTimeAsync(0);

    expect(state()).toEqual({ status: 'waiting', attempt: 1 });
    await jest.advanceTimersByTimeAsync(1000);
    expect(socket().connect).toHaveBeenCalledTimes(2);
  });

  it('does not loop on unauthorized forever when refreshes keep succeeding', async () => {
    mockSession.refreshAfterUnauthorized.mockResolvedValue('refreshed');
    chat.start();
    for (let i = 0; i < 3; i += 1) {
      socket().serverRejects('unauthorized');
      await jest.advanceTimersByTimeAsync(0);
    }

    expect(state().status).toBe('waiting');
  });

  it('retries immediately once after a drop while connected', () => {
    chat.start();
    socket().serverAccepts();
    socket().serverDrops();

    expect(socket().connect).toHaveBeenCalledTimes(2);
    expect(state().status).toBe('connecting');

    socket().serverRejects();
    expect(state()).toEqual({ status: 'waiting', attempt: 1 });
  });

  it('treats a drop during the handshake as a failed attempt', () => {
    chat.start();
    socket().serverDrops('transport close');

    expect(state()).toEqual({ status: 'waiting', attempt: 1 });
    jest.advanceTimersByTime(1000);
    expect(socket().connect).toHaveBeenCalledTimes(2);
  });

  it('does not schedule twice when connect_error is followed by a disconnect', () => {
    chat.start();
    socket().serverRejects();
    socket().serverDrops();

    expect(state()).toEqual({ status: 'waiting', attempt: 1 });
    jest.advanceTimersByTime(1000);
    expect(socket().connect).toHaveBeenCalledTimes(2);
  });

  it('gives up on an attempt the server never answers after 15 s', () => {
    chat.start();

    jest.advanceTimersByTime(14_999);
    expect(state().status).toBe('connecting');
    jest.advanceTimersByTime(1);
    expect(state()).toEqual({ status: 'waiting', attempt: 1 });
    expect(socket().disconnect).toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(socket().connect).toHaveBeenCalledTimes(2);
    expect(state().status).toBe('connecting');
  });

  it('clears the attempt timer when the connection succeeds or stops', () => {
    chat.start();
    expect(jest.getTimerCount()).toBe(1);
    socket().serverAccepts();
    expect(jest.getTimerCount()).toBe(0);

    socket().serverDrops();
    expect(jest.getTimerCount()).toBe(1);
    chat.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('ignores a late connect_error after stop', async () => {
    mockSession.refreshAfterUnauthorized.mockResolvedValue('refreshed');
    chat.start();
    chat.stop();
    socket().serverRejects('unauthorized');
    await jest.advanceTimersByTimeAsync(60_000);

    expect(mockSession.refreshAfterUnauthorized).not.toHaveBeenCalled();
    expect(socket().connect).toHaveBeenCalledTimes(1);
    expect(state().status).toBe('stopped');
  });

  it('ignores a refresh result that arrives after stop', async () => {
    let finish: (outcome: string) => void = () => undefined;
    mockSession.refreshAfterUnauthorized.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    chat.start();
    socket().serverRejects('unauthorized');
    chat.stop();
    finish('refreshed');
    await jest.advanceTimersByTimeAsync(0);

    expect(socket().connect).toHaveBeenCalledTimes(1);
    expect(state().status).toBe('stopped');
  });

  it('stop disconnects, cancels the backoff timer and removes the AppState listener', () => {
    chat.start();
    socket().serverRejects();
    expect(state().status).toBe('waiting');

    chat.stop();
    expect(socket().disconnect).toHaveBeenCalled();
    expect(removeAppState).toHaveBeenCalledTimes(1);
    expect(state()).toEqual({ status: 'stopped', attempt: 0 });
    expect(jest.getTimerCount()).toBe(0);

    jest.advanceTimersByTime(60_000);
    expect(socket().connect).toHaveBeenCalledTimes(1);
  });

  it('does not reuse the old token after a user switch', () => {
    chat.start();
    socket().serverAccepts();
    chat.stop();
    mockSession.accessToken = 'token-user-2';
    chat.start();

    expect(mockIo).toHaveBeenCalledTimes(1);
    expect(socket().connectTokens).toEqual(['token-1', 'token-user-2']);
    expect(socket().auth).toEqual({ token: 'token-user-2' });
  });

  it('stops by itself when there is no access token', () => {
    mockSession.accessToken = null;
    chat.start();

    expect(state().status).toBe('stopped');
    expect(mockSockets).toHaveLength(0);
  });

  it('reconnects when the app becomes active while waiting', () => {
    chat.start();
    socket().serverRejects();
    expect(state().status).toBe('waiting');

    appStateListener?.('background');
    expect(socket().connect).toHaveBeenCalledTimes(1);
    appStateListener?.('active');
    expect(socket().connect).toHaveBeenCalledTimes(2);
    expect(state().status).toBe('connecting');
    // The cancelled backoff does not fire a second attempt.
    jest.advanceTimersByTime(1000);
    expect(socket().connect).toHaveBeenCalledTimes(2);
  });

  it('reconnectNow starts when stopped and does nothing while connecting or connected', () => {
    chat.reconnectNow();
    expect(state().status).toBe('connecting');
    chat.reconnectNow();
    expect(socket().connect).toHaveBeenCalledTimes(1);
    socket().serverAccepts();
    chat.reconnectNow();
    expect(socket().connect).toHaveBeenCalledTimes(1);
  });

  it('fires onConnected after every connect and supports unsubscribing', () => {
    const handler = jest.fn();
    const off = chat.onConnected(handler);
    chat.start();
    socket().serverAccepts();
    socket().serverDrops();
    socket().serverAccepts();
    expect(handler).toHaveBeenCalledTimes(2);

    off();
    socket().serverDrops();
    socket().serverAccepts();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('keeps on() handlers across reconnects and unsubscribes them', () => {
    const handler = jest.fn();
    const off = chat.on('message:receive', handler);
    chat.start();
    socket().serverAccepts();
    socket().fire('message:receive', { id: 'm1' });
    socket().serverDrops();
    socket().serverAccepts();
    socket().fire('message:receive', { id: 'm2' });
    expect(handler.mock.calls).toEqual([[{ id: 'm1' }], [{ id: 'm2' }]]);

    off();
    socket().fire('message:receive', { id: 'm3' });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  describe('emitWithAck', () => {
    it('resolves with the ack payload', async () => {
      chat.start();
      socket().serverAccepts();

      const result = chat.emitWithAck<{ ok: boolean }>('conversation:join', {
        conversationId: 'c1',
      });
      expect(socket().emitted[0].event).toBe('conversation:join');
      expect(socket().emitted[0].payload).toEqual({ conversationId: 'c1' });
      socket().emitted[0].ack?.({ ok: true });

      await expect(result).resolves.toEqual({ ok: true });
      expect(jest.getTimerCount()).toBe(0);
    });

    it('rejects with timeout when there is no ack', async () => {
      chat.start();
      socket().serverAccepts();

      const assertion = expect(chat.emitWithAck('message:send', {}, 5000)).rejects.toThrow(
        'timeout',
      );
      await jest.advanceTimersByTimeAsync(5000);

      await assertion;
    });

    it('uses a 10 s default timeout', async () => {
      chat.start();
      socket().serverAccepts();

      const settled = jest.fn();
      const result = chat.emitWithAck('message:send', {}).catch(settled);
      await jest.advanceTimersByTimeAsync(9999);
      expect(settled).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      await result;

      expect(settled).toHaveBeenCalledWith(new Error('timeout'));
    });

    it('rejects immediately with disconnected when not connected', async () => {
      await expect(chat.emitWithAck('message:send', {})).rejects.toThrow('disconnected');

      chat.start();
      await expect(chat.emitWithAck('message:send', {})).rejects.toThrow('disconnected');
      expect(socket().emitted).toHaveLength(0);
    });

    it('rejects pending acks when the connection drops', async () => {
      chat.start();
      socket().serverAccepts();

      const assertion = expect(chat.emitWithAck('message:send', {})).rejects.toThrow(
        'disconnected',
      );
      socket().serverDrops();

      await assertion;
      // Only the retry attempt's timer is left; the ack timer was cleared.
      expect(jest.getTimerCount()).toBe(1);
    });
  });

  describe('emit', () => {
    it('sends events without an ack only while connected', () => {
      expect(chat.emit('conversation:leave', { conversationId: 'c1' })).toBe(false);

      chat.start();
      expect(chat.emit('conversation:leave', { conversationId: 'c1' })).toBe(false);
      expect(socket().emitted).toHaveLength(0);

      socket().serverAccepts();
      expect(chat.emit('conversation:leave', { conversationId: 'c1' })).toBe(true);
      expect(socket().emitted).toEqual([
        { event: 'conversation:leave', payload: { conversationId: 'c1' }, ack: undefined },
      ]);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
