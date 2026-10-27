/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { chatApi } from '../api';
import { parseConversation, parseMessage, parseMessagePage } from '../types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const bia = { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null };

const message = {
  id: 'm1',
  conversationId: 'c1',
  senderId: 'u2',
  content: 'oi',
  createdAt: '2026-10-20T10:00:00.000Z',
  clientMessageId: '11111111-2222-4333-8444-555555555555',
  sender: bia,
};

describe('parseMessage', () => {
  it('parses every field', () => {
    expect(parseMessage(message)).toEqual({
      id: 'm1',
      conversationId: 'c1',
      senderId: 'u2',
      content: 'oi',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      clientMessageId: '11111111-2222-4333-8444-555555555555',
      sender: bia,
      reactions: [],
    });
  });

  it('parses the reactions, oldest first, leaving malformed ones out', () => {
    const reactions = [
      { emoji: '👍', userId: 'u1' },
      { emoji: '❤️', userId: 'u2' },
    ];
    expect(parseMessage({ ...message, reactions }).reactions).toEqual(reactions);
    expect(
      parseMessage({
        ...message,
        reactions: [{ emoji: '👍', userId: 'u1', extra: 1 }, { emoji: 1 }, null, 'x'],
      }).reactions,
    ).toEqual([{ emoji: '👍', userId: 'u1' }]);
    expect(parseMessage({ ...message, reactions: null }).reactions).toEqual([]);
  });

  it('turns a missing or null clientMessageId into null', () => {
    const { clientMessageId: _id, ...legacy } = message;
    expect(parseMessage(legacy).clientMessageId).toBeNull();
    expect(parseMessage({ ...message, clientMessageId: null }).clientMessageId).toBeNull();
  });
});

describe('parseConversation', () => {
  it('parses a conversation with a last message', () => {
    expect(
      parseConversation({ id: 'c1', otherUser: bia, lastMessage: message, unread: true }),
    ).toEqual({
      id: 'c1',
      otherUser: bia,
      lastMessage: parseMessage(message),
      unread: true,
      muted: false,
    });
  });

  it('reads the muted flag', () => {
    expect(
      parseConversation({ id: 'c1', otherUser: bia, lastMessage: null, unread: true, muted: true })
        .muted,
    ).toBe(true);
  });

  it('accepts a null otherUser and a null lastMessage', () => {
    expect(
      parseConversation({ id: 'c1', otherUser: null, lastMessage: null, unread: false }),
    ).toEqual({ id: 'c1', otherUser: null, lastMessage: null, unread: false, muted: false });
  });

  it('defaults unread to false', () => {
    expect(parseConversation({ id: 'c1', otherUser: bia, lastMessage: null }).unread).toBe(false);
  });

  it('parses the bare last message row sent by the list endpoint (no sender)', () => {
    const { sender: _sender, ...row } = message;

    const fromOther = parseConversation({ id: 'c1', otherUser: bia, lastMessage: row });
    expect(fromOther.lastMessage?.sender).toEqual(bia);

    const mine = parseConversation({
      id: 'c1',
      otherUser: bia,
      lastMessage: { ...row, senderId: 'u1' },
    });
    expect(mine.lastMessage?.senderId).toBe('u1');
    expect(mine.lastMessage?.sender.id).toBe('u1');
  });
});

describe('parseMessagePage', () => {
  it('parses items and the cursor', () => {
    const page = parseMessagePage({ items: [message], nextCursor: 'abc' });
    expect(page.items).toEqual([parseMessage(message)]);
    expect(page.nextCursor).toBe('abc');
  });

  it('defaults a missing cursor to null', () => {
    expect(parseMessagePage({ items: [] })).toEqual({ items: [], nextCursor: null });
  });
});

describe('chatApi', () => {
  it('list fetches and parses the conversations', async () => {
    server.use(
      http.get(`${apiBaseUrl}/conversations`, () =>
        HttpResponse.json([
          { id: 'c1', otherUser: bia, lastMessage: message, unread: true },
          { id: 'c2', otherUser: null, lastMessage: null, unread: false },
        ]),
      ),
    );

    const list = await chatApi.list();

    expect(list.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(list[0]).toMatchObject({ unread: true, lastMessage: { id: 'm1' } });
    expect(list[1]).toMatchObject({ otherUser: null, lastMessage: null });
  });

  it('create POSTs the user id and returns the conversation id', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/conversations`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'c9' }, { status: 201 });
      }),
    );

    await expect(chatApi.create('u2')).resolves.toBe('c9');
    expect(body).toEqual({ userId: 'u2' });
  });

  it('messages sends limit=30 and no cursor on the first page', async () => {
    let search: URLSearchParams | undefined;
    server.use(
      http.get(`${apiBaseUrl}/conversations/c1/messages`, ({ request }) => {
        search = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [message], nextCursor: 'next' });
      }),
    );

    const page = await chatApi.messages('c1');

    expect(search?.get('limit')).toBe('30');
    expect(search?.has('cursor')).toBe(false);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe('next');
  });

  it('messages sends the cursor when given', async () => {
    let search: URLSearchParams | undefined;
    server.use(
      http.get(`${apiBaseUrl}/conversations/c1/messages`, ({ request }) => {
        search = new URL(request.url).searchParams;
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    const page = await chatApi.messages('c1', 'next');

    expect(search?.get('limit')).toBe('30');
    expect(search?.get('cursor')).toBe('next');
    expect(page).toEqual({ items: [], nextCursor: null });
  });

  it('markRead POSTs to the read endpoint', async () => {
    let called = false;
    server.use(
      http.post(`${apiBaseUrl}/conversations/c1/read`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(chatApi.markRead('c1')).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('markAllRead POSTs to read-all', async () => {
    let called = false;
    server.use(
      http.post(`${apiBaseUrl}/conversations/read-all`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(chatApi.markAllRead()).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('setMuted POSTs to mute and DELETEs to unmute', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/conversations/c1/mute`, () => {
        calls.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/conversations/c1/mute`, () => {
        calls.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await chatApi.setMuted('c1', true);
    await chatApi.setMuted('c1', false);

    expect(calls).toEqual(['POST', 'DELETE']);
  });

  it('leave DELETEs the conversation', async () => {
    let called = false;
    server.use(
      http.delete(`${apiBaseUrl}/conversations/c1`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(chatApi.leave('c1')).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('hideMessage DELETEs the message for me', async () => {
    let called = false;
    server.use(
      http.delete(`${apiBaseUrl}/conversations/c1/messages/m1`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(chatApi.hideMessage('c1', 'm1')).resolves.toBeUndefined();
    expect(called).toBe(true);
  });

  it('addReaction POSTs the emoji', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/conversations/c1/messages/m1/reactions`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await chatApi.addReaction('c1', 'm1', '👍');

    expect(body).toEqual({ emoji: '👍' });
  });

  it('removeReaction DELETEs the URL-encoded emoji', async () => {
    let path: string | undefined;
    server.use(
      http.delete(`${apiBaseUrl}/conversations/c1/messages/m1/reactions/:emoji`, ({ request }) => {
        path = new URL(request.url).pathname;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await chatApi.removeReaction('c1', 'm1', '❤️');

    expect(path?.endsWith(`/reactions/${encodeURIComponent('❤️')}`)).toBe(true);
  });

  it.each([
    [409, 'reaction_limit', 'Você pode usar no máximo 5 reações por mensagem'],
    [403, 'blocked', 'Não é possível enviar mensagens: há um bloqueio entre vocês'],
    [403, 'dm_not_allowed', 'Esta pessoa não recebe mensagens diretas'],
  ])('addReaction surfaces a %i %s', async (status, code, text) => {
    server.use(
      http.post(`${apiBaseUrl}/conversations/c1/messages/m1/reactions`, () =>
        HttpResponse.json({ error: { code, message: text } }, { status }),
      ),
    );

    await expect(chatApi.addReaction('c1', 'm1', '👍')).rejects.toMatchObject({ status, code });
  });

  it('setDmPolicy PATCHes the own profile with the policy only', async () => {
    let body: unknown;
    server.use(
      http.patch(`${apiBaseUrl}/users/me`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await chatApi.setDmPolicy('following');

    expect(body).toEqual({ dmPolicy: 'following' });
  });
});
