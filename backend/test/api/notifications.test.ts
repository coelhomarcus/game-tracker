// Notificações de curtida e de seguir só nascem quando a relação é criada de fato.
import '../helpers/env';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { registerUser, type TestUser } from '../helpers/client';
import { startApi, type TestApi } from '../helpers/server';

describe('notifications without duplicates', () => {
  let api: TestApi;
  let a: TestUser;
  let b: TestUser;
  let postId: string;

  const notifs = async () => (await api.http('GET', '/notifications', a.accessToken)).body;
  const count = async (type: string) => (await notifs()).items.filter((i: { type: string }) => i.type === type).length;

  before(async () => {
    api = await startApi();
    a = await registerUser(api.http, 'na');
    b = await registerUser(api.http, 'nb');
    postId = (await api.http('POST', '/posts', a.accessToken, { content: 'olá' })).body.id;
  });
  after(() => api.close());

  it('like the time generates the notification', async () => {
    assert.equal((await api.http('POST', `/posts/${postId}/like`, b.accessToken)).status, 204);
    assert.equal(await count('like'), 1);
  });

  it('like of new does not generate another', async () => {
    for (let i = 0; i < 3; i++) await api.http('POST', `/posts/${postId}/like`, b.accessToken);
    assert.equal(await count('like'), 1);
  });

  it('unlike and like again creates the real new like (new notification)', async () => {
    await api.http('DELETE', `/posts/${postId}/like`, b.accessToken);
    await api.http('POST', `/posts/${postId}/like`, b.accessToken);
    assert.equal(await count('like'), 2);
  });

  it('like the own post does not notifies', async () => {
    await api.http('POST', `/posts/${postId}/like`, a.accessToken);
    assert.equal(await count('like'), 2);
  });

  it('follow the time generates the notification; repeat does not generate another', async () => {
    for (let i = 0; i < 3; i++) assert.equal((await api.http('POST', `/users/${a.user.id}/follow`, b.accessToken)).status, 204);
    assert.equal(await count('follow'), 1);
  });

  it('the counter of unread matches with the events real', async () => {
    const { items, unreadCount } = await notifs();
    assert.equal(unreadCount, items.filter((i: { read: boolean }) => !i.read).length);
    assert.equal(unreadCount, 3, '2 curtidas + 1 seguidor');
  });

  it('comment and reply notify the author correct', async () => {
    const c = (await api.http('POST', `/posts/${postId}/comments`, b.accessToken, { content: 'oi' })).body;
    await api.http('POST', `/posts/${postId}/comments`, a.accessToken, { content: 'resposta', parentCommentId: c.id });
    assert.equal(await count('comment'), 1, 'a resposta de A ao comentário de B notifica B, não A');
  });

  it('marking all the read clears the counter and is idempotent', async () => {
    assert.equal((await api.http('POST', '/notifications/read-all', a.accessToken)).status, 204);
    assert.equal((await notifs()).unreadCount, 0);
    assert.equal((await api.http('POST', '/notifications/read-all', a.accessToken)).status, 204);
  });
});
