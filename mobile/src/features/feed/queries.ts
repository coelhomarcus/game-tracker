import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { authErrorMessage } from "@/features/auth";
import { invalidateOwnProfile } from "@/features/profiles/ownProfile";
import { showToast } from "@/lib/toast";

import { feedApi, type CreatePostInput } from "./api";
import {
  anyToggleInFlight,
  beginToggle,
  runInLane,
  settleToggle,
  toggleLane,
  type ToggleAction,
} from "./likeLanes";
import {
  cancelCommentQueries,
  cancelPostQueries,
  findCachedPost,
  removePostEverywhere,
  resumeInterrupted,
  updatePostEverywhere,
} from "./postCache";
import type { Comment, FeedScope, Post, PostPage } from "./types";

type PostPages = InfiniteData<PostPage, string | undefined>;

const nextPage = (last: PostPage) => last.nextCursor ?? undefined;

export function useFeed(scope: FeedScope) {
  return useInfiniteQuery<
    PostPage,
    Error,
    PostPages,
    readonly unknown[],
    string | undefined
  >({
    queryKey: ["feed", scope],
    queryFn: ({ pageParam }) => feedApi.feed(scope, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextPage,
  });
}

export function useGamePosts(gameId?: string) {
  return useInfiniteQuery<
    PostPage,
    Error,
    PostPages,
    readonly unknown[],
    string | undefined
  >({
    queryKey: ["gamePosts", gameId],
    queryFn:
      gameId === undefined
        ? skipToken
        : ({ pageParam }) => feedApi.gamePosts(gameId, pageParam),
    initialPageParam: undefined,
    getNextPageParam: nextPage,
  });
}

/** Opens on the copy a cached feed already holds, then settles on the fetched post. */
export function usePost(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ['post', id],
    queryFn: () => feedApi.post(id),
    placeholderData: () => findCachedPost(client, id),
  });
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: ["comments", postId],
    queryFn: () => feedApi.comments(postId),
  });
}

type PostToggleAction = Exclude<ToggleAction, "commentLike">;
type PostFlag = "likedByMe" | "repostedByMe" | "bookmarkedByMe";
type PostCounter = "likeCount" | "repostCount" | "bookmarkCount";

/** Each post toggle: the flag it flips, the counter that follows it and its request. */
const POST_TOGGLES: Record<
  PostToggleAction,
  {
    flag: PostFlag;
    counter: PostCounter;
    request: (postId: string, on: boolean) => Promise<void>;
  }
> = {
  like: {
    flag: "likedByMe",
    counter: "likeCount",
    request: (postId, on) => feedApi.setLike(postId, on),
  },
  repost: {
    flag: "repostedByMe",
    counter: "repostCount",
    request: (postId, on) => feedApi.setRepost(postId, on),
  },
  bookmark: {
    flag: "bookmarkedByMe",
    counter: "bookmarkCount",
    request: (postId, on) => feedApi.setBookmark(postId, on),
  },
};

/** Moves the post's flag to `on`, adjusting the counter only when the cached copy differs. */
function withFlag(flag: PostFlag, counter: PostCounter, on: boolean) {
  return (p: Post): Post =>
    p[flag] === on
      ? p
      : { ...p, [flag]: on, [counter]: Math.max(0, p[counter] + (on ? 1 : -1)) };
}

/**
 * Optimistic everywhere the post is cached. Requests of one post and action run in order; a
 * failure reverts only that post and action, and only once no later tap of it is pending.
 * `afterAll` runs once no toggle of any post is in flight any more.
 */
function usePostToggle(
  action: PostToggleAction,
  afterAll?: (client: QueryClient) => void,
) {
  const client = useQueryClient();
  const { flag, counter, request } = POST_TOGGLES[action];
  const settle = (post: Post, error?: Error) => {
    const to = settleToggle(toggleLane(action, post.id), !post[flag], !error);
    if (to !== undefined) {
      updatePostEverywhere(client, post.id, withFlag(flag, counter, to));
      if (error) showToast(authErrorMessage(error));
    }
    if (!anyToggleInFlight()) {
      resumeInterrupted(client);
      afterAll?.(client);
    }
  };
  return useMutation<void, Error, Post>({
    mutationFn: (post) =>
      runInLane(toggleLane(action, post.id), () => request(post.id, !post[flag])),
    onMutate: async (post) => {
      beginToggle(toggleLane(action, post.id), post[flag]);
      await cancelPostQueries(client, post.id);
      updatePostEverywhere(client, post.id, withFlag(flag, counter, !post[flag]));
    },
    onSuccess: (_data, post) => settle(post),
    onError: (error, post) => settle(post, error),
  });
}

/** Likes or unlikes the post the user saw (the cached copy the parent passes). */
export function useTogglePostLike() {
  return usePostToggle("like");
}

/** Reposts or undoes the repost; the own profile lists it, so it is refreshed afterwards. */
export function useTogglePostRepost() {
  return usePostToggle("repost", (client) => {
    void invalidateOwnProfile(client, { entries: false });
  });
}

/** Saves the post or removes it from the saved posts. */
export function useTogglePostBookmark() {
  return usePostToggle("bookmark", (client) => {
    void client.invalidateQueries({ queryKey: ["bookmarks"] });
  });
}

/** Deletes an own post and takes it out of every cached list once the server confirms. */
export function useDeletePost() {
  const client = useQueryClient();
  return useMutation<void, Error, Post>({
    mutationFn: (post) => feedApi.deletePost(post.id),
    onSuccess: async (_data, post) => {
      await cancelPostQueries(client, post.id);
      removePostEverywhere(client, post.id);
      if (!anyToggleInFlight()) resumeInterrupted(client);
      showToast("Post apagado");
      void invalidateOwnProfile(client, { entries: false });
    },
    onError: (error) => showToast(authErrorMessage(error)),
  });
}

export function useCreatePost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePostInput) => feedApi.create(input),
    onSuccess: (post) => {
      const invalidations: Promise<unknown>[] = [
        client.invalidateQueries({ queryKey: ["feed"] }),
        invalidateOwnProfile(client, { entries: false }),
      ];
      if (post.quotedPostId) {
        updatePostEverywhere(client, post.quotedPostId, (p) => ({
          ...p,
          quoteCount: p.quoteCount + 1,
        }));
      }
      if (post.game) {
        invalidations.push(
          client.invalidateQueries({ queryKey: ["gamePosts", post.game.id] }),
        );
      }
      return Promise.all(invalidations);
    },
  });
}

/** The caller trims `content`. */
export function useAddComment(postId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      content,
      parentCommentId,
    }: {
      content: string;
      parentCommentId?: string;
    }) => feedApi.addComment(postId, content, parentCommentId),
    onSuccess: () => {
      updatePostEverywhere(client, postId, (p) => ({
        ...p,
        commentCount: p.commentCount + 1,
      }));
      return client.invalidateQueries({ queryKey: ["comments", postId] });
    },
  });
}

function mapComment(
  comments: Comment[],
  id: string,
  update: (c: Comment) => Comment,
): Comment[] {
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
      : {
          ...c,
          likedByMe: liked,
          likeCount: Math.max(0, c.likeCount + (liked ? 1 : -1)),
        };
}

export function useToggleCommentLike(postId: string) {
  const client = useQueryClient();
  const queryKey = ["comments", postId];
  const update = (id: string, liked: boolean) =>
    client.setQueryData<Comment[]>(queryKey, (tree) =>
      tree ? mapComment(tree, id, withCommentLike(liked)) : tree,
    );
  const settle = (comment: Comment, error?: Error) => {
    const to = settleToggle(toggleLane("commentLike", comment.id), !comment.likedByMe, !error);
    if (to !== undefined) {
      update(comment.id, to);
      if (error) showToast(authErrorMessage(error));
    }
    if (!anyToggleInFlight()) resumeInterrupted(client);
  };
  return useMutation<void, Error, Comment>({
    mutationFn: (comment) =>
      runInLane(toggleLane("commentLike", comment.id), () =>
        feedApi.setCommentLike(comment.id, !comment.likedByMe),
      ),
    onMutate: async (comment) => {
      beginToggle(toggleLane("commentLike", comment.id), comment.likedByMe);
      await cancelCommentQueries(client, postId);
      update(comment.id, !comment.likedByMe);
    },
    onSuccess: (_data, comment) => settle(comment),
    onError: (error, comment) => settle(comment, error),
  });
}
