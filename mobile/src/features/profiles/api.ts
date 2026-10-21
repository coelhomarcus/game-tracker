import { Platform } from 'react-native';

import { api, type User } from '@/features/auth';
import { parsePostPage, type PostPage } from '@/features/feed/types';
import { parseGame, type Game } from '@/features/games/types';
import { parseEntry, type GameEntry } from '@/features/library/types';

import {
  parsePersonResult,
  parseUserProfile,
  type ImageKind,
  type PersonResult,
  type PickedImage,
  type UserProfile,
} from './types';

const PAGE_SIZE = 20;

type Json = Record<string, unknown>;

export type ProfileChanges = { username?: string; name?: string; bio?: string };

/** The multipart field name and the response key are both the image kind. */
async function imageForm(kind: ImageKind, image: PickedImage): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    // The browser picker yields a blob: or data: URI, not a file path.
    const blob = await (await fetch(image.uri)).blob();
    form.append(kind, blob, image.fileName);
  } else {
    // React Native reads the file itself from this descriptor.
    form.append(kind, {
      uri: image.uri,
      name: image.fileName,
      type: image.mimeType,
    } as unknown as Blob);
  }
  return form;
}

export const profilesApi = {
  async get(id: string): Promise<UserProfile> {
    return parseUserProfile(await api.get<Json>(`/users/${id}`));
  },

  async search(term: string): Promise<PersonResult[]> {
    const json = await api.get<Json[]>('/users/search', { query: { q: term } });
    return json.map(parsePersonResult);
  },

  /** `type` separates the activity tab from the posts tab. */
  async posts(id: string, type: 'activity' | 'post', cursor?: string): Promise<PostPage> {
    const query =
      cursor === undefined ? { type, limit: PAGE_SIZE } : { type, limit: PAGE_SIZE, cursor };
    return parsePostPage(await api.get<Json>(`/users/${id}/posts`, { query }));
  },

  async entries(id: string): Promise<GameEntry[]> {
    const json = await api.get<Json[]>(`/users/${id}/game-entries`);
    return json.map(parseEntry);
  },

  async favorites(id: string): Promise<Game[]> {
    const json = await api.get<Json[]>(`/users/${id}/favorites`);
    return json.map(parseGame);
  },

  /** Following and unfollowing are idempotent on the backend (204 both ways). */
  async setFollow(id: string, follow: boolean): Promise<void> {
    if (follow) await api.post<void>(`/users/${id}/follow`);
    else await api.delete<void>(`/users/${id}/follow`);
  },

  /** Sends only the given keys; the backend keeps whatever is omitted. */
  async update(changes: ProfileChanges): Promise<User> {
    const body: ProfileChanges = {};
    if (changes.username !== undefined) body.username = changes.username;
    if (changes.name !== undefined) body.name = changes.name;
    if (changes.bio !== undefined) body.bio = changes.bio;
    return api.patch<User>('/users/me', body);
  },

  /** Uploads the image and returns its new URL. */
  async upload(kind: ImageKind, image: PickedImage): Promise<string> {
    const json = await api.post<{ avatarUrl?: string; bannerUrl?: string }>(
      `/users/me/${kind}`,
      await imageForm(kind, image),
    );
    return (kind === 'avatar' ? json.avatarUrl : json.bannerUrl) as string;
  },
};
