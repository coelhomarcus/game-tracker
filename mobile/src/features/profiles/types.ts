export type ImageKind = 'avatar' | 'banner';

/** An image chosen with the system picker, ready to upload. */
export type PickedImage = {
  uri: string;
  mimeType: string;
  fileName: string;
  size: number | null;
};

export type UserProfile = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  createdAt: Date;
  followerCount: number;
  followingCount: number;
  entryCount: number;
  isFollowedByMe: boolean;
};

/** One row of the people search. */
export type PersonResult = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isFollowedByMe: boolean;
};

// The API payloads are trusted for required fields; optional ones are read defensively.
type Json = Record<string, any>;

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

export function parseUserProfile(json: Json): UserProfile {
  return {
    id: json.id,
    username: json.username,
    name: nullableString(json.name),
    avatarUrl: nullableString(json.avatarUrl),
    bannerUrl: nullableString(json.bannerUrl),
    bio: nullableString(json.bio),
    createdAt: new Date(json.createdAt),
    followerCount: count(json.followerCount),
    followingCount: count(json.followingCount),
    entryCount: count(json.gameEntryCount),
    isFollowedByMe: json.isFollowedByMe === true,
  };
}

export function parsePersonResult(json: Json): PersonResult {
  return {
    id: json.id,
    username: json.username,
    name: nullableString(json.name),
    avatarUrl: nullableString(json.avatarUrl),
    bio: nullableString(json.bio),
    isFollowedByMe: json.isFollowedByMe === true,
  };
}
