// Notifications and push registration. The push tokens are fake: without credentials the test
// backend sends nothing over the network.
import { newUuid } from '@/lib/uuid';

import { apiErrorOf, describeBackend, signUpAccount, type Account } from './backend';

describeBackend('notifications against the test API', () => {
  it('a follow notifies; mark all clears the counter; following again does not duplicate', async () => {
    const ana = await signUpAccount('na');
    const beto = await signUpAccount('nb');

    expect((await ana.notifications.list()).unreadCount).toBe(0);

    await beto.profiles.setFollow(ana.user.id, true);
    await beto.profiles.setFollow(ana.user.id, true);

    let data = await ana.notifications.list();
    // Following again does not duplicate.
    expect(data.unreadCount).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ type: 'follow', read: false });
    expect(data.items[0].actor.id).toBe(beto.user.id);

    await ana.notifications.markAllRead();
    data = await ana.notifications.list();
    expect(data.unreadCount).toBe(0);
    expect(data.items.map((n) => n.read)).toEqual([true]);
    await ana.notifications.markAllRead();
  });

  it('without a valid session the list is rejected (401)', async () => {
    const ana = await signUpAccount('nc');
    await ana.app.sessionManager.clear();
    expect(await apiErrorOf(ana.notifications.list())).toMatchObject({
      status: 401,
      code: 'unauthorized',
    });
  });
});

describeBackend('push installations against the test API', () => {
  let ana: Account;
  let beto: Account;

  beforeEach(async () => {
    ana = await signUpAccount('pa');
    beto = await signUpAccount('pb');
  });

  const fakeToken = () => `tok-${newUuid()}`;

  it('registering is idempotent; so is revoking twice', async () => {
    const id = newUuid();
    await ana.push.register(id, fakeToken());
    await ana.push.register(id, fakeToken());
    await ana.push.revoke(id);
    await ana.push.revoke(id);
  });

  it('the same installation in another account (account switch) is accepted', async () => {
    const id = newUuid();
    await ana.push.register(id, fakeToken());
    await beto.push.register(id, fakeToken());
  });

  it("revoking another user's installation is not an error and reveals nothing", async () => {
    const id = newUuid();
    await ana.push.register(id, fakeToken());
    // The same 204 as for an unknown id, so installation ids cannot be probed.
    await beto.push.revoke(id);
  });

  it('a non-UUID id is rejected with the validation error', async () => {
    expect(await apiErrorOf(ana.push.register('nao-uuid', 'tok'))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
  });
});
