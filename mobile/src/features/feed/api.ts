import { api } from '@/features/auth';
import { imageForm, type UploadableImage } from '@/lib/imageForm';

import {
  parseComment,
  parsePost,
  parsePostPage,
  type Comment,
  type CommentSort,
  type FeedScope,
  type Post,
  type PostImage,
  type PostPage,
} from './types';

const PAGE_SIZE = 20;
/** The server resizes images, but the upload itself can be large on a slow connection. */
const UPLOAD_TIMEOUT_MS = 120_000;

type Json = Record<string, unknown>;

/** An image the server stored for a post: the result of an upload, to send back on create. */
export type UploadedPostImage = Pick<PostImage, 'url'> & { width: number; height: number };

/** What `create` sends for an attached image. `alt` is optional. */
export type PostImageInput = UploadedPostImage & { alt?: string };

export type CreatePostInput = {
  content: string;
  gameId?: string;
  gameEntryId?: string;
  /** Makes the new post a quote of this one. */
  quotedPostId?: string;
  /** At most 4, each from `uploadPostImage`. */
  images?: PostImageInput[];
};

function pageQuery(cursor?: string): Record<string, string | number> {
  return cursor === undefined ? { limit: PAGE_SIZE } : { limit: PAGE_SIZE, cursor };
}

export const feedApi = {
  /** The server defaults to `following`, so the scope is always sent explicitly. */
  async feed(scope: FeedScope, cursor?: string): Promise<PostPage> {
    return parsePostPage(
      await api.get<Json>('/feed', { query: { scope, ...pageQuery(cursor) } }),
    );
  },

  /** `gameId` is the internal game id (`Game.id`), never the IGDB id. */
  async gamePosts(gameId: string, cursor?: string): Promise<PostPage> {
    return parsePostPage(
      await api.get<Json>(`/games/${gameId}/posts`, { query: pageQuery(cursor) }),
    );
  },

  async post(id: string): Promise<Post> {
    return parsePost(await api.get<Json>(`/posts/${id}`));
  },

  /**
   * With `gameEntryId` the backend derives the game; absent keys are omitted, never null. The
   * legacy `imageUrl` is never sent: images go through `uploadPostImage` and `images`.
   */
  async create(input: CreatePostInput): Promise<Post> {
    const body: Record<string, unknown> = { content: input.content.trim() };
    if (input.gameId !== undefined) body.gameId = input.gameId;
    if (input.gameEntryId !== undefined) body.gameEntryId = input.gameEntryId;
    if (input.quotedPostId !== undefined) body.quotedPostId = input.quotedPostId;
    if (input.images !== undefined && input.images.length > 0) {
      body.images = input.images.map(({ url, width, height, alt }) =>
        alt === undefined ? { url, width, height } : { url, width, height, alt },
      );
    }
    return parsePost(await api.post<Json>('/posts', body));
  },

  /** Uploads one image (multipart field `image`); the result is what `create` takes in `images`. */
  async uploadPostImage(image: UploadableImage): Promise<UploadedPostImage> {
    const json = await api.post<Json>('/posts/images', await imageForm('image', image), {
      timeoutMs: UPLOAD_TIMEOUT_MS,
    });
    return { url: json.url as string, width: json.width as number, height: json.height as number };
  },

  /** Only the author can delete (403 otherwise). Comments, likes and reposts of it go too. */
  async deletePost(postId: string): Promise<void> {
    await api.delete<void>(`/posts/${postId}`);
  },

  /** Only the comment's author can delete it (403 otherwise); its replies go with it. */
  async deleteComment(commentId: string): Promise<void> {
    await api.delete<void>(`/comments/${commentId}`);
  },

  /** Liking and unliking are idempotent on the backend (204 both ways). */
  async setLike(postId: string, liked: boolean): Promise<void> {
    if (liked) await api.post<void>(`/posts/${postId}/like`);
    else await api.delete<void>(`/posts/${postId}/like`);
  },

  /** Reposting and unreposting are idempotent on the backend (204 both ways). */
  async setRepost(postId: string, reposted: boolean): Promise<void> {
    if (reposted) await api.post<void>(`/posts/${postId}/repost`);
    else await api.delete<void>(`/posts/${postId}/repost`);
  },

  /** Bookmarks are private and idempotent (204 both ways). */
  async setBookmark(postId: string, bookmarked: boolean): Promise<void> {
    if (bookmarked) await api.post<void>(`/posts/${postId}/bookmark`);
    else await api.delete<void>(`/posts/${postId}/bookmark`);
  },

  /** The signed-in user's bookmarks, newest bookmark first. The cursor is opaque. */
  async bookmarks(cursor?: string): Promise<PostPage> {
    return parsePostPage(await api.get<Json>('/users/me/bookmarks', { query: pageQuery(cursor) }));
  },

  /** The posts the signed-in user liked, newest like first. The cursor is opaque. */
  async myLikes(cursor?: string): Promise<PostPage> {
    return parsePostPage(await api.get<Json>('/users/me/likes', { query: pageQuery(cursor) }));
  },

  /**
   * Posts whose text contains `term`, newest first. The server needs 2 to 100 characters after
   * trimming; the term is trimmed here, the length is the caller's to check.
   */
  async searchPosts(term: string, cursor?: string): Promise<PostPage> {
    return parsePostPage(
      await api.get<Json>('/posts/search', { query: { q: term.trim(), ...pageQuery(cursor) } }),
    );
  },

  /** The server orders oldest first when no `sort` is given. */
  async comments(postId: string, sort?: CommentSort): Promise<Comment[]> {
    const json = await api.get<Json[]>(
      `/posts/${postId}/comments`,
      sort === undefined ? undefined : { query: { sort } },
    );
    return json.map(parseComment);
  },

  async addComment(postId: string, content: string, parentCommentId?: string): Promise<void> {
    const body: Record<string, string> = { content };
    if (parentCommentId !== undefined) body.parentCommentId = parentCommentId;
    await api.post<void>(`/posts/${postId}/comments`, body);
  },

  async setCommentLike(commentId: string, liked: boolean): Promise<void> {
    if (liked) await api.post<void>(`/comments/${commentId}/like`);
    else await api.delete<void>(`/comments/${commentId}/like`);
  },
};
