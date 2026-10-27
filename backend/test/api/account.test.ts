// Trocar a senha e apagar a conta: senha atual obrigatória, sessões encerradas, cascata e arquivos.
import '../helpers/env';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, afterEach, before, describe, it, mock } from 'node:test';
import { eq, inArray, or } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { db } from '../../src/db';
import {
  comments,
  conversationParticipants,
  conversations,
  follows,
  likes,
  messageReactions,
  messages,
  notifications,
  postImages,
  posts,
  refreshTokens,
  users,
} from '../../src/db/schema';
import { markRead } from '../../src/services/conversations.service';
import { registerUser, type TestUser } from '../helpers/client';
import { png, upload } from '../helpers/image';
import { startApi, type TestApi } from '../helpers/server';

type Json = Record<string, any>;

let api: TestApi;
const sockets: Socket[] = [];
const PASSWORD = 'senha-teste-123';

const send = (method: string, p: string, user: TestUser | null, body?: unknown, form?: FormData) =>
  api.http(method, p, user?.accessToken ?? null, body, form);

async function ok(method: string, p: string, user: TestUser, body?: unknown, form?: FormData): Promise<any> {
  const res = await send(method, p, user, body, form);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${p}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

const login = (user: TestUser, password: string) =>
  api.http('POST', '/auth/login', null, { identifier: user.user.username, password });
const refresh = (refreshToken: string) => api.http('POST', '/auth/refresh', null, { refreshToken });
const changePassword = (user: TestUser, body: Json) => send('POST', '/auth/password', user, body);
const deleteAccount = (user: TestUser, body: Json = { password: PASSWORD }) => send('DELETE', '/users/me', user, body);

function connect(token: string) {
  return new Promise<Socket>((resolve, reject) => {
    const s = io(api.baseUrl, { transports: ['websocket'], auth: { token }, forceNew: true, reconnection: false });
    s.on('connect', () => {
      sockets.push(s);
      resolve(s);
    });
    s.on('connect_error', reject);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!condition() && Date.now() - start < timeoutMs) await sleep(25);
}

before(async () => {
  api = await startApi();
});
after(async () => {
  for (const s of sockets) s.disconnect();
  await api.close();
});

describe('POST /auth/password', () => {
  it('requires authentication', async () => {
    const res = await api.http('POST', '/auth/password', null, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-456',
      refreshToken: 'x.y',
    });
    assert.equal(res.status, 401);
  });

  it('refuses a wrong current password with 400 invalid_password and changes nothing', async () => {
    const u = await registerUser(api.http, 'pwwrong');
    const res = await changePassword(u, {
      currentPassword: 'senha-errada-1',
      newPassword: 'outra-senha-456',
      refreshToken: u.refreshToken,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_password');
    assert.equal((await login(u, PASSWORD)).status, 200, 'a senha antiga continua valendo');
    assert.equal((await refresh(u.refreshToken)).status, 200, 'a sessão não foi tocada');
  });

  it('refuses a weak new password (same rules as register) and changes nothing', async () => {
    const u = await registerUser(api.http, 'pwweak');
    const tooShort = await changePassword(u, { currentPassword: PASSWORD, newPassword: 'curta', refreshToken: u.refreshToken });
    assert.equal(tooShort.status, 400);
    assert.equal(tooShort.body.error.code, 'validation_error');
    const tooLong = await changePassword(u, {
      currentPassword: PASSWORD,
      newPassword: 'a'.repeat(73),
      refreshToken: u.refreshToken,
    });
    assert.equal(tooLong.status, 400);
    const hugeCurrent = await changePassword(u, {
      currentPassword: 'a'.repeat(129),
      newPassword: 'outra-senha-456',
      refreshToken: u.refreshToken,
    });
    assert.equal(hugeCurrent.status, 400);
    assert.equal(hugeCurrent.body.error.code, 'validation_error');
    assert.equal((await changePassword(u, { currentPassword: PASSWORD, refreshToken: u.refreshToken })).status, 400);
    assert.equal((await changePassword(u, { currentPassword: PASSWORD, newPassword: 'outra-senha-456' })).status, 400);
    assert.equal((await login(u, PASSWORD)).status, 200);
  });

  it('changes the password, revokes every other session and keeps the current one working', async () => {
    const u = await registerUser(api.http, 'pwok');
    const second = (await login(u, PASSWORD)).body as TestUser;
    const third = (await login(u, PASSWORD)).body as TestUser;
    const otherUser = await registerUser(api.http, 'pwother');

    const res = await changePassword(u, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-456',
      refreshToken: u.refreshToken,
    });
    assert.equal(res.status, 204);

    assert.equal((await login(u, PASSWORD)).status, 401, 'a senha antiga deixou de valer');
    assert.equal((await login(u, 'outra-senha-456')).status, 200, 'a senha nova vale');

    assert.equal((await refresh(second.refreshToken)).status, 401, 'outra sessão encerrada');
    assert.equal((await refresh(third.refreshToken)).status, 401, 'outra sessão encerrada');
    const kept = await refresh(u.refreshToken);
    assert.equal(kept.status, 200, 'a sessão atual continua renovando');
    assert.equal((await refresh(kept.body.refreshToken)).status, 200, 'e a renovada também');
    assert.equal((await send('GET', '/auth/me', u)).status, 200, 'o token de acesso atual continua valendo');

    // Sessões de outro usuário não são afetadas.
    assert.equal((await refresh(otherUser.refreshToken)).status, 200);
  });

  it('a refresh token of another user does not protect any session of this one', async () => {
    const u = await registerUser(api.http, 'pwforeign');
    const stranger = await registerUser(api.http, 'pwstranger');
    const res = await changePassword(u, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-456',
      refreshToken: stranger.refreshToken,
    });
    assert.equal(res.status, 204);
    assert.equal((await refresh(u.refreshToken)).status, 401, 'nenhuma sessão de u sobrou');
    assert.equal((await refresh(stranger.refreshToken)).status, 200, 'a sessão da outra pessoa segue intacta');
  });

  it('garbage in the refresh token revokes every session instead of failing', async () => {
    const u = await registerUser(api.http, 'pwgarbage');
    const res = await changePassword(u, {
      currentPassword: PASSWORD,
      newPassword: 'outra-senha-456',
      refreshToken: 'nao-e-um-token',
    });
    assert.equal(res.status, 204);
    assert.equal((await refresh(u.refreshToken)).status, 401);
  });
});

describe('DELETE /users/me', () => {
  it('requires authentication', async () => {
    assert.equal((await api.http('DELETE', '/users/me', null, { password: PASSWORD })).status, 401);
  });

  it('refuses a wrong or missing password and keeps the account', async () => {
    const u = await registerUser(api.http, 'delwrong');
    const wrong = await deleteAccount(u, { password: 'senha-errada-1' });
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.error.code, 'invalid_password');
    assert.equal((await deleteAccount(u, {})).status, 400);
    assert.equal((await send('DELETE', '/users/me', u)).status, 400);
    assert.equal((await login(u, PASSWORD)).status, 200);
    assert.ok(await db.query.users.findFirst({ where: eq(users.id, u.user.id) }));
  });

  it('does not collide with the other /users/me routes or with /users/:id', async () => {
    const u = await registerUser(api.http, 'delroute');
    const other = await registerUser(api.http, 'delroute2');
    assert.equal((await deleteAccount(u, { password: 'senha-errada-1' })).status, 400);
    assert.equal((await send('DELETE', `/users/${other.user.id}`, u, { password: PASSWORD })).status, 404);
    assert.ok(await db.query.users.findFirst({ where: eq(users.id, other.user.id) }));
  });

  it('deletes the account and everything that belongs to it, and invalidates the sessions', async () => {
    const a = await registerUser(api.http, 'dela');
    const b = await registerUser(api.http, 'delb');
    const second = (await login(a, PASSWORD)).body as TestUser;

    // Conteúdo de A: post, comentário, follows nos dois sentidos, like e uma conversa com mensagens e reações.
    const ownPost = await ok('POST', '/posts', a, { content: 'post de A' });
    await ok('POST', `/posts/${ownPost.id}/comments`, a, { content: 'comentário de A' });
    const bPost = await ok('POST', '/posts', b, { content: 'post de B' });
    await ok('POST', `/posts/${bPost.id}/like`, a);
    await ok('POST', `/posts/${bPost.id}/comments`, a, { content: 'A comenta em B' });
    await ok('POST', `/users/${b.user.id}/follow`, a);
    await ok('POST', `/users/${a.user.id}/follow`, b);
    // B reage ao post de A, B cita o post de A.
    await ok('POST', `/posts/${ownPost.id}/like`, b);
    const quote = await ok('POST', '/posts', b, { content: 'citando A', quotedPostId: ownPost.id });

    const conversation = await ok('POST', '/conversations', a, { userId: b.user.id });
    const sa = await connect(a.accessToken);
    const sb = await connect(b.accessToken);
    for (const [s, content] of [
      [sa, 'oi do A'],
      [sb, 'oi do B'],
    ] as const) {
      await new Promise<void>((resolve) => s.emit('conversation:join', { conversationId: conversation.id }, () => resolve()));
      await new Promise<void>((resolve) =>
        s.emit('message:send', { conversationId: conversation.id, content, clientMessageId: randomUUID() }, () => resolve()),
      );
    }
    const aMessage = await db.query.messages.findFirst({ where: eq(messages.senderId, a.user.id) });
    const bMessage = await db.query.messages.findFirst({ where: eq(messages.senderId, b.user.id) });
    assert.ok(aMessage && bMessage);
    const reactionPath = (messageId: string) => `/conversations/${conversation.id}/messages/${messageId}/reactions`;
    await ok('POST', reactionPath(bMessage.id), a, { emoji: '👍' });
    await ok('POST', reactionPath(aMessage.id), b, { emoji: '❤️' });

    // Notificações geradas por A (para B) e para A (de B).
    assert.ok((await db.select().from(notifications).where(eq(notifications.userId, a.user.id))).length > 0);
    assert.ok((await db.select().from(notifications).where(eq(notifications.actorId, a.user.id))).length > 0);

    // Arquivos de A: avatar, capa e imagem de post.
    const avatarUrl = (await ok('POST', '/users/me/avatar', a, undefined, upload('avatar', png(50, 50), 'image/png'))).avatarUrl as string;
    const bannerUrl = (await ok('POST', '/users/me/banner', a, undefined, upload('banner', png(60, 30), 'image/png'))).bannerUrl as string;
    const image = await ok('POST', '/posts/images', a, undefined, upload('image', png(40, 30), 'image/png'));
    await ok('POST', '/posts', a, { content: 'com imagem', images: [{ url: image.url, width: image.width, height: image.height }] });
    const files = [
      path.join(process.cwd(), 'uploads', 'avatars', avatarUrl.split('/').pop()!),
      path.join(process.cwd(), 'uploads', 'banners', bannerUrl.split('/').pop()!),
      path.join(process.cwd(), 'uploads', 'posts', (image.url as string).split('/').pop()!),
    ];
    for (const file of files) assert.ok(fs.existsSync(file), `${file} deveria existir antes`);

    const disconnected = new Promise<string>((resolve) => sa.once('disconnect', resolve));

    assert.equal((await deleteAccount(a)).status, 204);

    // Sessão encerrada: login, refresh (as duas sessões) e o socket de A.
    assert.equal((await login(a, PASSWORD)).status, 401);
    assert.equal((await refresh(a.refreshToken)).status, 401);
    assert.equal((await refresh(second.refreshToken)).status, 401);
    assert.equal(await Promise.race([disconnected, sleep(3000).then(() => 'TIMEOUT')]), 'io server disconnect');
    await assert.rejects(connect(a.accessToken), /unauthorized/, 'o token de acesso restante não reabre o socket');
    assert.equal(sb.connected, true, 'o socket de B segue conectado');

    // O perfil some.
    assert.equal((await send('GET', `/users/${a.user.id}`, b)).status, 404);

    // Cascata.
    assert.equal((await db.select().from(users).where(eq(users.id, a.user.id))).length, 0);
    assert.equal((await db.select().from(refreshTokens).where(eq(refreshTokens.userId, a.user.id))).length, 0);
    assert.equal((await db.select().from(posts).where(eq(posts.userId, a.user.id))).length, 0);
    assert.equal((await db.select().from(postImages).where(eq(postImages.url, image.url))).length, 0);
    assert.equal((await db.select().from(comments).where(eq(comments.userId, a.user.id))).length, 0);
    assert.equal((await db.select().from(likes).where(eq(likes.userId, a.user.id))).length, 0);
    assert.equal(
      (await db.select().from(follows).where(or(eq(follows.followerId, a.user.id), eq(follows.followingId, a.user.id)))).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(notifications)
          .where(or(eq(notifications.userId, a.user.id), eq(notifications.actorId, a.user.id)))
      ).length,
      0,
    );
    assert.equal((await db.select().from(messages).where(eq(messages.senderId, a.user.id))).length, 0);
    assert.equal(
      (await db.select().from(conversationParticipants).where(eq(conversationParticipants.userId, a.user.id))).length,
      0,
    );
    assert.equal((await db.select().from(messageReactions).where(inArray(messageReactions.messageId, [aMessage.id]))).length, 0);
    assert.equal((await db.select().from(messageReactions).where(eq(messageReactions.userId, a.user.id))).length, 0);

    // O que é de B fica: post, mensagem, a conversa (sem o par) e a citação, marcada como removida.
    assert.ok(await db.query.posts.findFirst({ where: eq(posts.id, bPost.id) }));
    assert.ok(await db.query.messages.findFirst({ where: eq(messages.id, bMessage.id) }));
    const kept = (await ok('GET', '/conversations', b)) as Json[];
    const keptConversation = kept.find((c) => c.id === conversation.id);
    assert.ok(keptConversation, 'B continua com a conversa');
    assert.equal(keptConversation.otherUser, null);
    const quoteRow = await db.query.posts.findFirst({ where: eq(posts.id, quote.id) });
    assert.equal(quoteRow?.quotedPostId, null);
    assert.equal(quoteRow?.quotedPostRemoved, true);

    // Arquivos removidos (em segundo plano, depois da resposta).
    await waitFor(() => files.every((file) => !fs.existsSync(file)));
    for (const file of files) assert.equal(fs.existsSync(file), false, `${file} deveria ter sido removido`);
  });

  it('refuses an oversized password on account deletion', async () => {
    const u = await registerUser(api.http, 'delhuge');
    const res = await deleteAccount(u, { password: 'a'.repeat(129) });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_error');
    assert.ok(await db.query.users.findFirst({ where: eq(users.id, u.user.id) }));
  });

  it('removes a conversation left without participants once the second person deletes the account', async () => {
    const a = await registerUser(api.http, 'delorpha');
    const b = await registerUser(api.http, 'delorphb');
    const c = await registerUser(api.http, 'delorphc');
    const shared = await ok('POST', '/conversations', a, { userId: b.user.id });
    const other = await ok('POST', '/conversations', b, { userId: c.user.id });

    assert.equal((await deleteAccount(a)).status, 204);
    assert.ok(await db.query.conversations.findFirst({ where: eq(conversations.id, shared.id) }), 'B ainda participa');

    assert.equal((await deleteAccount(b)).status, 204);
    assert.equal(
      await db.query.conversations.findFirst({ where: eq(conversations.id, shared.id) }),
      undefined,
      'sem participantes, a conversa some',
    );
    assert.ok(await db.query.conversations.findFirst({ where: eq(conversations.id, other.id) }), 'C ainda participa da outra');
  });

  it('keeps the account deleted even when the files are already gone (best effort)', async () => {
    const u = await registerUser(api.http, 'delfiles');
    const avatarUrl = (await ok('POST', '/users/me/avatar', u, undefined, upload('avatar', png(30, 30), 'image/png'))).avatarUrl as string;
    fs.unlinkSync(path.join(process.cwd(), 'uploads', 'avatars', avatarUrl.split('/').pop()!));
    assert.equal((await deleteAccount(u)).status, 204);
    assert.equal((await db.select().from(users).where(eq(users.id, u.user.id))).length, 0);
  });

  it('a second delete with the same token no longer finds the account', async () => {
    const u = await registerUser(api.http, 'deltwice');
    assert.equal((await deleteAccount(u)).status, 204);
    assert.equal((await deleteAccount(u)).status, 404);
  });
});

describe('conversation read marks use the database clock', () => {
  afterEach(() => mock.timers.reset());

  it('markRead sets lastReadAt from now() even when the app clock is behind', async () => {
    const a = await registerUser(api.http, 'clka');
    const b = await registerUser(api.http, 'clkb');
    const conversation = await ok('POST', '/conversations', a, { userId: b.user.id });
    const sb = await connect(b.accessToken);
    await new Promise<void>((resolve) => sb.emit('conversation:join', { conversationId: conversation.id }, () => resolve()));
    const ack = await new Promise<Json>((resolve) =>
      sb.emit('message:send', { conversationId: conversation.id, content: 'oi', clientMessageId: randomUUID() }, resolve),
    );
    const createdAt = new Date(ack.message.createdAt);

    mock.timers.enable({ apis: ['Date'], now: Date.now() - 60 * 60 * 1000 });
    await markRead(a.user.id, conversation.id);
    mock.timers.reset();

    const row = await db.query.conversationParticipants.findFirst({
      where: eq(conversationParticipants.userId, a.user.id),
    });
    assert.ok(row?.lastReadAt);
    assert.ok(
      row.lastReadAt.getTime() >= createdAt.getTime(),
      'lastReadAt veio do relógio atrasado do app, não do banco',
    );
    const listed = ((await ok('GET', '/conversations', a)) as Json[]).find((c) => c.id === conversation.id);
    assert.equal(listed?.unread, false);
  });
});
