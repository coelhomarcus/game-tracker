/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Platform } from 'react-native';

import { apiBaseUrl } from '@/lib/env';

import { feedApi } from '../api';
import { displayName, parseComment, parsePost, parsePostPage, postKey } from '../types';

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
      images: [],
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      quoteCount: 0,
      bookmarkCount: 0,
      likedByMe: false,
      repostedByMe: false,
      bookmarkedByMe: false,
      quotedPostId: null,
      quotedPost: null,
      quotedPostRemoved: false,
      reason: null,
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

describe('parsePost social fields', () => {
  const bia = { id: 'u2', username: 'bia', name: null, avatarUrl: null };

  it('parses counters, viewer flags, images and the quote', () => {
    const post = parsePost({
      ...postJson,
      repostCount: 4,
      quoteCount: 2,
      bookmarkCount: 7,
      repostedByMe: true,
      bookmarkedByMe: true,
      images: [
        { url: 'https://img/a.jpg', width: 800, height: 600, alt: 'Uma foto' },
        { url: 'https://img/b.jpg', width: 100, height: 200, alt: null },
      ],
      quotedPostId: 'p0',
      quotedPost: {
        id: 'p0',
        user: bia,
        content: 'Original',
        type: 'review',
        activityStatus: null,
        images: [{ url: 'https://img/q.jpg', width: 10, height: 20, alt: null }],
        game: { id: 'g1', igdbId: 1942, name: 'Hades', coverUrl: null },
        createdAt: '2026-10-19T09:00:00.000Z',
      },
    });

    expect(post).toMatchObject({
      repostCount: 4,
      quoteCount: 2,
      bookmarkCount: 7,
      repostedByMe: true,
      bookmarkedByMe: true,
      quotedPostId: 'p0',
      reason: null,
    });
    expect(post.images).toEqual([
      { url: 'https://img/a.jpg', width: 800, height: 600, alt: 'Uma foto' },
      { url: 'https://img/b.jpg', width: 100, height: 200, alt: null },
    ]);
    expect(post.quotedPost).toEqual({
      id: 'p0',
      author: bia,
      content: 'Original',
      type: 'review',
      activityStatus: null,
      images: [{ url: 'https://img/q.jpg', width: 10, height: 20, alt: null }],
      game: expect.objectContaining({ id: 'g1', name: 'Hades' }),
      createdAt: new Date('2026-10-19T09:00:00.000Z'),
    });
  });

  it('keeps a null quotedPost when the original was deleted', () => {
    const post = parsePost({ ...postJson, quotedPostId: null, quotedPost: null });

    expect(post.quotedPostId).toBeNull();
    expect(post.quotedPost).toBeNull();
    expect(post.quotedPostRemoved).toBe(false);
  });

  it('flags a quote whose original was deleted', () => {
    const post = parsePost({
      ...postJson,
      quotedPostId: null,
      quotedPost: null,
      quotedPostRemoved: true,
    });

    expect(post.quotedPostRemoved).toBe(true);
    expect(post.quotedPost).toBeNull();
  });

  it('accepts an image without width and height (a legacy single image)', () => {
    const post = parsePost({
      ...postJson,
      images: [{ url: 'https://img/post.jpg', width: null, height: null, alt: null }],
    });

    expect(post.images).toEqual([
      { url: 'https://img/post.jpg', width: null, height: null, alt: null },
    ]);
  });

  it('drops malformed images and non-numeric sizes', () => {
    const post = parsePost({
      ...postJson,
      images: [{ width: 1 }, { url: 'https://img/a.jpg', width: '800', height: NaN }],
    });

    expect(post.images).toEqual([{ url: 'https://img/a.jpg', width: null, height: null, alt: null }]);
  });

  it('falls back to imageUrl as the only image when the list is absent', () => {
    expect(parsePost(postJson).images).toEqual([
      { url: 'https://img/post.jpg', width: null, height: null, alt: null },
    ]);
    expect(parsePost({ ...postJson, imageUrl: null }).images).toEqual([]);
  });

  it('parses the repost reason of a feed item', () => {
    const post = parsePost({
      ...postJson,
      reason: { type: 'repost', by: bia, at: '2026-10-21T08:00:00.000Z' },
    });

    expect(post.reason).toEqual({
      type: 'repost',
      by: bia,
      at: new Date('2026-10-21T08:00:00.000Z'),
    });
  });

  it('ignores a reason of a kind it does not know or without a user', () => {
    expect(parsePost({ ...postJson, reason: { type: 'pin', by: bia, at: 'x' } }).reason).toBeNull();
    expect(parsePost({ ...postJson, reason: { type: 'repost', at: 'x' } }).reason).toBeNull();
  });
});

describe('postKey', () => {
  const repostBy = (id: string, username: string) =>
    parsePost({
      ...postJson,
      reason: { type: 'repost', by: { id, username }, at: '2026-10-21T08:00:00.000Z' },
    });

  it('tells an original from each repost of the same post', () => {
    const original = parsePost(postJson);

    expect(postKey(original)).toBe('post:p1');
    expect(postKey(repostBy('u2', 'bia'))).toBe('repost:p1:u2');
    expect(
      new Set([postKey(original), postKey(repostBy('u2', 'bia')), postKey(repostBy('u3', 'caio'))])
        .size,
    ).toBe(3);
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

  it('create sends quotedPostId and images, without the legacy imageUrl', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/posts`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(postJson, { status: 201 });
      }),
    );

    await feedApi.create({
      content: 'Concordo',
      quotedPostId: 'p0',
      images: [
        { url: 'https://api/uploads/posts/a.jpg', width: 800, height: 600 },
        { url: 'https://api/uploads/posts/b.jpg', width: 10, height: 20, alt: 'Capa' },
      ],
    });

    expect(body).toEqual({
      content: 'Concordo',
      quotedPostId: 'p0',
      images: [
        { url: 'https://api/uploads/posts/a.jpg', width: 800, height: 600 },
        { url: 'https://api/uploads/posts/b.jpg', width: 10, height: 20, alt: 'Capa' },
      ],
    });
    expect(body).not.toHaveProperty('imageUrl');
  });

  it('create omits images when the list is empty', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBaseUrl}/posts`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(postJson, { status: 201 });
      }),
    );

    await feedApi.create({ content: 'Oi', images: [] });

    expect(body).toEqual({ content: 'Oi' });
  });

  it('uploadPostImage posts the file under the field image and returns url, width and height', async () => {
    let seenFile: unknown = null;
    let fieldNames: string[] = [];
    let contentType: string | null = null;
    server.use(
      http.get('http://picker.test/photo.jpg', () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
      http.post(`${apiBaseUrl}/posts/images`, async ({ request }) => {
        contentType = request.headers.get('content-type');
        const form = (await request.formData()) as unknown as {
          get(name: string): unknown;
          keys(): Iterable<string>;
        };
        seenFile = form.get('image');
        fieldNames = [...form.keys()];
        return HttpResponse.json(
          { url: 'https://api/uploads/posts/a.jpg', width: 2000, height: 1000 },
          { status: 201 },
        );
      }),
    );
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    try {
      const uploaded = await feedApi.uploadPostImage({
        uri: 'http://picker.test/photo.jpg',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
      });

      expect(uploaded).toEqual({
        url: 'https://api/uploads/posts/a.jpg',
        width: 2000,
        height: 1000,
      });
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
    expect(fieldNames).toEqual(['image']);
    expect((seenFile as File).name).toBe('photo.jpg');
    expect((seenFile as File).size).toBe(3);
    expect(contentType).toMatch(/^multipart\/form-data/);
  });

  it('deletePost and deleteComment send DELETE', async () => {
    const calls: string[] = [];
    server.use(
      http.delete(`${apiBaseUrl}/posts/p1`, () => {
        calls.push('post');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/comments/c1`, () => {
        calls.push('comment');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(feedApi.deletePost('p1')).resolves.toBeUndefined();
    await expect(feedApi.deleteComment('c1')).resolves.toBeUndefined();

    expect(calls).toEqual(['post', 'comment']);
  });

  it('setRepost sends POST to repost and DELETE to unrepost', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/posts/p1/repost`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/posts/p1/repost`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await feedApi.setRepost('p1', true);
    await feedApi.setRepost('p1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });

  it('setBookmark sends POST to bookmark and DELETE to unbookmark', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/posts/p1/bookmark`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/posts/p1/bookmark`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await feedApi.setBookmark('p1', true);
    await feedApi.setBookmark('p1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });

  it('bookmarks pages through /users/me/bookmarks with the opaque cursor', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/me/bookmarks`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [{ ...postJson, bookmarkedByMe: true, reason: null }],
          nextCursor: 'eyJhIjoxfQ',
        });
      }),
    );

    const page = await feedApi.bookmarks();
    await feedApi.bookmarks(page.nextCursor ?? undefined);

    expect(seen[0].get('limit')).toBe('20');
    expect(seen[0].has('cursor')).toBe(false);
    expect(seen[1].get('cursor')).toBe('eyJhIjoxfQ');
    expect(page.items[0]).toMatchObject({ id: 'p1', bookmarkedByMe: true, reason: null });
  });

  it('searchPosts sends the trimmed term and the cursor only when given', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/posts/search`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [postJson], nextCursor: null });
      }),
    );

    const page = await feedApi.searchPosts('  hades % ');
    await feedApi.searchPosts('hades', 'c1');

    expect(seen[0].get('q')).toBe('hades %');
    expect(seen[0].get('limit')).toBe('20');
    expect(seen[0].has('cursor')).toBe(false);
    expect(seen[1].get('cursor')).toBe('c1');
    expect(page.items[0].id).toBe('p1');
    expect(page.nextCursor).toBeNull();
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

  it('comments sends sort only when given', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/posts/p1/comments`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json([]);
      }),
    );

    await feedApi.comments('p1');
    await feedApi.comments('p1', 'top');
    await feedApi.comments('p1', 'newest');

    expect(seen.map((params) => params.get('sort'))).toEqual([null, 'top', 'newest']);
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
