// Testes do push: adaptadores (com clientes falsos) e do serviço (com o banco ISOLADO).
//   npm test
// Os testes de banco só rodam no banco de teste (a trava está em test/helpers/env.ts).
import '../../test/helpers/env';
import assert from 'node:assert/strict';
import { after, afterEach, describe, it } from 'node:test';
import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { pushInstallations, users } from '../db/schema';
import * as installations from '../services/pushInstallations.service';
import { createFcmProviderFromEnv, FcmProvider, type FcmMessage, type FcmMessaging } from './fcmProvider';
import { sendPushToUser, setPushProvider } from './pushService';
import type { PushPayload, PushProvider, PushResult } from './types';

const payload: PushPayload = { title: 'Nova curtida', body: 'ana curtiu seu post', data: { type: 'like', postId: 'p1' } };


describe('FcmProvider', () => {
  const messaging = (responses: { success: boolean; error?: { code?: string } }[], spy: { sent?: FcmMessage[] } = {}): FcmMessaging => ({
    async sendEach(messages) {
      spy.sent = messages;
      return { responses };
    },
  });

  it('sends the text, the date and priority high', async () => {
    const spy: { sent?: FcmMessage[] } = {};
    const results = await new FcmProvider(messaging([{ success: true }], spy)).send(['t1'], payload);
    assert.deepEqual(results, [{ token: 't1', outcome: 'ok' }]);
    assert.equal(spy.sent![0]!.notification.body, 'ana curtiu seu post');
    assert.deepEqual(spy.sent![0]!.data, payload.data);
    assert.equal(spy.sent![0]!.android?.priority, 'high');
  });

  it('unregistered or invalid token becomes "invalid"; transient error becomes "failed"', async () => {
    const results = await new FcmProvider(
      messaging([
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/invalid-registration-token' } },
        { success: false, error: { code: 'messaging/server-unavailable' } },
      ]),
    ).send(['a', 'b', 'c'], payload);
    assert.deepEqual(results.map((r) => r.outcome), ['invalid', 'invalid', 'failed']);
  });

  it('without credentials stays disabled and does not send', async () => {
    const provider = new FcmProvider(null);
    assert.equal(provider.enabled, false);
    assert.deepEqual(await provider.send(['t'], payload), []);
  });

  it('client exception does not throw', async () => {
    const provider = new FcmProvider({
      async sendEach() {
        throw new Error('rede');
      },
    });
    assert.deepEqual(await provider.send(['t'], payload), [{ token: 't', outcome: 'failed' }]);
  });

  it('createFcmProviderFromEnv: without the variable or with invalid JSON, disabled without throwing', async () => {
    assert.equal((await createFcmProviderFromEnv({})).enabled, false);
    assert.equal((await createFcmProviderFromEnv({ FCM_SERVICE_ACCOUNT_JSON: 'isto não é json' })).enabled, false);
  });
});

/** Provedor falso que registra o que recebeu e devolve o resultado que o teste mandar. */
class FakeProvider implements PushProvider {
  calls: string[][] = [];
  outcomes = new Map<string, PushResult['outcome']>();
  throws = false;
  readonly name = 'fcm' as const;
  constructor(public enabled = true) {}
  async send(tokens: string[]): Promise<PushResult[]> {
    if (this.throws) throw new Error('boom');
    this.calls.push([...tokens].sort());
    return tokens.map((token) => ({ token, outcome: this.outcomes.get(token) ?? 'ok' }));
  }
}

describe('sendPushToUser + installations (test database)', () => {
  const createdUsers: string[] = [];
  const stamp = Date.now().toString(36);
  let n = 0;

  async function newUser() {
    const username = `pt_${stamp}_${n++}`;
    const [u] = await db.insert(users).values({ username, name: username, email: `${username}@example.test`, passwordHash: 'x' }).returning();
    createdUsers.push(u!.id);
    return u!.id;
  }
  const uuid = () => crypto.randomUUID();

  afterEach(() => setPushProvider(null));
  after(async () => {
    if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  });

  function fake(enabled = true) {
    const fcm = new FakeProvider(enabled);
    setPushProvider(fcm);
    return fcm;
  }

  it('sends for all the devices active of the user, without repeat token', async () => {
    const fcm = fake();
    const user = await newUser();
    await installations.register(user, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-${stamp}-1` });
    await installations.register(user, uuid(), { provider: 'fcm', platform: 'web', token: `fcm-${stamp}-2` });
    await sendPushToUser(user, payload);
    assert.deepEqual(fcm.calls, [[`fcm-${stamp}-1`, `fcm-${stamp}-2`]]);
  });

  it('disabled provider is ignored without error', async () => {
    const fcm = fake(false);
    const user = await newUser();
    await installations.register(user, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-off-${stamp}` });
    await sendPushToUser(user, payload);
    assert.deepEqual(fcm.calls, []);
  });

  it('token reported invalid by provider is disabled and not used again', async () => {
    const fcm = fake();
    const user = await newUser();
    const id = uuid();
    await installations.register(user, id, { provider: 'fcm', platform: 'android', token: `fcm-dead-${stamp}` });
    await installations.register(user, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-live-${stamp}` });
    fcm.outcomes.set(`fcm-dead-${stamp}`, 'invalid');

    await sendPushToUser(user, payload);
    const row = await db.query.pushInstallations.findFirst({ where: eq(pushInstallations.installationId, id) });
    assert.equal(row?.active, false);

    fcm.calls = [];
    await sendPushToUser(user, payload);
    assert.deepEqual(fcm.calls, [[`fcm-live-${stamp}`]], 'só o token válido');
  });

  it('transient failure does not disable the token', async () => {
    const fcm = fake();
    const user = await newUser();
    const id = uuid();
    await installations.register(user, id, { provider: 'fcm', platform: 'android', token: `fcm-flaky-${stamp}` });
    fcm.outcomes.set(`fcm-flaky-${stamp}`, 'failed');
    await sendPushToUser(user, payload);
    const row = await db.query.pushInstallations.findFirst({ where: eq(pushInstallations.installationId, id) });
    assert.equal(row?.active, true);
  });

  it('the provider that throws does not crash the caller', async () => {
    const fcm = fake();
    fcm.throws = true;
    const user = await newUser();
    await installations.register(user, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-boom-${stamp}` });
    await assert.doesNotReject(sendPushToUser(user, payload));
  });

  it('does not send to inactive installations or other users', async () => {
    const fcm = fake();
    const a = await newUser();
    const b = await newUser();
    const idA = uuid();
    await installations.register(a, idA, { provider: 'fcm', platform: 'android', token: `fcm-a-${stamp}` });
    await installations.register(b, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-b-${stamp}` });
    await db.update(pushInstallations).set({ active: false }).where(eq(pushInstallations.installationId, idA));
    await sendPushToUser(a, payload);
    assert.deepEqual(fcm.calls, [], 'a só tem token inativo');
    await sendPushToUser(b, payload);
    assert.deepEqual(fcm.calls, [[`fcm-b-${stamp}`]]);
  });

  it('switching accounts on the same device: the installation moves to the new account', async () => {
    const fcm = fake();
    const a = await newUser();
    const b = await newUser();
    const installation = uuid();
    await installations.register(a, installation, { provider: 'fcm', platform: 'android', token: `fcm-shared-${stamp}` });
    await installations.register(b, installation, { provider: 'fcm', platform: 'android', token: `fcm-shared-${stamp}` });

    await sendPushToUser(a, payload);
    assert.deepEqual(fcm.calls, [], 'a conta anterior para de receber neste aparelho');
    await sendPushToUser(b, payload);
    assert.deepEqual(fcm.calls, [[`fcm-shared-${stamp}`]]);
  });

  it('the same token in another installation removes it from the old one (single owner)', async () => {
    const fcm = fake();
    const a = await newUser();
    const b = await newUser();
    await installations.register(a, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-moved-${stamp}` });
    await installations.register(b, uuid(), { provider: 'fcm', platform: 'android', token: `fcm-moved-${stamp}` });
    await sendPushToUser(a, payload);
    assert.deepEqual(fcm.calls, []);
    await sendPushToUser(b, payload);
    assert.equal(fcm.calls.length, 1);
  });

  it('registering again updates the token (rotation) and reactivates it', async () => {
    const fcm = fake();
    const user = await newUser();
    const id = uuid();
    await installations.register(user, id, { provider: 'fcm', platform: 'android', token: `fcm-old-${stamp}` });
    await db.update(pushInstallations).set({ active: false }).where(eq(pushInstallations.installationId, id));
    await installations.register(user, id, { provider: 'fcm', platform: 'android', token: `fcm-new-${stamp}` });
    await sendPushToUser(user, payload);
    assert.deepEqual(fcm.calls, [[`fcm-new-${stamp}`]]);
  });

  it('revocation only applies to the owner; another user gets the silent in the-operation', async () => {
    const fcm = fake();
    const a = await newUser();
    const b = await newUser();
    const id = uuid();
    await installations.register(a, id, { provider: 'fcm', platform: 'android', token: `fcm-rev-${stamp}` });

    await installations.revoke(b, id);
    await sendPushToUser(a, payload);
    assert.equal(fcm.calls.length, 1, 'b não conseguiu revogar a instalação de a');

    fcm.calls = [];
    await installations.revoke(a, id);
    await sendPushToUser(a, payload);
    assert.deepEqual(fcm.calls, []);
    await assert.doesNotReject(installations.revoke(a, id), 'revogar de novo é idempotente');
  });
});
