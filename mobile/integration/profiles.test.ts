// Profiles, people search, following and image uploads. Requires the synthetic game 900001
// (`npm run test:seed` in backend/).
import { crc32, deflateSync } from 'node:zlib';

import { authApi } from '@/features/auth/api';
import type { Post } from '@/features/feed/types';
import {
  exceedsImageLimit,
  MAX_IMAGE_BYTES,
  profileChanges,
} from '@/features/profiles/profileRules';
import type { ImageKind, PickedImage } from '@/features/profiles/types';

import {
  apiErrorOf,
  describeBackend,
  eventually,
  FIXTURE_GAME_ONE,
  signUpAccount,
  type Account,
} from './backend';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';
/** The server's answer when the multipart body carries no file part. */
const NO_FILE_MESSAGE = 'Nenhum arquivo enviado';

/** A valid 1x1 PNG. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** The size the server saves each kind at (`saveAvatar` / `saveBanner` in backend/src/lib). */
const SAVED_SIZE: Record<ImageKind, { width: number; height: number }> = {
  avatar: { width: 400, height: 400 },
  banner: { width: 1500, height: 500 },
};

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An RGB gradient PNG of the given size, like a photo the picker cropped. */
function gradientPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  const stride = 1 + width * 3;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * stride + 1 + x * 3;
      pixels[at] = Math.floor((x * 255) / width);
      pixels[at + 1] = Math.floor((y * 255) / height);
      pixels[at + 2] = 120;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The frame size in a JPEG's SOF header. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('not a JPEG');
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error(`bad JPEG segment at ${at}`);
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return {
        height: (bytes[at + 5] << 8) | bytes[at + 6],
        width: (bytes[at + 7] << 8) | bytes[at + 8],
      };
    }
    at += 2 + ((bytes[at + 2] << 8) | bytes[at + 3]);
  }
  throw new Error('no JPEG frame header');
}

/** A picked image whose uri holds the bytes themselves (a data: URI instead of a file path). */
function picked(bytes: Uint8Array, fileName: string, mimeType: string): PickedImage {
  return {
    uri: `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
    mimeType,
    fileName,
    size: bytes.length,
  };
}

const tinyPng = () => picked(TINY_PNG, 'eu.png', 'image/png');

type NativeFilePart = { uri: string; name: string; type: string };

function isNativeFilePart(value: unknown): value is NativeFilePart {
  return typeof value === 'object' && value !== null && 'uri' in value && 'name' in value;
}

/**
 * Node's FormData taught what React Native's does: a `{ uri, name, type }` part is sent as the
 * file at `uri` (here always a data: URI) instead of as the text "[object Object]".
 */
class NativeFormData extends FormData {
  override append(name: string, value: string | Blob, fileName?: string): void {
    const part: unknown = value;
    if (!isNativeFilePart(part)) {
      if (typeof value === 'string') super.append(name, value);
      else super.append(name, value, fileName);
      return;
    }
    const base64 = /^data:[^;,]*;base64,(.*)$/s.exec(part.uri)?.[1];
    if (base64 === undefined) throw new Error(`only data: URIs are readable here: ${part.uri}`);
    super.append(name, new Blob([Buffer.from(base64, 'base64')], { type: part.type }), part.name);
  }
}

/**
 * Uploads through the app's own `profilesApi.upload`, which builds the multipart body the way it
 * does on the device (the native branch: Jest compiles the app for a native platform), with the
 * runtime's FormData swapped for one that reads the file part's uri like React Native does.
 */
async function upload(account: Account, kind: ImageKind, image: PickedImage): Promise<string> {
  const original = globalThis.FormData;
  globalThis.FormData = NativeFormData;
  try {
    return await account.profiles.upload(kind, image);
  } finally {
    globalThis.FormData = original;
  }
}

/** Fetches an uploaded image the way the app's <Image> does: without credentials. */
async function served(url: string): Promise<{ type: string | null; bytes: Uint8Array }> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return {
    type: response.headers.get('content-type'),
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}

describeBackend('profiles against the test API', () => {
  it('search by username finds the person and never the searching user', async () => {
    const a = await signUpAccount('pa');
    const b = await signUpAccount('pb');
    const found = await a.profiles.search(b.user.username.slice(0, -2));
    expect(found.some((p) => p.id === b.user.id)).toBe(true);
    // The search leaves out whoever searches.
    expect(found.some((p) => p.id === a.user.id)).toBe(false);
    expect(found.find((p) => p.id === b.user.id)?.isFollowedByMe).toBe(false);
  });

  it('follow and unfollow: relationship and counters in the profile', async () => {
    const a = await signUpAccount('pc');
    const b = await signUpAccount('pd');

    await a.profiles.setFollow(b.user.id, true);
    await a.profiles.setFollow(b.user.id, true); // idempotent
    let profile = await a.profiles.get(b.user.id);
    expect([profile.isFollowedByMe, profile.followerCount]).toEqual([true, 1]);
    expect((await b.profiles.get(b.user.id)).followerCount).toBe(1);
    expect((await a.profiles.get(a.user.id)).followingCount).toBe(1);
    const found = await a.profiles.search(b.user.username);
    expect(found.find((p) => p.id === b.user.id)?.isFollowedByMe).toBe(true);

    await a.profiles.setFollow(b.user.id, false);
    await a.profiles.setFollow(b.user.id, false);
    profile = await a.profiles.get(b.user.id);
    expect([profile.isFollowedByMe, profile.followerCount]).toEqual([false, 0]);
  });

  it('a missing profile is 404', async () => {
    const a = await signUpAccount('pe');
    expect(await apiErrorOf(a.profiles.get(MISSING_ID))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('edit profile: only the sent fields; an empty bio clears it; a taken username is 409', async () => {
    const a = await signUpAccount('pf');
    const b = await signUpAccount('pg');

    await a.profiles.update({ bio: 'Minha bio' });
    let profile = await a.profiles.get(a.user.id);
    expect([profile.bio, profile.name]).toEqual(['Minha bio', a.input.name]);

    await a.profiles.update({ bio: '' });
    // Stored as '' (the app shows no bio for '' or null).
    expect((await a.profiles.get(a.user.id)).bio || null).toBeNull();

    expect(await apiErrorOf(a.profiles.update({ username: b.user.username }))).toMatchObject({
      status: 409,
      code: 'conflict',
    });
    profile = await a.profiles.get(a.user.id);
    // Nothing changed.
    expect(profile.username).toBe(a.user.username);

    // The edit screen sends no field that did not change; an empty change set is still a 204.
    const fields = { name: profile.name ?? '', username: profile.username, bio: profile.bio ?? '' };
    expect(profileChanges(fields, fields)).toEqual({});
    await expect(a.profiles.update({})).resolves.toBeUndefined();
  });

  it('avatar and cover upload: the URLs serve a JPEG and show in the profile', async () => {
    const a = await signUpAccount('ph');

    const avatarUrl = await upload(a, 'avatar', tinyPng());
    expect(avatarUrl).toContain('/uploads/avatars/');
    const bannerUrl = await upload(a, 'banner', tinyPng());
    expect(bannerUrl).toContain('/uploads/banners/');

    expect((await served(avatarUrl)).type).toBe('image/jpeg');

    const profile = await a.profiles.get(a.user.id);
    expect([profile.avatarUrl, profile.bannerUrl]).toEqual([avatarUrl, bannerUrl]);
  });

  it("an image cropped to the picker's aspect is accepted and served at the saved size", async () => {
    const a = await signUpAccount('pc');
    // Larger than what the server saves, in the aspect the picker crops to (1:1 and 3:1).
    const photos: Record<ImageKind, Buffer> = {
      avatar: gradientPng(1200, 1200),
      banner: gradientPng(2400, 800),
    };

    for (const kind of ['avatar', 'banner'] as const) {
      const image = picked(photos[kind], `${kind}.png`, 'image/png');
      expect(exceedsImageLimit(image.size)).toBe(false);

      const url = await upload(a, kind, image);
      const { type, bytes } = await served(url);
      expect(type).toBe('image/jpeg');
      // The server crops again; with the right aspect nothing is cut.
      expect({ kind, ...jpegSize(bytes) }).toEqual({ kind, ...SAVED_SIZE[kind] });
    }
  });

  it('replacing the avatar returns another URL', async () => {
    const a = await signUpAccount('pi');
    const first = await upload(a, 'avatar', tinyPng());
    const second = await upload(a, 'avatar', tinyPng());
    expect(second).not.toBe(first);
  });

  it('a corrupted file typed as an image is rejected with 400 (not 500)', async () => {
    const a = await signUpAccount('pj');
    const bad = picked(Buffer.from('isto não é um png'), 'ruim.png', 'image/png');
    // The file reached the image decoder (not the "no file" answer).
    expect(await apiErrorOf(upload(a, 'avatar', bad))).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Imagem inválida ou corrompida',
    });
  });

  it('a file that is not an image is rejected', async () => {
    const a = await signUpAccount('pk');
    const text = picked(Buffer.from('texto'), 'a.txt', 'text/plain');
    // Refused for its type (not the "no file" answer).
    expect(await apiErrorOf(upload(a, 'avatar', text))).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Arquivo precisa ser uma imagem',
    });
  });

  it('a file above 8 MiB is rejected by the server', async () => {
    const a = await signUpAccount('pl');
    const big = picked(
      Buffer.concat([TINY_PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1024)]),
      'grande.png',
      'image/png',
    );
    // The edit screen refuses it first when the picker reports the size.
    expect(exceedsImageLimit(big.size)).toBe(true);
    const error = await apiErrorOf(upload(a, 'avatar', big));
    expect(error).toMatchObject({ status: 400, code: 'validation_error' });
    // Refused for its size (the server's multipart limit), not for a missing file part.
    expect(error.message).not.toBe(NO_FILE_MESSAGE);
  });

  it("another user's public collection, favorites and posts", async () => {
    const a = await signUpAccount('pm');
    const b = await signUpAccount('pn');
    const game = await a.games.byIgdbId(FIXTURE_GAME_ONE);
    const entry = await a.library.create(FIXTURE_GAME_ONE, {
      platform: 'PC',
      status: 'completed',
      startedAt: null,
      finishedAt: null,
      hoursPlayed: 5,
      rating: null,
      notes: null,
    });
    await a.games.setFavorite(game.id, true);
    await a.feed.create({ content: 'post do A', gameEntryId: entry.id });

    const collection = await b.profiles.entries(a.user.id);
    expect(collection.map((e) => [e.id, e.hoursPlayed])).toEqual([[entry.id, 5]]);
    expect((await b.profiles.favorites(a.user.id)).map((g) => g.igdbId)).toEqual([
      FIXTURE_GAME_ONE,
    ]);

    const posts = await b.profiles.posts(a.user.id, 'post');
    expect(posts.items.map((p) => p.content)).toEqual(['post do A']);
    // The backend creates the activity post asynchronously.
    let activities: Post[] = [];
    await eventually(
      async () => {
        activities = (await b.profiles.posts(a.user.id, 'activity')).items;
        return activities.length > 0;
      },
      { reason: 'no activity post appeared' },
    );
    expect(activities.every((p) => p.type === 'activity')).toBe(true);
    expect(activities[0].activityStatus).toBe('completed');
  });

  it('the own profile edit shows in the account (GET /auth/me)', async () => {
    const a = await signUpAccount('po');
    await a.profiles.update({ name: 'Nome Novo' });
    expect((await authApi.me(a.app.api)).name).toBe('Nome Novo');
  });
});
