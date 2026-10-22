// Chat against the test API: REST through the app's `chatApi`, realtime over one raw Socket.IO
// connection per user (the app's `chatSocket` is a singleton; these tests need two users).
import type { Socket } from 'socket.io-client';

import { parseMessage, type Message } from '@/features/chat/types';
import { newUuid } from '@/lib/uuid';

import {
  backendUrl,
  closeSockets,
  connectSocket,
  describeBackend,
  emitWithAck,
  eventually,
  reconnectSocket,
  signUpAccount,
  socketRejection,
  type Account,
} from './backend';

type Ack = { ok?: boolean; message?: Record<string, unknown>; error?: string };
type ChatEvent = { name: string; payload: Record<string, unknown> };

const SERVER_EVENTS = [
  'message:receive',
  'typing:start',
  'typing:stop',
  'presence:online',
  'presence:offline',
];

/** One user: an app instance of their own, and the events every socket of theirs received. */
type Peer = Account & { events: ChatEvent[]; received: () => Message[] };

function accessTokenOf(account: Account): string {
  const token = account.app.sessionManager.accessToken;
  if (!token) throw new Error(`${account.input.username} has no access token`);
  return token;
}

async function signUpPeer(prefix: string): Promise<Peer> {
  const account = await signUpAccount(prefix);
  const events: ChatEvent[] = [];
  return {
    ...account,
    events,
    received: () =>
      events.filter((e) => e.name === 'message:receive').map((e) => parseMessage(e.payload)),
  };
}

/** Records every server event `socket` gets into `peer.events`, across reconnects. */
function listen(peer: Peer, socket: Socket): Socket {
  for (const name of SERVER_EVENTS) {
    socket.on(name, (payload: Record<string, unknown>) => {
      peer.events.push({ name, payload });
    });
  }
  return socket;
}

async function connectPeer(peer: Peer): Promise<Socket> {
  return listen(peer, await connectSocket(accessTokenOf(peer)));
}

async function join(socket: Socket, conversationId: string): Promise<void> {
  expect(await emitWithAck<Ack>(socket, 'conversation:join', { conversationId })).toEqual({
    ok: true,
  });
}

/** Two users, one conversation, both connected and in its room. */
async function pair() {
  const a = await signUpPeer('ca');
  const b = await signUpPeer('cb');
  const conversationId = await a.chat.create(b.user.id);
  const socketA = await connectPeer(a);
  const socketB = await connectPeer(b);
  await join(socketA, conversationId);
  await join(socketB, conversationId);
  return { a, b, socketA, socketB, conversationId };
}

function send(socket: Socket, conversationId: string, content: string, clientMessageId?: string) {
  return emitWithAck<Ack>(socket, 'message:send', {
    conversationId,
    content,
    ...(clientMessageId === undefined ? {} : { clientMessageId }),
  });
}

/** The message in a `message:send` ACK; fails with the ACK when it carries none. */
function ackedMessage(ack: Ack): Message {
  if (!ack.message) throw new Error(`message:send ACK without a message: ${JSON.stringify(ack)}`);
  return parseMessage(ack.message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Long enough for an event the server would emit to arrive, so its absence means something. */
const QUIET_MS = 400;

describeBackend('chat against the test API', () => {
  afterEach(() => {
    closeSockets();
  });

  it('a rejected token is refused; after the session refresh the connection is accepted', async () => {
    const a = await signUpPeer('cr');
    const rejected = 'token-que-o-servidor-recusa';

    // The app's chat socket refreshes the session on exactly this refusal.
    expect((await socketRejection({ token: rejected })).message).toBe('unauthorized');

    expect(await a.app.sessionManager.refreshAfterUnauthorized(accessTokenOf(a))).toBe('refreshed');
    const socket = await connectSocket(accessTokenOf(a));
    expect(socket.connected).toBe(true);
  });

  it('without a valid token the connection is refused with an authentication error', async () => {
    expect((await socketRejection({ token: 'invalido' })).message).toBe('unauthorized');
    expect((await socketRejection({})).message).toBe('unauthorized');
  });

  it('send with clientMessageId: ACK, event to the other member, no duplicate on retry', async () => {
    const { a, b, socketA, conversationId } = await pair();
    const cid = newUuid();

    const message = ackedMessage(await send(socketA, conversationId, 'olá do Expo', cid));
    expect(message.clientMessageId).toBe(cid);
    expect(message.senderId).toBe(a.user.id);
    expect(message.sender.username).toBe(a.input.username);
    await eventually(() => b.received().some((m) => m.id === message.id), {
      reason: 'B did not receive the message',
    });

    // Sent again with the same clientMessageId (as after a lost ACK).
    const again = ackedMessage(await send(socketA, conversationId, 'olá do Expo', cid));
    expect(again.id).toBe(message.id);
    await delay(QUIET_MS);
    // One event only.
    expect(b.received().filter((m) => m.clientMessageId === cid)).toHaveLength(1);

    // One row only.
    const history = await b.chat.messages(conversationId);
    expect(history.items.filter((m) => m.clientMessageId === cid)).toHaveLength(1);
  });

  it('typing and presence reach the other member; the presence snapshot is right', async () => {
    const { a, b, socketA, socketB, conversationId } = await pair();
    const snapshot = await emitWithAck<{ online?: string[] }>(socketA, 'presence:get', {
      conversationId,
    });
    expect(snapshot.online).toContain(b.user.id);

    const sawTyping = (name: string) =>
      b.events.some(
        (e) =>
          e.name === name &&
          e.payload.userId === a.user.id &&
          e.payload.conversationId === conversationId,
      );
    socketA.emit('typing:start', { conversationId });
    await eventually(() => sawTyping('typing:start'), { reason: 'B did not see A typing' });
    socketA.emit('typing:stop', { conversationId });
    await eventually(() => sawTyping('typing:stop'), { reason: 'B did not see A stop typing' });
    // Typing is relayed to the others in the room, never back to the sender.
    expect(a.events.some((e) => e.name.startsWith('typing:'))).toBe(false);

    const presence = (name: string) =>
      a.events.filter((e) => e.name === name && e.payload.userId === b.user.id).length;
    socketB.disconnect();
    await eventually(() => presence('presence:offline') === 1, {
      reason: 'A did not learn that B left',
    });
    const after = await emitWithAck<{ online?: string[] }>(socketA, 'presence:get', {
      conversationId,
    });
    expect(after.online).not.toContain(b.user.id);

    // B coming back is announced to the rooms of B's conversations.
    const onlineBefore = presence('presence:online');
    await connectPeer(b);
    await eventually(() => presence('presence:online') > onlineBefore, {
      reason: 'A did not learn that B came back',
    });
    const back = await emitWithAck<{ online?: string[] }>(socketA, 'presence:get', {
      conversationId,
    });
    expect(back.online).toContain(b.user.id);
  });

  it('drop and reconnection: rejoining receives again; the missed messages are in history', async () => {
    const { b, socketA, socketB, conversationId } = await pair();

    // B drops and cannot get back for a while: the server refuses what B has.
    socketB.io.engine.close();
    await eventually(() => !socketB.connected, { reason: 'B did not drop' });
    expect((await socketRejection({ token: 'token-invalido' })).message).toBe('unauthorized');

    for (let i = 1; i <= 3; i += 1) {
      ackedMessage(await send(socketA, conversationId, `enquanto B estava fora ${i}`, newUuid()));
    }

    // B comes back with a new connection and joins the room again.
    const socketB2 = await connectPeer(b);
    await join(socketB2, conversationId);

    // What was sent during the drop arrives in the REST history (what the screen syncs), not as
    // events.
    const missed = (messages: Message[]) =>
      messages.filter((m) => m.content.startsWith('enquanto B estava fora'));
    const history = await b.chat.messages(conversationId);
    expect(missed(history.items)).toHaveLength(3);
    expect(missed(b.received())).toEqual([]);

    const live = ackedMessage(
      await send(socketA, conversationId, 'depois da reconexão', newUuid()),
    );
    await eventually(() => b.received().some((m) => m.id === live.id), {
      reason: 'B did not get back into the room',
    });
  });

  it('short drop: the server forgets the room, and after rejoining B keeps receiving', async () => {
    const { b, socketA, socketB, conversationId } = await pair();

    socketB.io.engine.close();
    await eventually(() => !socketB.connected, { reason: 'B did not drop' });
    await reconnectSocket(socketB);

    // Reconnected but not rejoined: the room went with the old connection.
    const early = ackedMessage(await send(socketA, conversationId, 'antes de reentrar', newUuid()));
    await delay(QUIET_MS);
    expect(b.received().some((m) => m.id === early.id)).toBe(false);

    await join(socketB, conversationId);
    const live = ackedMessage(
      await send(socketA, conversationId, 'logo depois da queda', newUuid()),
    );
    await eventually(() => b.received().some((m) => m.id === live.id), {
      reason: 'B did not get back into the room',
    });
  });

  it('server survives invalid ids in socket events', async () => {
    const { socketA, conversationId } = await pair();

    const badJoin = await emitWithAck<Ack>(socketA, 'conversation:join', {
      conversationId: 'isto-nao-e-uuid',
    });
    expect(badJoin.error).toEqual(expect.any(String));
    const badSend = await send(socketA, 'xxx', 'oi');
    expect(badSend.error).toEqual(expect.any(String));
    const badCid = await send(socketA, conversationId, 'oi', 'nao-uuid');
    expect(badCid.error).toEqual(expect.any(String));
    const badPresence = await emitWithAck<Ack>(socketA, 'presence:get', { conversationId: 'lixo' });
    expect(badPresence.error).toEqual(expect.any(String));
    socketA.emit('typing:start', { conversationId: 'lixo' });

    const health = await fetch(`${backendUrl}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    // The same connection still works.
    ackedMessage(await send(socketA, conversationId, 'ainda aqui', newUuid()));
  });

  it('history by cursor, messages with and without clientMessageId, and reading', async () => {
    const { a, b, socketA, conversationId } = await pair();
    for (let i = 1; i <= 35; i += 1) {
      ackedMessage(
        await send(socketA, conversationId, `m${i}`, i % 2 === 0 ? newUuid() : undefined),
      );
    }

    const first = await b.chat.messages(conversationId);
    expect(first.items).toHaveLength(30);
    // Newest first.
    expect(first.items[0].content).toBe('m35');
    expect(first.nextCursor).not.toBeNull();
    const second = await b.chat.messages(conversationId, first.nextCursor ?? undefined);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    // No message repeated across pages, and every one of them came back.
    expect(new Set(all.map((m) => m.id)).size).toBe(35);
    expect(all.map((m) => m.content)).toEqual(Array.from({ length: 35 }, (_, k) => `m${35 - k}`));
    // Legacy sends without an id.
    expect(first.items.some((m) => m.clientMessageId === null)).toBe(true);

    const unread = await b.chat.list();
    expect(unread).toHaveLength(1);
    expect(unread[0]).toMatchObject({ id: conversationId, unread: true });
    expect(unread[0].otherUser?.id).toBe(a.user.id);
    expect(unread[0].lastMessage?.content).toBe('m35');
    await b.chat.markRead(conversationId);
    const read = await b.chat.list();
    expect(read).toHaveLength(1);
    expect(read[0].unread).toBe(false);
  });

  it('the same conversation requested at once by both members has a single id', async () => {
    const a = await signUpPeer('cx');
    const b = await signUpPeer('cy');
    const ids = await Promise.all([
      a.chat.create(b.user.id),
      b.chat.create(a.user.id),
      a.chat.create(b.user.id),
    ]);
    expect(new Set(ids).size).toBe(1);
    const conversations = await a.chat.list();
    expect(conversations.map((c) => c.id)).toEqual([ids[0]]);
  });
});
