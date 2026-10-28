/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Platform } from 'react-native';

import { apiBaseUrl } from '@/lib/env';

import { profilesApi } from '../api';
import {
  parseFollowListPage,
  parseModerationPage,
  parsePersonResult,
  parseSuggestedPerson,
  parseUserProfile,
  parseUserReplyPage,
  type PickedImage,
} from '../types';

// React Native's FormData type lacks the readers that Node's implementation has.
type ServerForm = { get(name: string): unknown; has(name: string): boolean };

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const profileJson = {
  id: 'u1',
  username: 'ana',
  name: 'Ana',
  avatarUrl: 'https://img/ana.jpg',
  bannerUrl: null,
  bio: 'Gosto de RPG',
  createdAt: '2026-01-02T03:04:05.000Z',
  followerCount: 4,
  followingCount: 5,
  gameEntryCount: 6,
  isFollowedByMe: true,
  followsMe: true,
};

const userJson = { id: 'u1', username: 'ana', name: 'Ana', avatarUrl: null };

const image: PickedImage = {
  uri: 'file:///cache/photo.jpg',
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  size: 1234,
};

describe('parseUserProfile', () => {
  it('maps gameEntryCount to entryCount and parses the date', () => {
    expect(parseUserProfile(profileJson)).toEqual({
      id: 'u1',
      username: 'ana',
      name: 'Ana',
      avatarUrl: 'https://img/ana.jpg',
      bannerUrl: null,
      bio: 'Gosto de RPG',
      createdAt: new Date('2026-01-02T03:04:05.000Z'),
      followerCount: 4,
      followingCount: 5,
      entryCount: 6,
      isFollowedByMe: true,
      followsMe: true,
      isMutedByMe: false,
      isBlockedByMe: false,
      blocksMe: false,
      canMessage: true,
    });
  });

  it('reads the mute, block and message flags', () => {
    expect(
      parseUserProfile({
        ...profileJson,
        isMutedByMe: true,
        isBlockedByMe: true,
        blocksMe: true,
        canMessage: false,
      }),
    ).toMatchObject({ isMutedByMe: true, isBlockedByMe: true, blocksMe: true, canMessage: false });
  });

  it('defaults missing counts to 0 and optional fields to null/false', () => {
    const profile = parseUserProfile({
      id: 'u2',
      username: 'bia',
      createdAt: '2026-01-02T03:04:05.000Z',
    });

    expect(profile).toMatchObject({
      name: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      followerCount: 0,
      followingCount: 0,
      entryCount: 0,
      isFollowedByMe: false,
      followsMe: false,
      isMutedByMe: false,
      isBlockedByMe: false,
      blocksMe: false,
      // A server without the policy lets everyone message.
      canMessage: true,
    });
  });
});

describe('parseModerationPage', () => {
  it('parses the people and the cursor', () => {
    expect(parseModerationPage({ items: [userJson], nextCursor: 'next' })).toEqual({
      items: [{ id: 'u1', username: 'ana', name: 'Ana', avatarUrl: null }],
      nextCursor: 'next',
    });
    expect(parseModerationPage({ items: [] })).toEqual({ items: [], nextCursor: null });
  });
});

describe('parsePersonResult', () => {
  it('parses a search result', () => {
    expect(parsePersonResult({ ...userJson, bio: 'oi', isFollowedByMe: true })).toEqual({
      ...userJson,
      bio: 'oi',
      isFollowedByMe: true,
    });
  });

  it('defaults bio and the follow flag', () => {
    expect(parsePersonResult({ id: 'u3', username: 'caio' })).toEqual({
      id: 'u3',
      username: 'caio',
      name: null,
      avatarUrl: null,
      bio: null,
      isFollowedByMe: false,
    });
  });
});

describe('parseFollowListPage', () => {
  it('parses people with both relation flags and the cursor', () => {
    const page = parseFollowListPage({
      items: [
        { ...userJson, bio: 'Oi', isFollowedByMe: true, followsMe: true },
        { id: 'u2', username: 'bia' },
      ],
      nextCursor: 'next',
    });

    expect(page.nextCursor).toBe('next');
    expect(page.items[0]).toEqual({
      id: 'u1',
      username: 'ana',
      name: 'Ana',
      avatarUrl: null,
      bio: 'Oi',
      isFollowedByMe: true,
      followsMe: true,
    });
    expect(page.items[1]).toMatchObject({ name: null, bio: null, isFollowedByMe: false, followsMe: false });
  });

  it('maps a missing cursor to null', () => {
    expect(parseFollowListPage({ items: [] })).toEqual({ items: [], nextCursor: null });
  });
});

describe('parseSuggestedPerson', () => {
  const json = {
    id: 'u9',
    username: 'caio',
    name: 'Caio',
    avatarUrl: 'https://img/caio.jpg',
    bio: 'RPGs',
    isFollowedByMe: false,
    followsMe: true,
    followedByCount: 3,
  };

  it('reads the person, the relation and how many of my follows follow them', () => {
    expect(parseSuggestedPerson(json)).toEqual(json);
  });

  it('defaults the flags to false, the count to 0 and the text to null', () => {
    expect(parseSuggestedPerson({ id: 'u9', username: 'caio' })).toEqual({
      id: 'u9',
      username: 'caio',
      name: null,
      avatarUrl: null,
      bio: null,
      isFollowedByMe: false,
      followsMe: false,
      followedByCount: 0,
    });
  });
});

describe('profilesApi.suggestions', () => {
  it('sends the limit (10 by default) and parses each person', async () => {
    const seen: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/suggestions`, ({ request }) => {
        seen.push(new URL(request.url).searchParams);
        return HttpResponse.json([
          { id: 'u9', username: 'caio', name: null, avatarUrl: null, bio: null, isFollowedByMe: false, followsMe: false, followedByCount: 2 },
        ]);
      }),
    );

    const people = await profilesApi.suggestions();
    await profilesApi.suggestions(20);

    expect(people).toEqual([
      { id: 'u9', username: 'caio', name: null, avatarUrl: null, bio: null, isFollowedByMe: false, followsMe: false, followedByCount: 2 },
    ]);
    expect(seen.map((params) => params.get('limit'))).toEqual(['10', '20']);
  });
});

describe('parseUserReplyPage', () => {
  it('parses each comment with the post it answers and the cursor', () => {
    const page = parseUserReplyPage({
      items: [
        {
          id: 'c1',
          postId: 'p1',
          userId: 'u1',
          parentCommentId: null,
          content: 'Também zerei!',
          createdAt: '2026-10-20T11:55:00.000Z',
          post: {
            id: 'p1',
            userId: 'u2',
            content: 'Hades é ótimo',
            user: { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null },
          },
        },
        { id: 'c2', postId: 'p2', parentCommentId: 'c9', content: 'Sim', createdAt: '2026-10-21T00:00:00.000Z' },
      ],
      nextCursor: 'next',
    });

    expect(page.nextCursor).toBe('next');
    expect(page.items[0]).toEqual({
      id: 'c1',
      postId: 'p1',
      parentCommentId: null,
      content: 'Também zerei!',
      createdAt: new Date('2026-10-20T11:55:00.000Z'),
      post: {
        id: 'p1',
        author: { id: 'u2', username: 'bia', name: 'Bia', avatarUrl: null },
        content: 'Hades é ótimo',
      },
    });
    // A row without its post still parses, pointing at the post id.
    expect(page.items[1]).toMatchObject({ parentCommentId: 'c9', post: { id: 'p2', content: '' } });
  });

  it('maps a missing cursor to null', () => {
    expect(parseUserReplyPage({ items: [] })).toEqual({ items: [], nextCursor: null });
  });
});

describe('profilesApi', () => {
  it('get fetches and parses a profile', async () => {
    server.use(http.get(`${apiBaseUrl}/users/u1`, () => HttpResponse.json(profileJson)));

    await expect(profilesApi.get('u1')).resolves.toMatchObject({ id: 'u1', entryCount: 6 });
  });

  it('search encodes the term as q', async () => {
    let seenUrl = '';
    server.use(
      http.get(`${apiBaseUrl}/users/search`, ({ request }) => {
        seenUrl = request.url;
        return HttpResponse.json([{ ...userJson, bio: null, isFollowedByMe: false }]);
      }),
    );

    const results = await profilesApi.search('a b&c');

    expect(new URL(seenUrl).searchParams.get('q')).toBe('a b&c');
    expect(seenUrl).toContain('q=a+b%26c');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'u1', isFollowedByMe: false });
  });

  it('posts sends type and limit, and cursor only when given', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/u1/posts`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [], nextCursor: 'next' });
      }),
    );

    const first = await profilesApi.posts('u1', 'activity');
    await profilesApi.posts('u1', 'post', 'abc');

    expect(first).toEqual({ items: [], nextCursor: 'next' });
    expect(seen[0]!.searchParams.get('type')).toBe('activity');
    expect(seen[0]!.searchParams.get('limit')).toBe('20');
    expect(seen[0]!.searchParams.has('cursor')).toBe(false);
    expect(seen[1]!.searchParams.get('type')).toBe('post');
    expect(seen[1]!.searchParams.get('cursor')).toBe('abc');
  });

  it('userPosts sends the media filter and cursor only when given', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/u1/posts`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );

    await profilesApi.userPosts('u1');
    await profilesApi.userPosts('u1', { filter: 'media', cursor: 'abc' });

    expect(seen[0]!.searchParams.get('limit')).toBe('20');
    expect(seen[0]!.searchParams.has('filter')).toBe(false);
    expect(seen[0]!.searchParams.has('type')).toBe(false);
    expect(seen[0]!.searchParams.has('cursor')).toBe(false);
    expect(seen[1]!.searchParams.get('filter')).toBe('media');
    expect(seen[1]!.searchParams.get('cursor')).toBe('abc');
  });

  it.each(['followers', 'following'] as const)('%s pages through the opaque cursor', async (kind) => {
    const seen: URL[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/u1/${kind}`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({
          items: [{ ...userJson, bio: null, isFollowedByMe: false, followsMe: true }],
          nextCursor: 'eyJhIjoxfQ',
        });
      }),
    );

    const page = await profilesApi[kind]('u1');
    await profilesApi[kind]('u1', page.nextCursor ?? undefined);

    expect(seen[0]!.searchParams.get('limit')).toBe('20');
    expect(seen[0]!.searchParams.has('cursor')).toBe(false);
    expect(seen[1]!.searchParams.get('cursor')).toBe('eyJhIjoxfQ');
    expect(page.items[0]).toMatchObject({ id: 'u1', followsMe: true, isFollowedByMe: false });
  });

  it('replies pages through the comments of a user', async () => {
    const seen: URL[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/u1/comments`, ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [], nextCursor: 'abc' });
      }),
    );

    const first = await profilesApi.replies('u1');
    await profilesApi.replies('u1', 'abc');

    expect(first).toEqual({ items: [], nextCursor: 'abc' });
    expect(seen[0]!.searchParams.get('limit')).toBe('20');
    expect(seen[0]!.searchParams.has('cursor')).toBe(false);
    expect(seen[1]!.searchParams.get('cursor')).toBe('abc');
  });

  it('entries parses the entries of a user', async () => {
    server.use(
      http.get(`${apiBaseUrl}/users/u1/game-entries`, () =>
        HttpResponse.json([
          {
            id: 'e1',
            platform: 'PC',
            status: 'playing',
            hoursPlayed: '12.5',
            createdAt: '2026-10-20T10:00:00.000Z',
            game: { id: 'g1', igdbId: 1942, name: 'Hades', coverUrl: null },
          },
        ]),
      ),
    );

    const entries = await profilesApi.entries('u1');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'e1', status: 'playing', hoursPlayed: 12.5 });
    expect(entries[0]!.game).toMatchObject({ id: 'g1', name: 'Hades' });
  });

  it('favorites parses games', async () => {
    server.use(
      http.get(`${apiBaseUrl}/users/u1/favorites`, () =>
        HttpResponse.json([{ id: 'g1', igdbId: 1942, name: 'Hades', coverUrl: null }]),
      ),
    );

    const games = await profilesApi.favorites('u1');

    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ id: 'g1', name: 'Hades', isFavoritedByMe: false });
  });

  it('setFollow POSTs to follow and DELETEs to unfollow', async () => {
    const methods: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/users/u1/follow`, () => {
        methods.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/users/u1/follow`, () => {
        methods.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await profilesApi.setFollow('u1', true);
    await profilesApi.setFollow('u1', false);

    expect(methods).toEqual(['POST', 'DELETE']);
  });

  it.each([
    ['setMute', 'mute'],
    ['setBlock', 'block'],
  ] as const)('%s POSTs to /%s and DELETEs to undo it', async (method, path) => {
    const calls: string[] = [];
    server.use(
      http.post(`${apiBaseUrl}/users/u1/${path}`, () => {
        calls.push('POST');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/users/u1/${path}`, () => {
        calls.push('DELETE');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(profilesApi[method]('u1', true)).resolves.toBeUndefined();
    await expect(profilesApi[method]('u1', false)).resolves.toBeUndefined();

    expect(calls).toEqual(['POST', 'DELETE']);
  });

  it.each([
    ['mutes', 'mutes'],
    ['blocks', 'blocks'],
  ] as const)('%s pages through /users/me/%s with limit 20 and the cursor', async (method, path) => {
    const searches: URLSearchParams[] = [];
    server.use(
      http.get(`${apiBaseUrl}/users/me/${path}`, ({ request }) => {
        const search = new URL(request.url).searchParams;
        searches.push(search);
        return HttpResponse.json(
          search.has('cursor')
            ? { items: [], nextCursor: null }
            : { items: [userJson], nextCursor: 'c2' },
        );
      }),
    );

    const first = await profilesApi[method]();
    const second = await profilesApi[method]('c2');

    expect(first).toEqual({ items: [userJson], nextCursor: 'c2' });
    expect(second).toEqual({ items: [], nextCursor: null });
    expect(searches.map((s) => [s.get('limit'), s.get('cursor')])).toEqual([
      ['20', null],
      ['20', 'c2'],
    ]);
  });

  it('a refused block surfaces the API error', async () => {
    server.use(
      http.post(`${apiBaseUrl}/users/u1/block`, () =>
        HttpResponse.json(
          { error: { code: 'invalid_operation', message: 'Você não pode bloquear a si mesmo' } },
          { status: 400 },
        ),
      ),
    );

    await expect(profilesApi.setBlock('u1', true)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_operation',
    });
  });

  it('update sends only the given keys and resolves on 204', async () => {
    let seenBody: unknown;
    server.use(
      http.patch(`${apiBaseUrl}/users/me`, async ({ request }) => {
        seenBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(profilesApi.update({ name: 'Ana Maria' })).resolves.toBeUndefined();

    expect(seenBody).toEqual({ name: 'Ana Maria' });
  });

  it('removeImage DELETEs the avatar and the banner and resolves on 204', async () => {
    const seen: string[] = [];
    server.use(
      http.delete(`${apiBaseUrl}/users/me/avatar`, () => {
        seen.push('avatar');
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(`${apiBaseUrl}/users/me/banner`, () => {
        seen.push('banner');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(profilesApi.removeImage('avatar')).resolves.toBeUndefined();
    await expect(profilesApi.removeImage('banner')).resolves.toBeUndefined();

    expect(seen).toEqual(['avatar', 'banner']);
  });

  describe('upload', () => {
    const originalOS = Platform.OS;
    afterEach(() => {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
      jest.restoreAllMocks();
    });

    it('banner on the web fetches the blob and posts field banner', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
      let seenContentType: string | null = null;
      let seenFile: unknown = null;
      let hasAvatar = true;
      server.use(
        http.get('http://picker.test/photo.jpg', () =>
          HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
            headers: { 'Content-Type': 'image/jpeg' },
          }),
        ),
        http.post(`${apiBaseUrl}/users/me/banner`, async ({ request }) => {
          seenContentType = request.headers.get('content-type');
          const form = (await request.formData()) as unknown as ServerForm;
          seenFile = form.get('banner');
          hasAvatar = form.has('avatar');
          return HttpResponse.json({ bannerUrl: 'https://img/banner.jpg' });
        }),
      );

      const url = await profilesApi.upload('banner', {
        ...image,
        uri: 'http://picker.test/photo.jpg',
      });

      expect(url).toBe('https://img/banner.jpg');
      expect(seenFile).not.toBeNull();
      expect((seenFile as unknown as File).name).toBe('photo.jpg');
      expect((seenFile as unknown as File).size).toBe(3);
      expect(hasAvatar).toBe(false);
      expect(seenContentType).toMatch(/^multipart\/form-data/);
    });

    it('avatar on native appends the uri descriptor under the avatar field', async () => {
      Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
      const appended: unknown[][] = [];
      jest.spyOn(FormData.prototype, 'append').mockImplementation((...args: unknown[]) => {
        appended.push(args);
      });
      let seenPath = '';
      server.use(
        http.post(`${apiBaseUrl}/users/me/avatar`, ({ request }) => {
          seenPath = new URL(request.url).pathname;
          return HttpResponse.json({ avatarUrl: 'https://img/avatar.jpg' });
        }),
      );

      const timeoutSpy = jest.spyOn(globalThis, 'setTimeout');

      const url = await profilesApi.upload('avatar', image);

      expect(url).toBe('https://img/avatar.jpg');
      expect(seenPath.endsWith('/users/me/avatar')).toBe(true);
      expect(timeoutSpy.mock.calls.some(([, ms]) => ms === 120_000)).toBe(true);
      expect(appended).toEqual([
        ['avatar', { uri: image.uri, name: 'photo.jpg', type: 'image/jpeg' }],
      ]);
    });
  });
});
