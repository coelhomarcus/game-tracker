/** @jest-environment node */
import '@/test-utils/nodeFetch';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Platform } from 'react-native';

import { apiBaseUrl } from '@/lib/env';

import { profilesApi } from '../api';
import { parsePersonResult, parseUserProfile, type PickedImage } from '../types';

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
    });
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
    });
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

  it('update sends only the given keys and returns the user', async () => {
    let seenBody: unknown;
    server.use(
      http.patch(`${apiBaseUrl}/users/me`, async ({ request }) => {
        seenBody = await request.json();
        return HttpResponse.json({
          id: 'u1',
          username: 'ana',
          name: 'Ana Maria',
          email: 'ana@example.com',
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
        });
      }),
    );

    const user = await profilesApi.update({ name: 'Ana Maria' });

    expect(seenBody).toEqual({ name: 'Ana Maria' });
    expect(user).toMatchObject({ id: 'u1', name: 'Ana Maria', email: 'ana@example.com' });
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

      const url = await profilesApi.upload('avatar', image);

      expect(url).toBe('https://img/avatar.jpg');
      expect(seenPath.endsWith('/users/me/avatar')).toBe(true);
      expect(appended).toEqual([
        ['avatar', { uri: image.uri, name: 'photo.jpg', type: 'image/jpeg' }],
      ]);
    });
  });
});
