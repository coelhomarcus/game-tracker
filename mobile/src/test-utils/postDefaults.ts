import type { Post } from '@/features/feed/types';

/** The social fields of a `Post` (reposts, bookmarks, quotes, images) at their empty values. */
export const socialDefaults: Pick<
  Post,
  | 'images'
  | 'repostCount'
  | 'quoteCount'
  | 'bookmarkCount'
  | 'repostedByMe'
  | 'bookmarkedByMe'
  | 'quotedPostId'
  | 'quotedPost'
  | 'quotedPostRemoved'
  | 'reason'
> = {
  images: [],
  repostCount: 0,
  quoteCount: 0,
  bookmarkCount: 0,
  repostedByMe: false,
  bookmarkedByMe: false,
  quotedPostId: null,
  quotedPost: null,
  quotedPostRemoved: false,
  reason: null,
};
