import { api } from '@/features/auth';

import {
  parseComment,
  parsePost,
  parsePostPage,
  type Comment,
  type FeedScope,
  type Post,
  type PostPage,
} from './types';

const PAGE_SIZE = 20;

type Json = Record<string, unknown>;

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

  /** With `gameEntryId` the backend derives the game; absent keys are omitted, never null. */
  async create(input: { content: string; gameId?: string; gameEntryId?: string }): Promise<Post> {
    const body: Record<string, string> = { content: input.content.trim() };
    if (input.gameId !== undefined) body.gameId = input.gameId;
    if (input.gameEntryId !== undefined) body.gameEntryId = input.gameEntryId;
    return parsePost(await api.post<Json>('/posts', body));
  },

  /** Liking and unliking are idempotent on the backend (204 both ways). */
  async setLike(postId: string, liked: boolean): Promise<void> {
    if (liked) await api.post<void>(`/posts/${postId}/like`);
    else await api.delete<void>(`/posts/${postId}/like`);
  },

  async comments(postId: string): Promise<Comment[]> {
    const json = await api.get<Json[]>(`/posts/${postId}/comments`);
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
