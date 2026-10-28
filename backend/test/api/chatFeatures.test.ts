// Mensagens diretas: política de quem pode mandar mensagem, e silenciar, sair, apagar para mim,
// reações e marcar tudo como lido. REST + Socket.IO reais contra a API numa porta efêmera.
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, it } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { db } from '../../src/db';
import { messageReactions } from '../../src/db/schema';
import { AppError } from '../../src/lib/errors';
import { setPushProvider } from '../../src/push/pushService';
import { insertReaction } from '../../src/services/conversations.service';
import type { PushPayload, PushProvider } from '../../src/push/types';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;
const sockets: Socket[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const send = (method: string, p: string, user: TestUser | null, body?: unknown) =>
  api.http(method, p, user?.accessToken ?? null, body);

async function ok(method: string, p: string, user: TestUser, body?: unknown): Promise<any> {
  const res = await send(method, p, user, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${p}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

function emitAck(s: Socket, ev: string, data: unknown, ms = 4000): Promise<any> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('TIMEOUT'), ms);
    s.emit(ev, data, (r: unknown) => {
      clearTimeout(t);
      resolve(r);
    });
  });
}

function connect(user: TestUser) {
  return new Promise<Socket>((resolve, reject) => {
    const s = io(api.baseUrl, {
      transports: ['websocket'],
      auth: { token: user.accessToken },
      forceNew: true,
      reconnection: false,
    });
    s.on('connect', () => {
      sockets.push(s);
      resolve(s);
    });
    s.on('connect_error', reject);
  });
}

/** Espera um evento que satisfaça `match`; devolve `null` se não chegar dentro de `ms`. */
function waitFor<T = any>(s: Socket, ev: string, match: (payload: T) => boolean = () => true, ms = 2000) {
  return new Promise<T | null>((resolve) => {
    const onEvent = (payload: T) => {
      if (!match(payload)) return;
      clearTimeout(timer);
      s.off(ev, onEvent);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      s.off(ev, onEvent);
      resolve(null);
    }, ms);
    s.on(ev, onEvent);
  });
}

async function joined(user: TestUser, conversationId: string) {
  const s = await connect(user);
  assert.deepEqual(await emitAck(s, 'conversation:join', { conversationId }), { ok: true });
  return s;
}

async function sendMessage(s: Socket, conversationId: string, content: string) {
  const r = await emitAck(s, 'message:send', { conversationId, content, clientMessageId: randomUUID() });
  assert.ok(r && r.message, `envio falhou: ${JSON.stringify(r)}`);
  return r.message as Json;
}

const createConversation = (from: TestUser, to: TestUser) => send('POST', '/conversations', from, { userId: to.user.id });
const openConversation = async (from: TestUser, to: TestUser) => {
  const res = await createConversation(from, to);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
};
const history = async (user: TestUser, conversationId: string) =>
  (await ok('GET', `/conversations/${conversationId}/messages?limit=100`, user)).items as Json[];
const listItem = async (user: TestUser, conversationId: string): Promise<any> =>
  ((await ok('GET', '/conversations', user)) as Json[]).find((i) => i.id === conversationId);
const setPolicy = (user: TestUser, dmPolicy: string) => send('PATCH', '/users/me', user, { dmPolicy });

before(async () => {
  api = await startApi();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await api.close();
});

describe('DM policy setting', () => {
  it('new users default to everyone, in register, login and /auth/me', async () => {
    const u = await registerUser(api.http, 'dps');
    assert.equal((u.user as Json).dmPolicy, 'everyone');
    assert.equal((await ok('GET', '/auth/me', u)).dmPolicy, 'everyone');
    const login = await send('POST', '/auth/login', null, { identifier: u.user.username, password: 'senha-teste-123' });
    assert.equal(login.body.user.dmPolicy, 'everyone');
  });

  it('PATCH /users/me accepts the three values and rejects anything else', async () => {
    const u = await registerUser(api.http, 'dpp');
    for (const value of ['following', 'nobody', 'everyone']) {
      assert.equal((await setPolicy(u, value)).status, 204);
      assert.equal((await ok('GET', '/auth/me', u)).dmPolicy, value);
    }
    for (const value of ['todos', '', null, 3]) {
      const res = await setPolicy(u, value as string);
      assert.equal(res.status, 400, `aceitou ${JSON.stringify(value)}`);
    }
    assert.equal((await ok('GET', '/auth/me', u)).dmPolicy, 'everyone');
  });
});

describe('DM policy enforcement', () => {
  it('creating a conversation follows the recipient policy', async () => {
    const r = await registerUser(api.http, 'dmr');
    const s = await registerUser(api.http, 'dms');

    await setPolicy(r, 'nobody');
    const nobody = await createConversation(s, r);
    assert.equal(nobody.status, 403);
    assert.equal(nobody.body.error.code, 'dm_not_allowed');

    await setPolicy(r, 'following');
    const notFollowed = await createConversation(s, r);
    assert.equal(notFollowed.status, 403);
    assert.equal(notFollowed.body.error.code, 'dm_not_allowed');
    // Seguir o destinatário não basta: quem conta é quem o destinatário segue.
    await ok('POST', `/users/${r.user.id}/follow`, s);
    assert.equal((await createConversation(s, r)).status, 403);
    await ok('POST', `/users/${s.user.id}/follow`, r);
    assert.equal((await createConversation(s, r)).status, 201);

    // Seguido, mas "ninguém" continua recusando.
    await setPolicy(r, 'nobody');
    assert.equal((await createConversation(s, r)).body.error.code, 'dm_not_allowed');

    await setPolicy(r, 'everyone');
    assert.equal((await createConversation(s, r)).status, 201);
  });

  it('the policy is the recipient\'s: a closed sender can still start a conversation', async () => {
    const closed = await registerUser(api.http, 'dmc');
    const open = await registerUser(api.http, 'dmo');
    await setPolicy(closed, 'nobody');
    assert.equal((await createConversation(closed, open)).status, 201);
  });

  it('GET /users/:id reports canMessage for the viewer', async () => {
    const r = await registerUser(api.http, 'cmr');
    const s = await registerUser(api.http, 'cms');
    const canMessage = async () => (await ok('GET', `/users/${r.user.id}`, s)).canMessage;

    assert.equal(await canMessage(), true);
    await setPolicy(r, 'following');
    assert.equal(await canMessage(), false);
    await ok('POST', `/users/${s.user.id}/follow`, r);
    assert.equal(await canMessage(), true);
    await setPolicy(r, 'nobody');
    assert.equal(await canMessage(), false);
    await setPolicy(r, 'everyone');
    await ok('POST', `/users/${s.user.id}/block`, r);
    assert.equal(await canMessage(), false, 'bloqueado por quem recebe');
    await ok('DELETE', `/users/${s.user.id}/block`, r);
    await ok('POST', `/users/${r.user.id}/block`, s);
    assert.equal(await canMessage(), false, 'quem envia bloqueou');
    await ok('DELETE', `/users/${r.user.id}/block`, s);
    assert.equal(await canMessage(), true);
    assert.equal((await ok('GET', `/users/${s.user.id}`, s)).canMessage, false, 'no próprio perfil');
  });

  it('GET /users/search reports canMessage for each result', async () => {
    const prefix = `cq${randomUUID().slice(0, 6)}`;
    const s = await registerUser(api.http, `${prefix}s`);
    const open = await registerUser(api.http, `${prefix}o`);
    const picky = await registerUser(api.http, `${prefix}p`);
    const friend = await registerUser(api.http, `${prefix}f`);
    const closed = await registerUser(api.http, `${prefix}c`);
    await setPolicy(picky, 'following');
    await setPolicy(friend, 'following');
    await ok('POST', `/users/${s.user.id}/follow`, friend);
    await setPolicy(closed, 'nobody');
    // Seguir a pessoa não basta: a política `following` olha quem ela segue.
    await ok('POST', `/users/${picky.user.id}/follow`, s);

    const results = (await ok('GET', `/users/search?q=${prefix}`, s)) as Json[];
    const byId = new Map(results.map((u) => [u.id, u.canMessage]));
    assert.equal(byId.get(open.user.id), true);
    assert.equal(byId.get(picky.user.id), false);
    assert.equal(byId.get(friend.user.id), true);
    assert.equal(byId.get(closed.user.id), false);
    assert.ok(!byId.has(s.user.id), 'quem busca não aparece');
    assert.equal(results.find((u) => u.id === picky.user.id)?.isFollowedByMe, true);
  });

  it('every send obeys the current policy, also in an existing conversation', async () => {
    const r = await registerUser(api.http, 'spr');
    const s = await registerUser(api.http, 'sps');
    const conversationId = await openConversation(s, r);
    const ss = await joined(s, conversationId);
    const sr = await joined(r, conversationId);
    await sendMessage(ss, conversationId, 'antes da mudança');

    await setPolicy(r, 'nobody');
    let leaked = 0;
    const onLeak = (m: Json) => {
      if (String(m.content).startsWith('recusada')) leaked++;
    };
    sr.on('message:receive', onLeak);
    const refused = await emitAck(ss, 'message:send', { conversationId, content: 'recusada', clientMessageId: randomUUID() });
    assert.equal(refused.code, 'dm_not_allowed', JSON.stringify(refused));
    assert.equal(typeof refused.error, 'string');
    assert.equal(refused.message, undefined);
    // Reabrir pela rota de criação também é recusado.
    assert.equal((await createConversation(s, r)).body.error.code, 'dm_not_allowed');
    // A política é de quem recebe: quem a fechou ainda responde.
    await sendMessage(sr, conversationId, 'eu ainda posso');

    await setPolicy(r, 'following');
    const stillRefused = await emitAck(ss, 'message:send', { conversationId, content: 'recusada 2' });
    assert.equal(stillRefused.code, 'dm_not_allowed');
    await ok('POST', `/users/${s.user.id}/follow`, r);
    await sendMessage(ss, conversationId, 'agora sou seguido');

    await sleep(200);
    sr.off('message:receive', onLeak);
    assert.equal(leaked, 0, 'nenhuma mensagem recusada chegou');
    const contents = (await history(r, conversationId)).map((m) => m.content);
    assert.deepEqual(contents, ['agora sou seguido', 'eu ainda posso', 'antes da mudança']);
  });

  it('a block in either direction refuses creation and sends with blocked', async () => {
    const a = await registerUser(api.http, 'bka');
    const b = await registerUser(api.http, 'bkb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const sb = await joined(b, conversationId);

    for (const [blocker, blocked] of [
      [a, b],
      [b, a],
    ] as const) {
      await ok('POST', `/users/${blocked.user.id}/block`, blocker);
      for (const [from, to, socket] of [
        [a, b, sa],
        [b, a, sb],
      ] as const) {
        const created = await createConversation(from, to);
        assert.equal(created.status, 403);
        assert.equal(created.body.error.code, 'blocked');
        const ack = await emitAck(socket, 'message:send', { conversationId, content: 'bloqueada', clientMessageId: randomUUID() });
        assert.equal(ack.code, 'blocked', JSON.stringify(ack));
        assert.equal(ack.message, undefined);
      }
      await ok('DELETE', `/users/${blocked.user.id}/block`, blocker);
    }

    // O bloqueio vence a política aberta e também a fechada.
    await setPolicy(b, 'nobody');
    await ok('POST', `/users/${b.user.id}/block`, a);
    assert.equal((await createConversation(a, b)).body.error.code, 'blocked');
    await ok('DELETE', `/users/${b.user.id}/block`, a);
    await setPolicy(b, 'everyone');

    assert.equal((await history(a, conversationId)).length, 0, 'nada recusado foi gravado');
    await sendMessage(sa, conversationId, 'desbloqueado');
  });

  it('an unknown user is still 404 and yourself is still 400', async () => {
    const a = await registerUser(api.http, 'dmx');
    assert.equal((await send('POST', '/conversations', a, { userId: randomUUID() })).status, 404);
    assert.equal((await createConversation(a, a)).status, 400);
  });
});

describe('muting a conversation', () => {
  const captured: { tokens: string[]; payload: PushPayload }[] = [];
  const capture = (): PushProvider => ({
    name: 'fcm',
    enabled: true,
    async send(tokens, payload) {
      captured.push({ tokens, payload });
      return tokens.map((token) => ({ token, outcome: 'ok' as const }));
    },
  });
  afterEach(() => setPushProvider(null));

  it('mute and unmute are 204, idempotent, and show in the list', async () => {
    const a = await registerUser(api.http, 'mua');
    const b = await registerUser(api.http, 'mub');
    const conversationId = await openConversation(a, b);
    assert.equal((await listItem(a, conversationId)).muted, false);
    for (let i = 0; i < 2; i++) assert.equal((await send('POST', `/conversations/${conversationId}/mute`, a)).status, 204);
    assert.equal((await listItem(a, conversationId)).muted, true);
    assert.equal((await listItem(b, conversationId)).muted, false, 'silenciar é só para mim');
    for (let i = 0; i < 2; i++) assert.equal((await send('DELETE', `/conversations/${conversationId}/mute`, a)).status, 204);
    assert.equal((await listItem(a, conversationId)).muted, false);
  });

  it('only participants can mute; unknown or malformed ids are 404', async () => {
    const a = await registerUser(api.http, 'mpa');
    const b = await registerUser(api.http, 'mpb');
    const c = await registerUser(api.http, 'mpc');
    const conversationId = await openConversation(a, b);
    for (const method of ['POST', 'DELETE']) {
      assert.equal((await send(method, `/conversations/${conversationId}/mute`, c)).status, 404);
      assert.equal((await send(method, `/conversations/${randomUUID()}/mute`, a)).status, 404);
      assert.equal((await send(method, '/conversations/nao-uuid/mute', a)).status, 404);
    }
  });

  it('a muted conversation sends no push to whoever muted it, and still counts as unread', async () => {
    setPushProvider(capture());
    const a = await registerUser(api.http, 'mpu');
    const b = await registerUser(api.http, 'mpv');
    const token = `tok-mute-${randomUUID()}`;
    assert.equal(
      (await send('PUT', `/push/installations/${randomUUID()}`, b, { provider: 'fcm', platform: 'android', token })).status,
      204,
    );
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const pushesToB = () => captured.filter((c) => c.tokens.includes(token));

    await sendMessage(sa, conversationId, 'com push');
    for (let i = 0; i < 40 && pushesToB().length === 0; i++) await sleep(50);
    assert.equal(pushesToB().length, 1, 'sem silenciar, o push chega');

    await ok('POST', `/conversations/${conversationId}/mute`, b);
    await sendMessage(sa, conversationId, 'sem push');
    await sleep(600);
    assert.equal(pushesToB().length, 1, 'silenciada: nenhum push novo');
    const item = await listItem(b, conversationId);
    assert.equal(item.muted, true);
    assert.equal(item.unread, true, 'continua não lida');

    await ok('DELETE', `/conversations/${conversationId}/mute`, b);
    await sendMessage(sa, conversationId, 'push de volta');
    for (let i = 0; i < 40 && pushesToB().length < 2; i++) await sleep(50);
    assert.equal(pushesToB().length, 2, 'ao reativar, o push volta');
  });
});

describe('leaving a conversation', () => {
  it('hides the conversation and its history for me only, until a new message arrives', async () => {
    const a = await registerUser(api.http, 'lva');
    const b = await registerUser(api.http, 'lvb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const sb = await joined(b, conversationId);
    await sendMessage(sa, conversationId, 'velha 1');
    await sendMessage(sb, conversationId, 'velha 2');

    assert.equal((await send('DELETE', `/conversations/${conversationId}`, b)).status, 204);
    assert.equal(await listItem(b, conversationId), undefined, 'some da minha lista');
    assert.deepEqual(await history(b, conversationId), [], 'sem histórico para mim');
    assert.ok(await listItem(a, conversationId), 'o outro continua vendo');
    assert.deepEqual(
      (await history(a, conversationId)).map((m) => m.content),
      ['velha 2', 'velha 1'],
    );

    await sendMessage(sa, conversationId, 'nova');
    const item = await listItem(b, conversationId);
    assert.ok(item, 'voltou para a lista com a mensagem nova');
    assert.equal(item.lastMessage.content, 'nova');
    assert.equal(item.unread, true);
    assert.deepEqual(
      (await history(b, conversationId)).map((m) => m.content),
      ['nova'],
      'só as mensagens depois da saída',
    );
  });

  it('my own new message brings it back too, and starting the conversation again returns the same id', async () => {
    const a = await registerUser(api.http, 'lsa');
    const b = await registerUser(api.http, 'lsb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    await sendMessage(sa, conversationId, 'antes');
    await ok('DELETE', `/conversations/${conversationId}`, a);
    assert.equal(await listItem(a, conversationId), undefined);
    assert.equal(await openConversation(a, b), conversationId);
    await sendMessage(sa, conversationId, 'depois');
    assert.equal((await listItem(a, conversationId)).lastMessage.content, 'depois');
    assert.deepEqual((await history(a, conversationId)).map((m) => m.content), ['depois']);
  });

  it('a conversation that was never left stays in the list even without messages', async () => {
    const a = await registerUser(api.http, 'lea');
    const b = await registerUser(api.http, 'leb');
    const conversationId = await openConversation(a, b);
    const item = await listItem(a, conversationId);
    assert.ok(item);
    assert.equal(item.lastMessage, null);
  });

  it('only participants can leave; unknown ids are 404', async () => {
    const a = await registerUser(api.http, 'lpa');
    const b = await registerUser(api.http, 'lpb');
    const c = await registerUser(api.http, 'lpc');
    const conversationId = await openConversation(a, b);
    assert.equal((await send('DELETE', `/conversations/${conversationId}`, c)).status, 404);
    assert.equal((await send('DELETE', `/conversations/${randomUUID()}`, a)).status, 404);
    assert.equal((await send('DELETE', '/conversations/nao-uuid', a)).status, 404);
  });
});

describe('deleting a message for me', () => {
  it('hides it from my history and preview only, and tells my other sockets', async () => {
    const a = await registerUser(api.http, 'hda');
    const b = await registerUser(api.http, 'hdb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const sa2 = await connect(a);
    const sb = await joined(b, conversationId);
    const first = await sendMessage(sb, conversationId, 'primeira');
    const second = await sendMessage(sb, conversationId, 'segunda');

    const hiddenOnA2 = waitFor(sa2, 'message:hidden');
    let leakedToB = 0;
    const onLeak = () => leakedToB++;
    sb.on('message:hidden', onLeak);
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${second.id}`, a)).status, 204);
    assert.deepEqual(await hiddenOnA2, { conversationId, messageId: second.id });
    await sleep(200);
    sb.off('message:hidden', onLeak);
    assert.equal(leakedToB, 0, 'o outro participante não é avisado');

    assert.deepEqual((await history(a, conversationId)).map((m) => m.id), [first.id]);
    assert.equal((await listItem(a, conversationId)).lastMessage.id, first.id, 'a prévia pula a apagada');
    assert.deepEqual((await history(b, conversationId)).map((m) => m.id), [second.id, first.id], 'o outro vê tudo');
    assert.equal((await listItem(b, conversationId)).lastMessage.id, second.id);

    // Idempotente.
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${second.id}`, a)).status, 204);
    void sa;
  });

  it('hiding every message keeps a conversation that was not left in the list', async () => {
    const a = await registerUser(api.http, 'hka');
    const b = await registerUser(api.http, 'hkb');
    const conversationId = await openConversation(a, b);
    const sb = await joined(b, conversationId);
    const only = await sendMessage(sb, conversationId, 'única');
    await ok('DELETE', `/conversations/${conversationId}/messages/${only.id}`, a);
    const item = await listItem(a, conversationId);
    assert.ok(item);
    assert.equal(item.lastMessage, null);
    assert.equal(item.unread, false);
  });

  it('only participants, and only messages of that conversation', async () => {
    const a = await registerUser(api.http, 'hpa');
    const b = await registerUser(api.http, 'hpb');
    const c = await registerUser(api.http, 'hpc');
    const conversationId = await openConversation(a, b);
    const otherConversation = await openConversation(a, c);
    const sa = await joined(a, conversationId);
    await emitAck(sa, 'conversation:join', { conversationId: otherConversation });
    const message = await sendMessage(sa, conversationId, 'oi');
    const elsewhere = await sendMessage(sa, otherConversation, 'oi c');

    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${message.id}`, c)).status, 404);
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${elsewhere.id}`, a)).status, 404);
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${randomUUID()}`, a)).status, 404);
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/nao-uuid`, a)).status, 404);
    assert.equal((await history(b, conversationId)).length, 1);
  });
});

describe('reactions', () => {
  const reactionPath = (conversationId: string, messageId: string, emoji?: string) =>
    `/conversations/${conversationId}/messages/${messageId}/reactions${emoji === undefined ? '' : `/${encodeURIComponent(emoji)}`}`;

  it('add and remove are broadcast to the room and show in the history', async () => {
    const a = await registerUser(api.http, 'rxa');
    const b = await registerUser(api.http, 'rxb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const sb = await joined(b, conversationId);
    const message = await sendMessage(sa, conversationId, 'reaja');

    const added = waitFor(sa, 'message:reaction');
    assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji: '👍' })).status, 204);
    assert.deepEqual(await added, { conversationId, messageId: message.id, emoji: '👍', userId: b.user.id, action: 'add' });

    // Repetir a mesma reação não cria outra linha nem outro evento.
    let repeats = 0;
    const onRepeat = () => repeats++;
    sa.on('message:reaction', onRepeat);
    assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji: '👍' })).status, 204);
    await sleep(200);
    sa.off('message:reaction', onRepeat);
    assert.equal(repeats, 0);
    const rows = await db
      .select()
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, message.id), eq(messageReactions.userId, b.user.id)));
    assert.equal(rows.length, 1);

    await ok('POST', reactionPath(conversationId, message.id), a, { emoji: '❤️' });
    for (const viewer of [a, b]) {
      const item = (await history(viewer, conversationId)).find((m) => m.id === message.id)!;
      assert.deepEqual(
        [...item.reactions].sort((x: Json, y: Json) => x.emoji.localeCompare(y.emoji)),
        [
          { emoji: '❤️', userId: a.user.id },
          { emoji: '👍', userId: b.user.id },
        ].sort((x, y) => x.emoji.localeCompare(y.emoji)),
      );
    }

    // O emoji vai codificado na URL.
    const removed = waitFor(sb, 'message:reaction', (e: Json) => e.action === 'remove');
    assert.equal((await send('DELETE', reactionPath(conversationId, message.id, '❤️'), a)).status, 204);
    assert.deepEqual(await removed, { conversationId, messageId: message.id, emoji: '❤️', userId: a.user.id, action: 'remove' });
    assert.deepEqual((await history(a, conversationId)).find((m) => m.id === message.id)!.reactions, [
      { emoji: '👍', userId: b.user.id },
    ]);
    // Remover o que não existe é 204, sem evento.
    assert.equal((await send('DELETE', reactionPath(conversationId, message.id, '❤️'), a)).status, 204);
  });

  it('new messages carry an empty reactions list in message:receive, the ack and the history', async () => {
    const a = await registerUser(api.http, 'rea');
    const b = await registerUser(api.http, 'reb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const sb = await joined(b, conversationId);
    const received = waitFor(sb, 'message:receive');
    const message = await sendMessage(sa, conversationId, 'sem reações');
    assert.deepEqual(message.reactions, []);
    assert.deepEqual((await received)!.reactions, []);
    assert.deepEqual((await history(b, conversationId))[0]!.reactions, []);
  });

  it('each user adds at most 5 distinct emojis per message', async () => {
    const a = await registerUser(api.http, 'rla');
    const b = await registerUser(api.http, 'rlb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const message = await sendMessage(sa, conversationId, 'limite');
    const other = await sendMessage(sa, conversationId, 'outra');
    const five = ['👍', '❤️', '😂', '😮', '😢'];
    for (const emoji of five) assert.equal((await send('POST', reactionPath(conversationId, message.id), a, { emoji })).status, 204);

    const sixth = await send('POST', reactionPath(conversationId, message.id), a, { emoji: '🔥' });
    assert.equal(sixth.status, 409);
    assert.equal(sixth.body.error.code, 'reaction_limit');
    // Repetir uma das cinco continua valendo (não é uma sexta).
    assert.equal((await send('POST', reactionPath(conversationId, message.id), a, { emoji: '👍' })).status, 204);
    // O limite é por pessoa e por mensagem.
    for (const emoji of [...five, '🔥']) {
      if (emoji === '🔥') {
        assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji })).status, 409);
      } else {
        assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji })).status, 204);
      }
    }
    assert.equal((await send('POST', reactionPath(conversationId, other.id), a, { emoji: '🔥' })).status, 204);
    // Liberar uma vaga permite a sexta.
    await ok('DELETE', reactionPath(conversationId, message.id, '😢'), a);
    assert.equal((await send('POST', reactionPath(conversationId, message.id), a, { emoji: '🔥' })).status, 204);
  });

  it('simultaneous adds never go past 5', async () => {
    const a = await registerUser(api.http, 'rca');
    const b = await registerUser(api.http, 'rcb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const message = await sendMessage(sa, conversationId, 'corrida');
    // Quatro em sequência; as três seguintes chegam juntas disputando a última vaga.
    for (const emoji of ['👍', '❤️', '😂', '😮']) await ok('POST', reactionPath(conversationId, message.id), a, { emoji });
    // A disputa é na gravação (a transação com o lock por mensagem e pessoa), chamada direto: o
    // substituto PGlite de uma conexão só embaralha consultas simultâneas fora de transação.
    const racing = ['😢', '🔥', '🎮'];
    const results = await Promise.allSettled(racing.map((emoji) => insertReaction(message.id, a.user.id, emoji)));
    const outcomes = results.map((r) =>
      r.status === 'fulfilled' ? String(r.value) : r.reason instanceof AppError ? r.reason.code : String(r.reason),
    );
    assert.deepEqual(outcomes.sort(), ['reaction_limit', 'reaction_limit', 'true']);
    const rows = await db.select().from(messageReactions).where(eq(messageReactions.messageId, message.id));
    assert.equal(rows.length, 5);
  });

  it('validates the emoji and the participant', async () => {
    const a = await registerUser(api.http, 'rva');
    const b = await registerUser(api.http, 'rvb');
    const c = await registerUser(api.http, 'rvc');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const message = await sendMessage(sa, conversationId, 'validação');
    for (const emoji of ['', 'abc', ' ', '👍👍', '👍'.repeat(9), 42, null]) {
      assert.equal((await send('POST', reactionPath(conversationId, message.id), a, { emoji })).status, 400, `aceitou ${JSON.stringify(emoji)}`);
    }
    for (const emoji of ['❤', '👨‍👩‍👧‍👦', '🇧🇷', '👍🏽']) {
      assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji })).status, 204, `recusou ${emoji}`);
    }
    assert.equal((await send('POST', reactionPath(conversationId, message.id), c, { emoji: '👍' })).status, 404);
    assert.equal((await send('DELETE', reactionPath(conversationId, message.id, '👍'), c)).status, 404);
    assert.equal((await send('POST', reactionPath(conversationId, randomUUID()), a, { emoji: '👍' })).status, 404);
    assert.equal((await send('POST', reactionPath(conversationId, 'nao-uuid'), a, { emoji: '👍' })).status, 404);
  });

  it('reacting across a block is refused with blocked; removing an old reaction still works', async () => {
    const a = await registerUser(api.http, 'rba');
    const b = await registerUser(api.http, 'rbb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const message = await sendMessage(sa, conversationId, 'bloqueio');
    await ok('POST', reactionPath(conversationId, message.id), b, { emoji: '👍' });
    await ok('POST', `/users/${b.user.id}/block`, a);
    const refused = await send('POST', reactionPath(conversationId, message.id), b, { emoji: '😂' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error.code, 'blocked');
    assert.equal((await send('DELETE', reactionPath(conversationId, message.id, '👍'), b)).status, 204);
  });

  it('reacting is a send: it follows the recipient DM policy', async () => {
    const a = await registerUser(api.http, 'rpa');
    const b = await registerUser(api.http, 'rpb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const message = await sendMessage(sa, conversationId, 'política');
    const reply = await sendMessage(await joined(b, conversationId), conversationId, 'resposta');
    await setPolicy(a, 'nobody');
    const refused = await send('POST', reactionPath(conversationId, message.id), b, { emoji: '👍' });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error.code, 'dm_not_allowed');
    // Quem fechou ainda reage às mensagens do outro.
    assert.equal((await send('POST', reactionPath(conversationId, reply.id), a, { emoji: '👍' })).status, 204);
    await setPolicy(a, 'everyone');
    assert.equal((await send('POST', reactionPath(conversationId, message.id), b, { emoji: '👍' })).status, 204);
  });

  it('I cannot react to a message I deleted for me or that predates my leaving', async () => {
    const a = await registerUser(api.http, 'rha');
    const b = await registerUser(api.http, 'rhb');
    const conversationId = await openConversation(a, b);
    const sa = await joined(a, conversationId);
    const hidden = await sendMessage(sa, conversationId, 'apagada');
    await ok('DELETE', `/conversations/${conversationId}/messages/${hidden.id}`, b);
    assert.equal((await send('POST', reactionPath(conversationId, hidden.id), b, { emoji: '👍' })).status, 404);
    const old = await sendMessage(sa, conversationId, 'antiga');
    await ok('DELETE', `/conversations/${conversationId}`, b);
    assert.equal((await send('POST', reactionPath(conversationId, old.id), b, { emoji: '👍' })).status, 404);
  });
});

describe('mark all read', () => {
  it('marks every conversation read for me only', async () => {
    const me = await registerUser(api.http, 'ram');
    const x = await registerUser(api.http, 'rax');
    const y = await registerUser(api.http, 'ray');
    const cx = await openConversation(x, me);
    const cy = await openConversation(y, me);
    const sx = await joined(x, cx);
    const sy = await joined(y, cy);
    await sendMessage(sx, cx, 'de x');
    await sendMessage(sy, cy, 'de y');
    await ok('POST', `/conversations/${cx}/mute`, me);
    assert.equal((await listItem(me, cx)).unread, true);
    assert.equal((await listItem(me, cy)).unread, true);

    assert.equal((await send('POST', '/conversations/read-all', me)).status, 204);
    assert.equal((await listItem(me, cx)).unread, false);
    assert.equal((await listItem(me, cy)).unread, false);

    // Os outros não são afetados, e uma mensagem nova volta a ficar não lida.
    await sendMessage(await joined(me, cx), cx, 'resposta');
    assert.equal((await listItem(x, cx)).unread, true);
    await sendMessage(sy, cy, 'mais uma');
    assert.equal((await listItem(me, cy)).unread, true);
  });

  it('requires auth', async () => {
    assert.equal((await send('POST', '/conversations/read-all', null)).status, 401);
  });
});
