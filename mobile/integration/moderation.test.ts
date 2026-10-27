// Mute, block, message policy, password change and account deletion: the app's API layer against
// the test API (see integration/backend.ts).
import { authApi } from '@/features/auth/api';

import {
  apiErrorOf,
  closeSockets,
  connectSocket,
  describeBackend,
  emitWithAck,
  newUserInput,
  signUpAccount,
} from './backend';

afterEach(() => closeSockets());

describeBackend('mute and block against the test API', () => {
  it('mutes and unmutes: the profile flag and the muted list follow, idempotently', async () => {
    const a = await signUpAccount('mua');
    const b = await signUpAccount('mub');

    await a.profiles.setMute(b.user.id, true);
    await a.profiles.setMute(b.user.id, true);
    expect(await a.profiles.get(b.user.id)).toMatchObject({
      isMutedByMe: true,
      isBlockedByMe: false,
      blocksMe: false,
    });
    // One-sided: the muted person sees nothing.
    expect(await b.profiles.get(a.user.id)).toMatchObject({ isMutedByMe: false, blocksMe: false });
    const page = await a.profiles.mutes();
    expect(page.items).toEqual([
      { id: b.user.id, username: b.user.username, name: b.user.name, avatarUrl: null },
    ]);
    expect(page.nextCursor).toBeNull();

    await a.profiles.setMute(b.user.id, false);
    await a.profiles.setMute(b.user.id, false);
    expect((await a.profiles.get(b.user.id)).isMutedByMe).toBe(false);
    expect((await a.profiles.mutes()).items).toEqual([]);
  });

  it('pages the blocked list newest first with the opaque cursor', async () => {
    const a = await signUpAccount('bla');
    const others = [];
    for (let i = 0; i < 22; i += 1) others.push(await signUpAccount('blx'));
    for (const other of others) await a.profiles.setBlock(other.user.id, true);

    const first = await a.profiles.blocks();
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await a.profiles.blocks(first.nextCursor ?? undefined);
    expect(second.items).toHaveLength(2);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((person) => person.id);
    expect(ids).toEqual(others.map((other) => other.user.id).reverse());
  });

  it('blocks both ways in the profile flags, refuses messages, and unblocks', async () => {
    const a = await signUpAccount('bka');
    const b = await signUpAccount('bkb');

    await a.profiles.setBlock(b.user.id, true);
    expect(await a.profiles.get(b.user.id)).toMatchObject({
      isBlockedByMe: true,
      canMessage: false,
    });
    expect(await b.profiles.get(a.user.id)).toMatchObject({ blocksMe: true, canMessage: false });
    expect(await apiErrorOf(b.chat.create(a.user.id))).toMatchObject({
      status: 403,
      code: 'blocked',
    });

    await a.profiles.setBlock(b.user.id, false);
    expect(await b.profiles.get(a.user.id)).toMatchObject({ blocksMe: false, canMessage: true });
    expect((await a.profiles.blocks()).items).toEqual([]);
  });

  it('refuses muting or blocking yourself, and unknown people', async () => {
    const a = await signUpAccount('bks');
    expect(await apiErrorOf(a.profiles.setBlock(a.user.id, true))).toMatchObject({ status: 400 });
    expect(await apiErrorOf(a.profiles.setMute(a.user.id, true))).toMatchObject({ status: 400 });
    expect(
      await apiErrorOf(a.profiles.setMute('00000000-0000-0000-0000-000000000000', true)),
    ).toMatchObject({ status: 404 });
  });
});

describeBackend('message policy against the test API', () => {
  it('saves the policy, reads it back on /auth/me and enforces it on new and existing chats', async () => {
    const a = await signUpAccount('dpa');
    const b = await signUpAccount('dpb');
    expect(a.user.dmPolicy).toBe('everyone');
    const conversationId = await b.chat.create(a.user.id);

    await a.chat.setDmPolicy('nobody');
    expect((await authApi.me(a.app.api)).dmPolicy).toBe('nobody');
    expect((await b.profiles.get(a.user.id)).canMessage).toBe(false);
    expect(await apiErrorOf(b.chat.create(a.user.id))).toMatchObject({
      status: 403,
      code: 'dm_not_allowed',
    });
    // The socket refuses the send with the code the chat store maps to its reason.
    const socket = await connectSocket(b.app.sessionManager.accessToken ?? '');
    const ack = await emitWithAck<{ error?: string; code?: string; message?: unknown }>(
      socket,
      'message:send',
      { conversationId, content: 'oi', clientMessageId: '11111111-2222-4333-8444-555555555555' },
    );
    expect(ack).toMatchObject({ code: 'dm_not_allowed' });
    expect(typeof ack.error).toBe('string');
    expect(ack.message).toBeUndefined();

    await a.chat.setDmPolicy('following');
    expect((await b.profiles.get(a.user.id)).canMessage).toBe(false);
    await a.profiles.setFollow(b.user.id, true);
    expect((await b.profiles.get(a.user.id)).canMessage).toBe(true);

    await a.chat.setDmPolicy('everyone');
    expect((await authApi.me(a.app.api)).dmPolicy).toBe('everyone');
  });

  it('refuses an unknown policy', async () => {
    const a = await signUpAccount('dpx');
    expect(
      await apiErrorOf(a.chat.setDmPolicy('friends' as unknown as 'everyone')),
    ).toMatchObject({ status: 400 });
  });
});

describeBackend('password and account against the test API', () => {
  it('changes the password, keeps this session and ends the others', async () => {
    const a = await signUpAccount('pwa');
    // A second session of the same account, like another phone.
    const other = await authApi.login(a.input.username, a.input.password);

    await a.account.changePassword(a.input.password, 'senha-nova-456');

    expect(await apiErrorOf(authApi.login(a.input.username, a.input.password))).toMatchObject({
      status: 401,
    });
    await expect(authApi.login(a.input.username, 'senha-nova-456')).resolves.toMatchObject({
      user: { id: a.user.id },
    });
    expect(await apiErrorOf(authApi.refresh(other.refreshToken))).toMatchObject({ status: 401 });
    // This session still refreshes: the app keeps working after the access token expires.
    await expect(a.app.sessionManager.refreshAfterUnauthorized(a.app.sessionManager.accessToken)).resolves.toBe(
      'refreshed',
    );
    await expect(a.profiles.get(a.user.id)).resolves.toMatchObject({ id: a.user.id });
  });

  it('refuses a wrong current password and a weak new one, changing nothing', async () => {
    const a = await signUpAccount('pwb');

    expect(await apiErrorOf(a.account.changePassword('errada-123', 'senha-nova-456'))).toMatchObject({
      status: 400,
      code: 'invalid_password',
    });
    expect(await apiErrorOf(a.account.changePassword(a.input.password, 'curta'))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
    await expect(authApi.login(a.input.username, a.input.password)).resolves.toBeDefined();
  });

  it('deletes the account with the right password only', async () => {
    const a = await signUpAccount('dla');

    expect(await apiErrorOf(a.account.deleteAccount('errada-123'))).toMatchObject({
      status: 400,
      code: 'invalid_password',
    });
    await a.account.deleteAccount(a.input.password);

    expect(await apiErrorOf(authApi.login(a.input.username, a.input.password))).toMatchObject({
      status: 401,
    });
    // The username is free again.
    await expect(
      authApi.register({ ...newUserInput('dla'), username: a.input.username }),
    ).resolves.toBeDefined();
  });
});
