import type { Href } from 'expo-router';

import { parseGame, parseUserSummary, type Game, type UserSummary } from '@/features/games/types';
import { parseStatus } from '@/features/library/status';
import type { GameStatus } from '@/theme/tokens';

export type PostType = 'status' | 'review' | 'activity';
export type TimelineType = 'post' | 'activity';
export type FeedScope = 'general' | 'following';

/** Unknown and older references use the legacy route, which resolves the type on load. */
export function itemHref(id: string, type?: PostType | null): Href {
  return (type === 'activity' ? `/activities/${id}` : `/posts/${id}`) as Href;
}

/** The playthrough a post is linked to. It may be gone: deleting a record keeps the post. */
export type PostEntryRef = {
  id: string;
  platform: string;
};

/** One attached image. Width and height are null for an image that predates their storage. */
export type PostImage = {
  url: string;
  width: number | null;
  height: number | null;
  alt: string | null;
};

/** The original of a quote post: a summary, one level deep, without counters. */
export type QuotedPost = {
  id: string;
  author: UserSummary;
  content: string;
  type: PostType;
  activityStatus: GameStatus | null;
  images: PostImage[];
  game: Game | null;
  createdAt: Date;
};

/** Preview fields are optional on replies returned by older servers. */
export type PostReference = Pick<QuotedPost, 'id' | 'author' | 'content'> &
  Partial<Pick<QuotedPost, 'type' | 'images' | 'game' | 'createdAt'>>;

/** The repost or reply that brought the original post into the feed. */
export type PostReason =
  | { type: 'repost'; by: UserSummary; at: Date }
  | { type: 'reply'; id: string; by: UserSummary; at: Date; content: string };

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
  /** The first image's URL, kept for older clients; `images` is the full list. */
  imageUrl: string | null;
  images: PostImage[];
  likeCount: number;
  commentCount: number;
  repostCount: number;
  quoteCount: number;
  bookmarkCount: number;
  likedByMe: boolean;
  repostedByMe: boolean;
  bookmarkedByMe: boolean;
  /**
   * Set on a quote post; `quotedPost` is null when the original was deleted. Then `quotedPostId`
   * is null as well and `quotedPostRemoved` is true (show "post removido"); a post that quotes
   * nothing has all three empty.
   */
  quotedPostId: string | null;
  quotedPost: QuotedPost | null;
  quotedPostRemoved: boolean;
  /** Only on feed, profile and bookmark items; the same post can appear once per reposter. */
  reason: PostReason | null;
};

export type CommentSort = 'top' | 'oldest' | 'newest';

/**
 * A list key: the same post appears as the original and once per reposter, so the post id alone
 * would repeat.
 */
export function postKey(post: Pick<Post, 'id' | 'reason'>): string {
  if (post.reason?.type === 'reply') return `reply:${post.reason.id}`;
  return post.reason ? `repost:${post.id}:${post.reason.by.id}` : `post:${post.id}`;
}

// The API answers 500 to an id that is not a UUID, so such an id is simply not a post.
const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `value` can be a post id at all (a UUID), e.g. one read from an address. */
export function isPostId(value: string): boolean {
  return POST_ID_PATTERN.test(value);
}

/** The summary a quote shows of `post`, e.g. in the composer before the quote exists. */
export function toQuotedPost(post: Post): QuotedPost {
  return {
    id: post.id,
    author: post.author,
    content: post.content,
    type: post.type,
    activityStatus: post.activityStatus,
    images: post.images,
    game: post.game,
    createdAt: post.createdAt,
  };
}

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

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseImage(json: Json): PostImage | null {
  if (typeof json?.url !== 'string') return null;
  return {
    url: json.url,
    width: nullableNumber(json.width),
    height: nullableNumber(json.height),
    alt: nullableString(json.alt),
  };
}

/** The images list; a post without one falls back to its legacy single `imageUrl`. */
function parseImages(json: Json): PostImage[] {
  if (Array.isArray(json.images)) {
    return (json.images as Json[]).map(parseImage).filter((image) => image !== null);
  }
  return typeof json.imageUrl === 'string'
    ? [{ url: json.imageUrl, width: null, height: null, alt: null }]
    : [];
}

export function parseQuotedPost(json: Json): QuotedPost {
  return {
    id: json.id,
    author: parseUserSummary(json.user),
    content: typeof json.content === 'string' ? json.content : '',
    type: parsePostType(json.type),
    activityStatus: json.activityStatus == null ? null : parseStatus(String(json.activityStatus)),
    images: parseImages(json),
    game: json.game == null ? null : parseGame(json.game),
    createdAt: new Date(json.createdAt),
  };
}

function parseReason(json: Json | null | undefined): PostReason | null {
  if (json?.by == null) return null;
  const by = parseUserSummary(json.by);
  const at = new Date(json.at);
  if (json.type === 'repost') return { type: 'repost', by, at };
  if (json.type === 'reply' && typeof json.id === 'string' && typeof json.content === 'string') {
    return { type: 'reply', id: json.id, by, at, content: json.content };
  }
  return null;
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
    images: parseImages(json),
    likeCount: count(json.likeCount),
    commentCount: count(json.commentCount),
    repostCount: count(json.repostCount),
    quoteCount: count(json.quoteCount),
    bookmarkCount: count(json.bookmarkCount),
    likedByMe: json.likedByMe === true,
    repostedByMe: json.repostedByMe === true,
    bookmarkedByMe: json.bookmarkedByMe === true,
    quotedPostId: nullableString(json.quotedPostId),
    quotedPost: json.quotedPost == null ? null : parseQuotedPost(json.quotedPost),
    quotedPostRemoved: json.quotedPostRemoved === true,
    reason: parseReason(json.reason),
  };
}

export function parsePostPage(json: Json, type?: TimelineType): PostPage {
  const items = (json.items as Json[]).map(parsePost);
  return {
    items: type === undefined ? items : items.filter((item) => type === 'activity'
      ? item.type === 'activity' && item.reason === null
      : item.type !== 'activity'),
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
