import { parseUserSummary, type UserSummary } from '@/features/games/types';

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
  /** The profile's owner follows the signed-in user. */
  followsMe: boolean;
  /** The signed-in user muted this person: their posts leave the feeds and notifications. */
  isMutedByMe: boolean;
  /** The signed-in user blocked this person. */
  isBlockedByMe: boolean;
  /** This person blocked the signed-in user. */
  blocksMe: boolean;
  /** Whether the signed-in user may message this person (blocks and their message policy). */
  canMessage: boolean;
};

/** One row of the people search. */
export type PersonResult = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isFollowedByMe: boolean;
  /**
   * Whether the signed-in user may message this person now (blocks and their message policy).
   * Only the people search says; absent where the server does not.
   */
  canMessage?: boolean;
};

/** One row of a followers/following list: a search result plus whether they follow the viewer. */
export type FollowListPerson = PersonResult & { followsMe: boolean };

export type FollowListPage = { items: FollowListPerson[]; nextCursor: string | null };

/**
 * One "Sugestões para seguir" row: never someone the viewer follows. `followedByCount` is how many of
 * the people the viewer follows follow them (0 for the most-followed people that fill the list).
 */
export type SuggestedPerson = FollowListPerson & { followedByCount: number };

/** One comment a user wrote, with the post it answers (the Respostas tab of a profile). */
export type UserReply = {
  id: string;
  postId: string;
  parentCommentId: string | null;
  content: string;
  createdAt: Date;
  /** The post the comment is on: its author and text, quoted under the comment. */
  post: { id: string; author: UserSummary; content: string };
};

export type UserReplyPage = { items: UserReply[]; nextCursor: string | null };

/** A page of the accounts the signed-in user muted or blocked, newest first. */
export type ModerationPage = { items: UserSummary[]; nextCursor: string | null };

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
    followsMe: json.followsMe === true,
    isMutedByMe: json.isMutedByMe === true,
    isBlockedByMe: json.isBlockedByMe === true,
    blocksMe: json.blocksMe === true,
    // A server that predates the policy lets everyone message.
    canMessage: json.canMessage !== false,
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
    ...(typeof json.canMessage === 'boolean' ? { canMessage: json.canMessage } : {}),
  };
}

export function parseFollowListPage(json: Json): FollowListPage {
  return {
    items: (json.items as Json[]).map((item) => ({
      ...parsePersonResult(item),
      followsMe: item.followsMe === true,
    })),
    nextCursor: nullableString(json.nextCursor),
  };
}

export function parseSuggestedPerson(json: Json): SuggestedPerson {
  return {
    ...parsePersonResult(json),
    followsMe: json.followsMe === true,
    followedByCount: count(json.followedByCount),
  };
}

/** `GET /users/:id/comments`: comment rows, each with its post and the post's author. */
export function parseUserReplyPage(json: Json): UserReplyPage {
  return {
    items: (json.items as Json[]).map((item) => ({
      id: item.id,
      postId: item.postId,
      parentCommentId: nullableString(item.parentCommentId),
      content: typeof item.content === 'string' ? item.content : '',
      createdAt: new Date(item.createdAt),
      post: {
        id: item.post?.id ?? item.postId,
        author: parseUserSummary(item.post?.user ?? {}),
        content: typeof item.post?.content === 'string' ? item.post.content : '',
      },
    })),
    nextCursor: nullableString(json.nextCursor),
  };
}

/** `GET /users/me/mutes` and `/users/me/blocks`. */
export function parseModerationPage(json: Json): ModerationPage {
  return {
    items: (json.items as Json[]).map(parseUserSummary),
    nextCursor: nullableString(json.nextCursor),
  };
}
