import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import { authErrorMessage } from "@/features/auth";
import {
  invalidateOwnLikes,
  invalidateOwnProfile,
  invalidateOwnReplies,
} from "@/features/profiles/ownProfile";
import { showToast } from "@/lib/toast";

import { feedApi, type CreatePostInput } from "./api";
import {
  anyToggleInFlight,
  beginToggle,
  runInLane,
  settleToggle,
  skipToggle,
  SUPERSEDED,
  toggleInFlight,
  type Superseded,
  toggleLane,
  type ToggleAction,
} from "./likeLanes";
import {
  cancelCommentQueries,
  cancelPostQueries,
  countWithReplies,
  findCachedPost,
  isDeletedPost,
  removeCommentEverywhere,
  removePostEverywhere,
  resumeInterrupted,
  updateCommentEverywhere,
  updatePostEverywhere,
} from "./postCache";
import type { Comment, CommentSort, FeedScope, Post, PostPage } from "./types";

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

/** Tells whether the user deleted a post in this session, e.g. when its page is shown again. */
export function useDeletedPostCheck(): (postId: string) => boolean {
  const client = useQueryClient();
  return useCallback((postId: string) => isDeletedPost(client, postId), [client]);
}

/** The comment tree in `sort` order; each order is its own cache entry. */
export function useComments(postId: string, sort: CommentSort) {
  return useQuery({
    queryKey: ["comments", postId, sort],
    queryFn: () => feedApi.comments(postId, sort),
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

type Refresh = (client: QueryClient) => void;

/** The own profile lists the user's reposts and posts. */
const refreshOwnProfile: Refresh = (client) => {
  void invalidateOwnProfile(client, { entries: false });
};
const refreshBookmarks: Refresh = (client) => {
  void client.invalidateQueries({ queryKey: ["bookmarks"] });
};
/** The own profile's Curtidas tab lists what the user liked. */
const refreshOwnLikes: Refresh = (client) => {
  void invalidateOwnLikes(client);
};

/**
 * Refreshes that wait for every toggle to end: a refetch started while a toggle is still in
 * flight could undo its optimistic write. Whichever toggle ends last runs them, each once.
 */
const afterIdle = new Set<Refresh>();

/**
 * Queues `refresh` (if given) and, once no toggle of any post or comment is in flight, restarts
 * the fetches the toggles cancelled and runs every queued refresh.
 */
function whenIdle(client: QueryClient, refresh?: Refresh): void {
  if (refresh) afterIdle.add(refresh);
  if (anyToggleInFlight()) return;
  resumeInterrupted(client);
  const queued = [...afterIdle];
  afterIdle.clear();
  for (const run of queued) run(client);
}

/**
 * Optimistic everywhere the post is cached. Requests of one post and action run in order, and a
 * tap waiting behind another is dropped when a later tap replaces it; a failure reverts only
 * that post and action, and only once no later tap of it is pending. `afterAll` runs once no
 * toggle of any post or comment is in flight any more.
 */
function usePostToggle(
  action: PostToggleAction,
  afterAll?: Refresh,
) {
  const client = useQueryClient();
  const { flag, counter, request } = POST_TOGGLES[action];
  const settle = (post: Post, error?: Error) => {
    const to = settleToggle(toggleLane(action, post.id), !post[flag], !error);
    if (to !== undefined) {
      updatePostEverywhere(client, post.id, withFlag(flag, counter, to));
      if (error) showToast(authErrorMessage(error));
    }
    whenIdle(client, afterAll);
  };
  return useMutation<void | Superseded, Error, Post>({
    mutationFn: (post) =>
      runInLane(toggleLane(action, post.id), () => request(post.id, !post[flag])),
    onMutate: async (post) => {
      beginToggle(toggleLane(action, post.id), post[flag]);
      await cancelPostQueries(client, post.id);
      updatePostEverywhere(client, post.id, withFlag(flag, counter, !post[flag]));
    },
    onSuccess: (result, post) => {
      if (result !== SUPERSEDED) return settle(post);
      skipToggle(toggleLane(action, post.id));
      whenIdle(client, afterAll);
    },
    onError: (error, post) => settle(post, error),
  });
}

/**
 * Likes or unlikes the post the user saw (the cached copy the parent passes); the own Curtidas
 * tab is refreshed afterwards.
 */
export function useTogglePostLike() {
  return usePostToggle("like", refreshOwnLikes);
}

/** Reposts or undoes the repost; the own profile lists it, so it is refreshed afterwards. */
export function useTogglePostRepost() {
  return usePostToggle("repost", refreshOwnProfile);
}

/** Saves the post or removes it from the saved posts. */
export function useTogglePostBookmark() {
  return usePostToggle("bookmark", refreshBookmarks);
}

/** Deletes an own post and takes it out of every cached list once the server confirms. */
export function useDeletePost() {
  const client = useQueryClient();
  return useMutation<void, Error, Post>({
    mutationFn: (post) => feedApi.deletePost(post.id),
    onSuccess: async (_data, post) => {
      await cancelPostQueries(client, post.id);
      removePostEverywhere(client, post);
      // The post's comments went with it: any Respostas list may hold one of them.
      void client.invalidateQueries({ queryKey: ["userReplies"] });
      showToast("Post apagado");
      whenIdle(client, refreshOwnProfile);
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

/** The caller trims `content`. Every sort order of the comments is refetched. */
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
      // The own profile lists the comment under Respostas.
      void invalidateOwnReplies(client);
      return client.invalidateQueries({ queryKey: ["comments", postId] });
    },
  });
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

/** Optimistic in every cached sort order of the post's comments, with the post toggles' lanes. */
export function useToggleCommentLike(postId: string) {
  const client = useQueryClient();
  const update = (id: string, liked: boolean) =>
    updateCommentEverywhere(client, postId, id, withCommentLike(liked));
  const settle = async (comment: Comment, error?: Error) => {
    const lane = toggleLane("commentLike", comment.id);
    const to = settleToggle(lane, !comment.likedByMe, !error);
    if (to !== undefined) {
      update(comment.id, to);
      if (error) showToast(authErrorMessage(error));
    } else if (!error && !toggleInFlight(lane)) {
      // A sort order first loaded while the like was on its way (the user switched orders) may
      // not hold it. One still loading is stopped (and fetched again once the server holds every
      // toggle) before every cached order gets the final state: a cancel reverts its query.
      await cancelCommentQueries(client, postId);
      update(comment.id, !comment.likedByMe);
    }
    whenIdle(client);
  };
  return useMutation<void | Superseded, Error, Comment>({
    mutationFn: (comment) =>
      runInLane(toggleLane("commentLike", comment.id), () =>
        feedApi.setCommentLike(comment.id, !comment.likedByMe),
      ),
    onMutate: async (comment) => {
      beginToggle(toggleLane("commentLike", comment.id), comment.likedByMe);
      await cancelCommentQueries(client, postId);
      update(comment.id, !comment.likedByMe);
    },
    onSuccess: (result, comment) => {
      if (result !== SUPERSEDED) return settle(comment);
      skipToggle(toggleLane("commentLike", comment.id));
      whenIdle(client);
    },
    onError: (error, comment) => settle(comment, error),
  });
}

/**
 * Deletes an own comment once the server confirms: it leaves every cached sort order with its
 * replies (the server deletes them too), and the post's comment count drops by as many
 * everywhere.
 */
export function useDeleteComment(postId: string) {
  const client = useQueryClient();
  return useMutation<void, Error, Comment>({
    mutationFn: (comment) => feedApi.deleteComment(comment.id),
    onSuccess: async (_data, comment) => {
      await cancelCommentQueries(client, postId);
      const removed =
        removeCommentEverywhere(client, postId, comment.id) || countWithReplies(comment);
      updatePostEverywhere(client, postId, (p) => ({
        ...p,
        commentCount: Math.max(0, p.commentCount - removed),
      }));
      showToast("Comentário apagado");
      void invalidateOwnReplies(client);
      whenIdle(client);
    },
    onError: (error) => showToast(authErrorMessage(error)),
  });
}
