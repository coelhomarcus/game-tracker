/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { notificationsApi } from '../api';
import { parseNotificationsData } from '../types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const actor = { id: 'u2', username: 'bia', name: null, avatarUrl: null };

const item = {
  id: 'n1',
  type: 'like',
  actor,
  postId: 'p1',
  read: false,
  createdAt: '2026-10-20T10:00:00.000Z',
};

describe('parseNotificationsData', () => {
  it('parses items and the unread count', () => {
    const data = parseNotificationsData({
      items: [item, { ...item, id: 'n2', type: 'follow', postId: null, read: true }],
      unreadCount: 3,
    });

    expect(data.unreadCount).toBe(3);
    expect(data.items).toEqual([
      {
        id: 'n1',
        type: 'like',
        actor,
        postId: 'p1',
        commentId: null,
        excerpt: null,
        read: false,
        createdAt: new Date('2026-10-20T10:00:00.000Z'),
      },
      {
        id: 'n2',
        type: 'follow',
        actor,
        postId: null,
        commentId: null,
        excerpt: null,
        read: true,
        createdAt: new Date('2026-10-20T10:00:00.000Z'),
      },
    ]);
  });

  it('skips items with an unknown type or without an actor', () => {
    const data = parseNotificationsData({
      items: [
        { ...item, id: 'n1', type: 'comment' },
        { ...item, id: 'n2', type: 'weird' },
        { ...item, id: 'n3', actor: null },
        { ...item, id: 'n4', actor: undefined },
      ],
      unreadCount: 1,
    });

    expect(data.items.map((n) => n.id)).toEqual(['n1']);
  });

  it('parses reply, mention, repost and quote with commentId and excerpt', () => {
    const data = parseNotificationsData({
      items: [
        { ...item, id: 'n1', type: 'reply', commentId: 'c1', excerpt: 'Concordo' },
        { ...item, id: 'n2', type: 'mention', commentId: null, excerpt: 'oi @ana' },
        { ...item, id: 'n3', type: 'repost', excerpt: 'Zerei!' },
        { ...item, id: 'n4', type: 'quote', postId: 'quote-post', excerpt: 'Zerei também' },
      ],
      unreadCount: 4,
    });

    expect(data.items.map((n) => n.type)).toEqual(['reply', 'mention', 'repost', 'quote']);
    expect(data.items[0]).toMatchObject({ commentId: 'c1', excerpt: 'Concordo', postId: 'p1' });
    expect(data.items[1]).toMatchObject({ commentId: null, excerpt: 'oi @ana' });
    expect(data.items[3]).toMatchObject({ postId: 'quote-post' });
  });

  it('defaults a missing commentId and excerpt to null', () => {
    const data = parseNotificationsData({ items: [item] });

    expect(data.items[0]).toMatchObject({ commentId: null, excerpt: null });
  });

  it('defaults unreadCount to 0 and a missing postId to null', () => {
    const { postId: _postId, ...withoutPost } = item;
    const data = parseNotificationsData({ items: [withoutPost] });

    expect(data.unreadCount).toBe(0);
    expect(data.items[0]!.postId).toBeNull();
  });
});

describe('notificationsApi', () => {
  it('list fetches and parses', async () => {
    server.use(
      http.get(`${apiBaseUrl}/notifications`, () =>
        HttpResponse.json({ items: [item], unreadCount: 1 }),
      ),
    );

    const data = await notificationsApi.list();

    expect(data.unreadCount).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ id: 'n1', type: 'like', read: false });
  });

  it('markAllRead POSTs to read-all', async () => {
    let called = false;
    server.use(
      http.post(`${apiBaseUrl}/notifications/read-all`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(notificationsApi.markAllRead()).resolves.toBeUndefined();
    expect(called).toBe(true);
  });
});
