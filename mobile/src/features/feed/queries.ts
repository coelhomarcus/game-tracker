import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { feedApi } from './api';
import { cancelPostQueries, restoreSnapshot, updatePostEverywhere, type Snapshot } from './postCache';
import type { Comment, FeedScope, Post, PostPage } from './types';

type PostPages = InfiniteData<PostPage, string | undefined>;

const nextPage = (last: PostPage) => last.nextCursor ?? undefined;

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery<PostPage, Error, PostPages, readonly unknown[], string | undefined>({
    queryKey: ['feed', scope],
    queryFn: ({ pageParam }) => feedApi.feed(scope, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextPage,
  });
}

export function useGamePosts(gameId?: string) {
  return useInfiniteQuery<PostPage, Error, PostPages, readonly unknown[], string | undefined>({
    queryKey: ['gamePosts', gameId],
    queryFn:
      gameId === undefined
        ? skipToken
        : ({ pageParam }) => feedApi.gamePosts(gameId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextPage,
  });
}

export function usePost(id: string) {
  return useQuery({ queryKey: ['post', id], queryFn: () => feedApi.post(id) });
}

export function useComments(postId: string) {
  return useQuery({ queryKey: ['comments', postId], queryFn: () => feedApi.comments(postId) });
}

/** Moves the post to `liked`, adjusting the count only when the cached copy differs. */
function withLike(liked: boolean) {
  return (p: Post): Post =>
    p.likedByMe === liked
      ? p
      : { ...p, likedByMe: liked, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) };
}

/** Optimistic everywhere the post is cached; no refetch on success. */
export function useTogglePostLike() {
  const client = useQueryClient();
  return useMutation<void, Error, Post, Snapshot>({
    mutationFn: (post) => feedApi.setLike(post.id, !post.likedByMe),
    onMutate: async (post) => {
      await cancelPostQueries(client, post.id);
      return updatePostEverywhere(client, post.id, withLike(!post.likedByMe));
    },
    onError: (_error, _post, snapshot) => {
      if (snapshot) restoreSnapshot(client, snapshot);
    },
  });
}

export function useCreatePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; gameId?: string; gameEntryId?: string }) =>
      feedApi.create(input),
    onSuccess: (post) => {
      const invalidations = [client.invalidateQueries({ queryKey: ['feed'] })];
      if (post.game) {
        invalidations.push(client.invalidateQueries({ queryKey: ['gamePosts', post.game.id] }));
      }
      return Promise.all(invalidations);
    },
  });
}

/** The caller trims `content`. */
export function useAddComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ content, parentCommentId }: { content: string; parentCommentId?: string }) =>
      feedApi.addComment(postId, content, parentCommentId),
    onSuccess: () => {
      updatePostEverywhere(client, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
      return client.invalidateQueries({ queryKey: ['comments', postId] });
    },
  });
}

function mapComment(comments: Comment[], id: string, update: (c: Comment) => Comment): Comment[] {
  let changed = false;
  const mapped = comments.map((comment) => {
    const replies = mapComment(comment.replies, id, update);
    let next = replies === comment.replies ? comment : { ...comment, replies };
    if (next.id === id) next = update(next);
    if (next !== comment) changed = true;
    return next;
  });
  return changed ? mapped : comments;
}

function withCommentLike(liked: boolean) {
  return (c: Comment): Comment =>
    c.likedByMe === liked
      ? c
      : { ...c, likedByMe: liked, likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)) };
}

export function useToggleCommentLike(postId: string) {
  const client = useQueryClient();
  const queryKey = ['comments', postId];
  return useMutation<void, Error, Comment, { previous: Comment[] | undefined }>({
    mutationFn: (comment) => feedApi.setCommentLike(comment.id, !comment.likedByMe),
    onMutate: async (comment) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<Comment[]>(queryKey);
      if (previous) {
        client.setQueryData(
          queryKey,
          mapComment(previous, comment.id, withCommentLike(!comment.likedByMe)),
        );
      }
      return { previous };
    },
    onError: (_error, _comment, context) => {
      if (context?.previous) client.setQueryData(queryKey, context.previous);
    },
  });
}
