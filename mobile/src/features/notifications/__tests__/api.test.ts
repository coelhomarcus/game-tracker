/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { notificationsApi } from '../api';
import { parseNotificationsPage, parseUnreadCount } from '../types';

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

describe('parseNotificationsPage', () => {
  it('parses items, the unread count and the cursor', () => {
    const data = parseNotificationsPage({
      items: [item, { ...item, id: 'n2', type: 'follow', postId: null, read: true }],
      unreadCount: 3,
      nextCursor: 'c2',
    });

    expect(data.unreadCount).toBe(3);
    expect(data.nextCursor).toBe('c2');
    expect(data.items).toEqual([
      {
        id: 'n1',
        type: 'like',
        actor,
        postId: 'p1',
        commentId: null,
        excerpt: null,
        postImageUrl: null,
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
        postImageUrl: null,
        read: true,
        createdAt: new Date('2026-10-20T10:00:00.000Z'),
      },
    ]);
  });

  it('skips items with an unknown type or without an actor', () => {
    const data = parseNotificationsPage({
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
    const data = parseNotificationsPage({
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
    const data = parseNotificationsPage({ items: [item] });

    expect(data.items[0]).toMatchObject({ commentId: null, excerpt: null });
  });

  it('defaults unreadCount to 0, a missing cursor and postId to null', () => {
    const { postId: _postId, ...withoutPost } = item;
    const data = parseNotificationsPage({ items: [withoutPost] });

    expect(data.unreadCount).toBe(0);
    expect(data.nextCursor).toBeNull();
    expect(data.items[0]!.postId).toBeNull();
  });

  it('reads postImageUrl, and null when it is missing or not a string', () => {
    const data = parseNotificationsPage({
      items: [
        { ...item, id: 'n1', postImageUrl: 'https://img/p1.jpg' },
        { ...item, id: 'n2', postImageUrl: null },
        { ...item, id: 'n3', postImageUrl: 42 },
        { ...item, id: 'n4' },
      ],
      unreadCount: 0,
    });

    expect(data.items.map((n) => n.postImageUrl)).toEqual(['https://img/p1.jpg', null, null, null]);
  });
});

describe('parseUnreadCount', () => {
  it('reads the count and defaults to 0', () => {
    expect(parseUnreadCount({ unreadCount: 7 })).toBe(7);
    expect(parseUnreadCount({})).toBe(0);
    expect(parseUnreadCount({ unreadCount: '7' })).toBe(0);
  });
});

describe('notificationsApi', () => {
  /** Answers one page and records the query of each request. */
  function listHandler(body: Record<string, unknown>) {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/notifications`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json(body);
      }),
    );
    return seen;
  }

  it('list fetches and parses the first page of every type', async () => {
    const seen = listHandler({ items: [item], unreadCount: 1, nextCursor: 'next' });

    const data = await notificationsApi.list();

    expect(data.unreadCount).toBe(1);
    expect(data.nextCursor).toBe('next');
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({ id: 'n1', type: 'like', read: false });
    expect(Object.fromEntries(seen[0]!)).toEqual({ filter: 'all', limit: '30' });
  });

  it('list sends the filter and the cursor', async () => {
    const seen = listHandler({ items: [], unreadCount: 0, nextCursor: null });

    await notificationsApi.list({ filter: 'mentions', cursor: 'abc' });
    await notificationsApi.list({ filter: 'replies' });

    expect(Object.fromEntries(seen[0]!)).toEqual({ filter: 'mentions', limit: '30', cursor: 'abc' });
    expect(Object.fromEntries(seen[1]!)).toEqual({ filter: 'replies', limit: '30' });
  });

  it('unreadCount fetches the cheap count', async () => {
    server.use(
      http.get(`${apiBaseUrl}/notifications/unread-count`, () => HttpResponse.json({ unreadCount: 12 })),
    );

    await expect(notificationsApi.unreadCount()).resolves.toBe(12);
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
