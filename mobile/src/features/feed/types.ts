import { parseGame, parseUserSummary, type Game, type UserSummary } from '@/features/games/types';
import { parseStatus } from '@/features/library/status';
import type { GameStatus } from '@/theme/tokens';

export type PostType = 'status' | 'review' | 'activity';
export type FeedScope = 'general' | 'following';

/** The playthrough a post is linked to. It may be gone: deleting a record keeps the post. */
export type PostEntryRef = {
  id: string;
  platform: string;
};

export type Post = {
  id: string;
  author: UserSummary;
  content: string;
  type: PostType;
  /** Status snapshot at the time of the activity, never the playthrough's current status. */
  activityStatus: GameStatus | null;
  createdAt: Date;
  game: Game | null;
  entry: PostEntryRef | null;
  imageUrl: string | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

export type PostPage = {
  items: Post[];
  nextCursor: string | null;
};

export type Comment = {
  id: string;
  postId: string;
  author: UserSummary;
  content: string;
  createdAt: Date;
  parentCommentId: string | null;
  likeCount: number;
  likedByMe: boolean;
  replies: Comment[];
};

// The API payloads are trusted for required fields; optional ones are read defensively.
type Json = Record<string, any>;

const POST_TYPES: readonly string[] = ['status', 'review', 'activity'];

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function count(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function parsePostType(value: unknown): PostType {
  return typeof value === 'string' && POST_TYPES.includes(value) ? (value as PostType) : 'status';
}

function parseEntryRef(json: Json): PostEntryRef {
  return { id: json.id, platform: typeof json.platform === 'string' ? json.platform : '' };
}

export function parsePost(json: Json): Post {
  return {
    id: json.id,
    author: parseUserSummary(json.user),
    content: json.content,
    type: parsePostType(json.type),
    activityStatus: json.activityStatus == null ? null : parseStatus(String(json.activityStatus)),
    createdAt: new Date(json.createdAt),
    game: json.game == null ? null : parseGame(json.game),
    entry: json.gameEntry == null ? null : parseEntryRef(json.gameEntry),
    imageUrl: nullableString(json.imageUrl),
    likeCount: count(json.likeCount),
    commentCount: count(json.commentCount),
    likedByMe: json.likedByMe === true,
  };
}

export function parsePostPage(json: Json): PostPage {
  return {
    items: (json.items as Json[]).map(parsePost),
    nextCursor: nullableString(json.nextCursor),
  };
}

export function parseComment(json: Json): Comment {
  return {
    id: json.id,
    postId: json.postId,
    author: parseUserSummary(json.user),
    content: json.content,
    createdAt: new Date(json.createdAt),
    parentCommentId: nullableString(json.parentCommentId),
    likeCount: count(json.likeCount),
    likedByMe: json.likedByMe === true,
    replies: Array.isArray(json.replies) ? (json.replies as Json[]).map(parseComment) : [],
  };
}

/** The name is optional; the username is the fallback. Identify people by `id`. */
export function displayName(user: UserSummary): string {
  return user.name === null || user.name.trim() === '' ? user.username : user.name;
}
