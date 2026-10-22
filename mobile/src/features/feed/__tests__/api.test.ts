/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { apiBaseUrl } from '@/lib/env';

import { feedApi } from '../api';
import { displayName, parseComment, parsePost, parsePostPage } from '../types';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const userJson = { id: 'u1', username: 'ana', name: 'Ana', avatarUrl: 'https://img/ana.jpg' };

const postJson = {
  id: 'p1',
  user: userJson,
  content: 'Zerei!',
  type: 'activity',
  activityStatus: 'completed',
  createdAt: '2026-10-20T10:00:00.000Z',
  game: { id: 'g1', igdbId: 1942, name: 'Hades', coverUrl: 'https://img/hades.jpg' },
  gameEntry: { id: 'e1', platform: 'PC' },
  imageUrl: 'https://img/post.jpg',
  likeCount: 3,
  commentCount: 2,
  likedByMe: true,
};

describe('parsePost', () => {
  it('parses author, game, entry and the activity status snapshot', () => {
    const post = parsePost(postJson);

    expect(post).toMatchObject({
      id: 'p1',
      author: userJson,
      content: 'Zerei!',
      type: 'activity',
      activityStatus: 'completed',
      entry: { id: 'e1', platform: 'PC' },
      imageUrl: 'https://img/post.jpg',
      likeCount: 3,
      commentCount: 2,
      likedByMe: true,
    });
    expect(post.createdAt).toEqual(new Date('2026-10-20T10:00:00.000Z'));
    expect(post.game).toMatchObject({
      id: 'g1',
      igdbId: 1942,
      name: 'Hades',
      isFavoritedByMe: false,
    });
  });

  it('defaults missing optional fields, counts and booleans', () => {
    expect(
      parsePost({
        id: 'p2',
        user: { id: 'u1', username: 'ana' },
        content: 'Oi',
        type: 'status',
        createdAt: '2026-10-20T10:00:00.000Z',
      }),
    ).toEqual({
      id: 'p2',
      author: { id: 'u1', username: 'ana', name: null, avatarUrl: null },
      content: 'Oi',
      type: 'status',
      activityStatus: null,
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      game: null,
      entry: null,
      imageUrl: null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    });
  });

  it('treats an unknown type as status and a missing entry platform as empty', () => {
    const post = parsePost({ ...postJson, type: 'weird', gameEntry: { id: 'e1' } });

    expect(post.type).toBe('status');
    expect(post.entry).toEqual({ id: 'e1', platform: '' });
  });

  it('parses an unknown activity status through parseStatus', () => {
    expect(parsePost({ ...postJson, activityStatus: 'weird' }).activityStatus).toBe('backlog');
  });
});

describe('parsePostPage', () => {
  it('parses items and the cursor', () => {
    const page = parsePostPage({ items: [postJson], nextCursor: 'c2' });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe('p1');
    expect(page.nextCursor).toBe('c2');
  });

  it('uses a null cursor on the last page', () => {
    expect(parsePostPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
    expect(parsePostPage({ items: [] }).nextCursor).toBeNull();
  });
});

describe('parseComment', () => {
  const base = {
    postId: 'p1',
    user: userJson,
    createdAt: '2026-10-20T10:00:00.000Z',
  };

  it('parses a tree with a reply of a reply', () => {
    const comment = parseComment({
      ...base,
      id: 'c1',
      content: 'Raiz',
      likeCount: 1,
      likedByMe: true,
      replies: [
        {
          ...base,
          id: 'c2',
          content: 'Resposta',
          parentCommentId: 'c1',
          replies: [{ ...base, id: 'c3', content: 'Resposta da resposta', parentCommentId: 'c2' }],
        },
      ],
    });

    expect(comment).toMatchObject({
      id: 'c1',
      postId: 'p1',
      author: userJson,
      content: 'Raiz',
      parentCommentId: null,
      likeCount: 1,
      likedByMe: true,
    });
    expect(comment.createdAt).toEqual(new Date('2026-10-20T10:00:00.000Z'));
    expect(comment.replies).toHaveLength(1);
    expect(comment.replies[0]).toMatchObject({ id: 'c2', parentCommentId: 'c1', likeCount: 0 });
    expect(comment.replies[0].replies[0]).toMatchObject({
      id: 'c3',
      parentCommentId: 'c2',
      likedByMe: false,
      replies: [],
    });
  });
});

describe('displayName', () => {
  it('uses the name when non-blank, else the username', () => {
    expect(displayName({ id: 'u', username: 'ana', name: 'Ana Souza', avatarUrl: null })).toBe(
      'Ana Souza',
    );
    expect(displayName({ id: 'u', username: 'ana', name: null, avatarUrl: null })).toBe('ana');
    expect(displayName({ id: 'u', username: 'ana', name: '   ', avatarUrl: null })).toBe('ana');
  });
});

describe('feedApi', () => {
  it('feed sends scope and limit, and cursor only when given', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/feed`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [postJson], nextCursor: 'c2' });
      }),
    );

    const page = await feedApi.feed('following');
    await feedApi.feed('general', 'c1');

    expect(seen[0].get('scope')).toBe('following');
    expect(seen[0].get('limit')).toBe('20');
    expect(seen[0].has('cursor')).toBe(false);
    expect(seen[1].get('scope')).toBe('general');
    expect(seen[1].get('cursor')).toBe('c1');
    expect(page.nextCursor).toBe('c2');
    expect(page.items[0].id).toBe('p1');
  });

  it('gamePosts sends limit and cursor only when given', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/games/g1/posts`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await feedApi.gamePosts('g1');
    await feedApi.gamePosts('g1', 'c9');

    expect(seen[0].get('limit')).toBe('20');
    expect(seen[0].has('cursor')).toBe(false);
    expect(seen[1].get('cursor')).toBe('c9');
  });

  it('post parses GET /posts/:id', async () => {
    server.use(http.get(`${apiBaseUrl}/posts/p1`, () => HttpResponse.json(postJson)));

    await expect(feedApi.post('p1')).resolves.toMatchObject({ id: 'p1', type: 'activity' });
  });

  it('create trims the content and omits absent ids and type', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/posts`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(postJson, { status: 201 });
      }),
    );

    const post = await feedApi.create({ content: '  Oi!  ' });

    expect(body).toEqual({ content: 'Oi!' });
    expect(Object.keys(body as object)).toEqual(['content']);
    expect(post.id).toBe('p1');
  });

  it('create sends gameId and gameEntryId when given', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/posts`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(postJson, { status: 201 });
      }),
    );

    await feedApi.create({ content: 'Oi', gameId: 'g1', gameEntryId: 'e1' });

    expect(body).toEqual({ content: 'Oi', gameId: 'g1', gameEntryId: 'e1' });
  });

  it('setLike sends POST to like and DELETE to unlike', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/posts/p1/like`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/posts/p1/like`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await feedApi.setLike('p1', true);
    await feedApi.setLike('p1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });

  it('comments parses the nested tree', async () => {
    server.use(
      http.get(`${apiBaseUrl}/posts/p1/comments`, () =>
        HttpResponse.json([
          {
            id: 'c1',
            postId: 'p1',
            user: userJson,
            content: 'Raiz',
            createdAt: '2026-10-20T10:00:00.000Z',
            replies: [
              {
                id: 'c2',
                postId: 'p1',
                user: userJson,
                content: 'Resposta',
                parentCommentId: 'c1',
                createdAt: '2026-10-20T11:00:00.000Z',
              },
            ],
          },
        ]),
      ),
    );

    const tree = await feedApi.comments('p1');

    expect(tree).toHaveLength(1);
    expect(tree[0].replies[0]).toMatchObject({ id: 'c2', parentCommentId: 'c1' });
  });

  it('addComment sends parentCommentId only when given', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(`${apiBaseUrl}/posts/p1/comments`, async ({ request }) => {
        bodies.push(await request.json());
        return new HttpResponse(null, { status: 201 });
      }),
    );

    await feedApi.addComment('p1', 'Oi');
    await feedApi.addComment('p1', 'Oi', 'c1');

    expect(bodies).toEqual([{ content: 'Oi' }, { content: 'Oi', parentCommentId: 'c1' }]);
    expect(Object.keys(bodies[0] as object)).toEqual(['content']);
  });

  it('setCommentLike sends POST to like and DELETE to unlike', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/comments/c1/like`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/comments/c1/like`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await feedApi.setCommentLike('c1', true);
    await feedApi.setCommentLike('c1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });
});
