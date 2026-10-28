// Respostas a mensagens: `message:send` com `replyToId`, e `replyTo` no ACK, no evento e no
// histórico, sempre como quem recebe vê a original. REST + Socket.IO reais numa porta efêmera.
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { db } from '../../src/db';
import { messages } from '../../src/db/schema';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;
const sockets: Socket[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const send = (method: string, p: string, user: TestUser, body?: unknown) =>
  api.http(method, p, user.accessToken, body);

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

async function sendMessage(s: Socket, conversationId: string, content: string, extra: Json = {}) {
  const r = await emitAck(s, 'message:send', { conversationId, content, clientMessageId: randomUUID(), ...extra });
  assert.ok(r && r.message, `envio falhou: ${JSON.stringify(r)}`);
  return r.message as Json;
}

async function openConversation(from: TestUser, to: TestUser) {
  const res = await send('POST', '/conversations', from, { userId: to.user.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.id as string;
}

const history = async (user: TestUser, conversationId: string) =>
  (await ok('GET', `/conversations/${conversationId}/messages?limit=100`, user)).items as Json[];
const inHistory = async (user: TestUser, conversationId: string, messageId: string) =>
  (await history(user, conversationId)).find((m) => m.id === messageId);

/** Duas pessoas numa conversa, cada uma com um socket na sala. */
async function pair(prefix: string) {
  const a = await registerUser(api.http, `${prefix}a`);
  const b = await registerUser(api.http, `${prefix}b`);
  const conversationId = await openConversation(a, b);
  const sa = await joined(a, conversationId);
  const sb = await joined(b, conversationId);
  return { a, b, conversationId, sa, sb };
}

before(async () => {
  api = await startApi();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await api.close();
});

describe('replies: sending', () => {
  it('a reply carries replyTo in the ack, the event and both histories', async () => {
    const { a, b, conversationId, sa, sb } = await pair('rpa');
    const original = await sendMessage(sb, conversationId, 'qual jogo?');
    assert.equal(original.replyTo, null, 'mensagem comum: replyTo nulo');

    const received = waitFor(sb, 'message:receive', (m: Json) => m.content === 'Hollow Knight');
    const reply = await sendMessage(sa, conversationId, 'Hollow Knight', { replyToId: original.id });
    const expected = { id: original.id, content: 'qual jogo?', senderId: b.user.id };
    assert.deepEqual(reply.replyTo, expected);
    assert.equal(reply.replyToId, original.id);
    assert.deepEqual((await received)?.replyTo, expected);

    assert.deepEqual((await inHistory(a, conversationId, reply.id))?.replyTo, expected);
    assert.deepEqual((await inHistory(b, conversationId, reply.id))?.replyTo, expected);
    assert.equal((await inHistory(a, conversationId, original.id))?.replyTo, null);
  });

  it('replying to my own message works too', async () => {
    const { a, conversationId, sa } = await pair('rpo');
    const original = await sendMessage(sa, conversationId, 'primeira');
    const reply = await sendMessage(sa, conversationId, 'complemento', { replyToId: original.id });
    assert.deepEqual(reply.replyTo, { id: original.id, content: 'primeira', senderId: a.user.id });
  });

  it('refuses a replyToId that is not a visible message of this conversation, storing nothing', async () => {
    const { a, conversationId, sa, sb } = await pair('rpr');
    const c = await registerUser(api.http, 'rprc');
    const elsewhere = await openConversation(a, c);
    const sc = await joined(c, elsewhere);
    const foreign = await sendMessage(sc, elsewhere, 'de outra conversa');
    const hidden = await sendMessage(sb, conversationId, 'vou apagar para mim');
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${hidden.id}`, a)).status, 204);

    let leaked = 0;
    const onLeak = (m: Json) => {
      if (String(m.content).startsWith('recusada')) leaked++;
    };
    sb.on('message:receive', onLeak);
    for (const replyToId of [foreign.id, hidden.id, randomUUID()]) {
      const r = await emitAck(sa, 'message:send', {
        conversationId,
        content: 'recusada',
        clientMessageId: randomUUID(),
        replyToId,
      });
      assert.equal(r.code, 'reply_not_found', JSON.stringify(r));
      assert.equal(typeof r.error, 'string');
      assert.equal(r.message, undefined);
    }
    for (const replyToId of ['nao-uuid', 42, {}]) {
      const r = await emitAck(sa, 'message:send', { conversationId, content: 'recusada', replyToId });
      assert.equal(typeof r.error, 'string', JSON.stringify(r));
      assert.equal(r.message, undefined);
    }
    // Nulo é o mesmo que não responder.
    const plain = await sendMessage(sa, conversationId, 'sem resposta', { replyToId: null });
    assert.equal(plain.replyTo, null);

    await sleep(200);
    sb.off('message:receive', onLeak);
    assert.equal(leaked, 0, 'nenhuma recusada chegou');
    const contents = (await history(a, conversationId)).map((m) => m.content);
    assert.ok(!contents.includes('recusada'), 'nada gravado');
  });

  it('cannot reply to a message from before I left the conversation', async () => {
    const { a, conversationId, sa, sb } = await pair('rpl');
    const old = await sendMessage(sb, conversationId, 'antiga');
    assert.equal((await send('DELETE', `/conversations/${conversationId}`, a)).status, 204);
    await sendMessage(sb, conversationId, 'nova');

    const r = await emitAck(sa, 'message:send', {
      conversationId,
      content: 'resposta',
      clientMessageId: randomUUID(),
      replyToId: old.id,
    });
    assert.equal(r.code, 'reply_not_found', JSON.stringify(r));
  });

  it('a resend with the same clientMessageId returns the stored reply, replyTo kept', async () => {
    const { conversationId, sa, sb } = await pair('rpi');
    const original = await sendMessage(sb, conversationId, 'pergunta');
    const cid = randomUUID();
    const firstEvent = waitFor(sb, 'message:receive', (m: Json) => m.clientMessageId === cid);
    const first = await emitAck(sa, 'message:send', {
      conversationId,
      content: 'resposta',
      clientMessageId: cid,
      replyToId: original.id,
    });
    assert.equal(first.message.replyTo.id, original.id);
    assert.ok(await firstEvent, 'o primeiro envio gera o evento');

    let events = 0;
    const onEvent = (m: Json) => {
      if (m.clientMessageId === cid) events++;
    };
    sb.on('message:receive', onEvent);
    // O mesmo envio de novo (o ACK se perdeu), e um que perdeu o campo pelo caminho.
    for (const extra of [{ replyToId: original.id }, {}]) {
      const again = await emitAck(sa, 'message:send', { conversationId, content: 'resposta', clientMessageId: cid, ...extra });
      assert.equal(again.message.id, first.message.id);
      assert.deepEqual(again.message.replyTo, first.message.replyTo);
    }
    await sleep(200);
    sb.off('message:receive', onEvent);
    assert.equal(events, 0, 'reenvio não gera evento');
  });

  it('a resend of a stored reply still answers with it after its original was hidden', async () => {
    const { a, conversationId, sa, sb } = await pair('rph');
    const original = await sendMessage(sb, conversationId, 'pergunta');
    const cid = randomUUID();
    const first = await emitAck(sa, 'message:send', {
      conversationId,
      content: 'resposta',
      clientMessageId: cid,
      replyToId: original.id,
    });
    assert.ok(first.message);
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${original.id}`, a)).status, 204);

    const again = await emitAck(sa, 'message:send', {
      conversationId,
      content: 'resposta',
      clientMessageId: cid,
      replyToId: original.id,
    });
    assert.equal(again.message?.id, first.message.id, JSON.stringify(again));
    // Apagada para mim: não volta pela citação.
    assert.equal(again.message.replyTo, null);
  });
});

describe('replies: how each person sees the original', () => {
  it('someone who hid the original sees the reply without the quote, live and in history', async () => {
    const { a, b, conversationId, sa, sb } = await pair('rpv');
    const original = await sendMessage(sa, conversationId, 'segredo');
    assert.equal((await send('DELETE', `/conversations/${conversationId}/messages/${original.id}`, b)).status, 204);
    // Outro aparelho de `b`, fora da sala: não recebe o evento da sala.
    const bElsewhere = await connect(b);
    const outside = waitFor(bElsewhere, 'message:receive', (m: Json) => m.content === 'sobre aquilo', 600);

    const forB = waitFor(sb, 'message:receive', (m: Json) => m.content === 'sobre aquilo');
    const aOther = await joined(a, conversationId);
    const forA = waitFor(aOther, 'message:receive', (m: Json) => m.content === 'sobre aquilo');
    const reply = await sendMessage(sa, conversationId, 'sobre aquilo', { replyToId: original.id });

    assert.equal(reply.replyTo?.content, 'segredo');
    assert.equal((await forA)?.replyTo?.content, 'segredo', 'outro aparelho de quem enviou');
    const live = await forB;
    assert.ok(live, 'b recebe a resposta');
    assert.equal(live.replyTo, null);
    assert.equal(await outside, null, 'só a sala recebe');

    assert.equal((await inHistory(b, conversationId, reply.id))?.replyTo, null);
    assert.equal((await inHistory(a, conversationId, reply.id))?.replyTo?.content, 'segredo');
  });

  it('someone who left sees a reply to an older message without the quote', async () => {
    const { a, b, conversationId, sa, sb } = await pair('rpw');
    const old = await sendMessage(sa, conversationId, 'antes de sair');
    assert.equal((await send('DELETE', `/conversations/${conversationId}`, b)).status, 204);

    const live = waitFor(sb, 'message:receive', (m: Json) => m.content === 'lembra?');
    const reply = await sendMessage(sa, conversationId, 'lembra?', { replyToId: old.id });
    assert.equal(reply.replyTo?.id, old.id);
    assert.equal((await live)?.replyTo, null);

    const seen = await history(b, conversationId);
    assert.deepEqual(
      seen.map((m) => m.content),
      ['lembra?'],
      'a mensagem antiga não volta',
    );
    assert.equal(seen[0]?.replyTo, null);
    assert.equal((await inHistory(a, conversationId, reply.id))?.replyTo?.content, 'antes de sair');
  });

  it('a reply whose original is deleted for good keeps going, with replyTo null', async () => {
    const { a, b, conversationId, sa, sb } = await pair('rpd');
    const original = await sendMessage(sb, conversationId, 'vai sumir');
    const reply = await sendMessage(sa, conversationId, 'respondi', { replyToId: original.id });

    await db.delete(messages).where(eq(messages.id, original.id));

    for (const user of [a, b]) {
      const item = await inHistory(user, conversationId, reply.id);
      assert.ok(item, 'a resposta continua');
      assert.equal(item.replyTo, null);
      assert.equal(item.replyToId, null);
    }
  });
});
