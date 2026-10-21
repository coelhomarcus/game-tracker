import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  authErrorMessage,
  queryClient as sharedQueryClient,
  useSession,
} from "@/features/auth";
import { showToast } from "@/lib/toast";

import { feedApi } from "../api";
import {
  useAddComment,
  useComments,
  useCreatePost,
  useFeed,
  useGamePosts,
  useToggleCommentLike,
  useTogglePostLike,
} from "../queries";
import type { Comment, Post, PostPage } from "../types";

jest.mock("@/lib/toast", () => ({ showToast: jest.fn() }));
jest.mock("@/features/feed/api", () => ({
  feedApi: {
    feed: jest.fn(),
    gamePosts: jest.fn(),
    post: jest.fn(),
    create: jest.fn(),
    setLike: jest.fn(),
    comments: jest.fn(),
    addComment: jest.fn(),
    setCommentLike: jest.fn(),
  },
}));

const mocked = jest.mocked(feedApi);

type Pages = InfiniteData<PostPage, string | undefined>;

const author = { id: "u1", username: "ana", name: null, avatarUrl: null };

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    author,
    content: `post ${id}`,
    type: "status",
    activityStatus: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 2,
    commentCount: 1,
    likedByMe: false,
    ...overrides,
  };
}

function comment(
  id: string,
  replies: Comment[] = [],
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    postId: "p1",
    author,
    content: `comment ${id}`,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    parentCommentId: null,
    likeCount: 0,
    likedByMe: false,
    replies,
    ...overrides,
  };
}

function singlePage(items: Post[]): Pages {
  return { pages: [{ items, nextCursor: null }], pageParams: [undefined] };
}

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

/** `target` is second in the feed, first in the game posts, and open in the detail. */
function seedEverywhere(client: QueryClient, target: Post) {
  client.setQueryData(["feed", "general"], singlePage([post("other"), target]));
  client.setQueryData(["gamePosts", "g1"], singlePage([target]));
  client.setQueryData(["post", target.id], target);
}

function cachedPost(client: QueryClient, key: unknown[], index = 0): Post {
  return client.getQueryData<Pages>(key)!.pages[0].items[index];
}

function snapshotAll(client: QueryClient) {
  return [
    client.getQueryData(["feed", "general"]),
    client.getQueryData(["gamePosts", "g1"]),
    client.getQueryData(["post", "p1"]),
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("feed queries", () => {
  it("useFeed chains pages through nextCursor", async () => {
    mocked.feed.mockResolvedValueOnce({ items: [post("a")], nextCursor: "c1" });
    mocked.feed.mockResolvedValueOnce({ items: [post("b")], nextCursor: null });
    const { result } = await renderHook(() => useFeed("general"), {
      wrapper: wrapperFor(freshClient()),
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(mocked.feed).toHaveBeenLastCalledWith("general", undefined);
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocked.feed).toHaveBeenLastCalledWith("general", "c1");
    expect(result.current.data?.pages.map((p) => p.items[0].id)).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("useGamePosts chains pages and stays idle without a game id", async () => {
    mocked.gamePosts.mockResolvedValueOnce({
      items: [post("a")],
      nextCursor: "c1",
    });
    mocked.gamePosts.mockResolvedValueOnce({
      items: [post("b")],
      nextCursor: null,
    });
    const client = freshClient();
    const { result } = await renderHook(() => useGamePosts("g1"), {
      wrapper: wrapperFor(client),
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(mocked.gamePosts).toHaveBeenLastCalledWith("g1", "c1");

    const idle = await renderHook(() => useGamePosts(undefined), {
      wrapper: wrapperFor(client),
    });
    expect(idle.result.current.fetchStatus).toBe("idle");
    expect(mocked.gamePosts).toHaveBeenCalledTimes(2);
  });

  it("drops the cached feed when the shared cache is cleared on sign-out", async () => {
    mocked.feed.mockResolvedValueOnce({
      items: [post("old")],
      nextCursor: null,
    });
    const first = await renderHook(() => useFeed("general"), {
      wrapper: wrapperFor(sharedQueryClient),
    });
    await waitFor(() =>
      expect(first.result.current.data?.pages).toHaveLength(1),
    );
    expect(sharedQueryClient.getQueryData(["feed", "general"])).toBeDefined();
    await first.unmount();

    await act(async () => {
      useSession.setState({ status: "signedOut", user: null });
      sharedQueryClient.clear();
    });

    expect(sharedQueryClient.getQueryData(["feed", "general"])).toBeUndefined();
  });
});

describe("useTogglePostLike", () => {
  it("flips the like in the feed, the game posts and the detail at once", async () => {
    let resolve!: () => void;
    mocked.setLike.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const client = freshClient();
    const target = post("p1");
    seedEverywhere(client, target);
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(target);
    });

    expect(cachedPost(client, ["feed", "general"], 1)).toMatchObject({
      likedByMe: true,
      likeCount: 3,
    });
    expect(cachedPost(client, ["gamePosts", "g1"])).toMatchObject({
      likedByMe: true,
      likeCount: 3,
    });
    expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
      likedByMe: true,
      likeCount: 3,
    });
    expect(cachedPost(client, ["feed", "general"])).toEqual(post("other"));
    expect(mocked.setLike).toHaveBeenCalledWith("p1", true);

    await act(async () => resolve());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cachedPost(client, ["feed", "general"], 1)).toMatchObject({
      likedByMe: true,
      likeCount: 3,
    });
  });

  it("unlikes using the state the user saw", async () => {
    mocked.setLike.mockResolvedValue(undefined);
    const client = freshClient();
    const target = post("p1", { likedByMe: true, likeCount: 5 });
    seedEverywhere(client, target);
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(target);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocked.setLike).toHaveBeenCalledWith("p1", false);
    expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
      likedByMe: false,
      likeCount: 4,
    });
  });

  it("restores all three caches when the request fails", async () => {
    mocked.setLike.mockRejectedValue(new Error("offline"));
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const before = snapshotAll(client);
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("p1"));
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(snapshotAll(client)).toEqual(before);
    expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
      likedByMe: false,
      likeCount: 2,
    });
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(authErrorMessage(new Error("offline")));
  });

  it("does not show a toast when the like succeeds", async () => {
    mocked.setLike.mockResolvedValue(undefined);
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("p1"));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(showToast).not.toHaveBeenCalled();
  });

  it("cancels in-flight reads so a refetch cannot overwrite the optimistic state", async () => {
    mocked.setLike.mockResolvedValue(undefined);
    const client = freshClient();
    const spy = jest.spyOn(client, "cancelQueries");
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("p1"));
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["gamePosts"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["post", "p1"] });
  });
});

describe("useCreatePost", () => {
  it("invalidates the feed and the game posts of the post game", async () => {
    const game = {
      id: "g1",
      igdbId: 1,
      name: "Hades",
      coverUrl: null,
      summary: null,
      screenshots: [],
      platforms: [],
      genres: [],
      isFavoritedByMe: false,
    };
    mocked.create.mockResolvedValue(post("new", { game }));
    const client = freshClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useCreatePost(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ content: "oi", gameId: "g1" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocked.create).toHaveBeenCalledWith({ content: "oi", gameId: "g1" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["gamePosts", "g1"] });
  });

  it("invalidates only the feed for a post without a game", async () => {
    mocked.create.mockResolvedValue(post("new"));
    const client = freshClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    const { result } = await renderHook(() => useCreatePost(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ content: "oi" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed"] });
  });
});

describe("comments", () => {
  it("useComments loads the comment tree", async () => {
    mocked.comments.mockResolvedValue([comment("a", [comment("b")])]);
    const { result } = await renderHook(() => useComments("p1"), {
      wrapper: wrapperFor(freshClient()),
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(mocked.comments).toHaveBeenCalledWith("p1");
  });

  it("useAddComment invalidates the comments and bumps the comment count everywhere", async () => {
    mocked.addComment.mockResolvedValue(undefined);
    const client = freshClient();
    const spy = jest.spyOn(client, "invalidateQueries");
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useAddComment("p1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        content: "boa",
        parentCommentId: "c9",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocked.addComment).toHaveBeenCalledWith("p1", "boa", "c9");
    expect(spy).toHaveBeenCalledWith({ queryKey: ["comments", "p1"] });
    expect(cachedPost(client, ["feed", "general"], 1).commentCount).toBe(2);
    expect(cachedPost(client, ["gamePosts", "g1"]).commentCount).toBe(2);
    expect(client.getQueryData<Post>(["post", "p1"])!.commentCount).toBe(2);
    expect(cachedPost(client, ["feed", "general"]).commentCount).toBe(1);
  });

  it("useAddComment sends a root comment without a parent", async () => {
    mocked.addComment.mockResolvedValue(undefined);
    const { result } = await renderHook(() => useAddComment("p1"), {
      wrapper: wrapperFor(freshClient()),
    });

    await act(async () => {
      await result.current.mutateAsync({ content: "boa" });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocked.addComment).toHaveBeenCalledWith("p1", "boa", undefined);
  });

  it("useToggleCommentLike flips a nested reply and keeps the rest of the tree", async () => {
    mocked.setCommentLike.mockResolvedValue(undefined);
    const client = freshClient();
    const reply = comment("r2", [], { likeCount: 1 });
    const tree = [comment("c1", [comment("r1", [reply])]), comment("c2")];
    client.setQueryData(["comments", "p1"], tree);
    const { result } = await renderHook(() => useToggleCommentLike("p1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(reply);
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const next = client.getQueryData<Comment[]>(["comments", "p1"])!;
    expect(next[0].replies[0].replies[0]).toMatchObject({
      likedByMe: true,
      likeCount: 2,
    });
    expect(next[1]).toBe(tree[1]);
    expect(tree[0].replies[0].replies[0]).toBe(reply);
    expect(reply.likedByMe).toBe(false);
    expect(mocked.setCommentLike).toHaveBeenCalledWith("r2", true);
  });

  it("useToggleCommentLike rolls the tree back when the request fails", async () => {
    mocked.setCommentLike.mockRejectedValue(new Error("offline"));
    const client = freshClient();
    const reply = comment("r1");
    const tree = [comment("c1", [reply])];
    client.setQueryData(["comments", "p1"], tree);
    const { result } = await renderHook(() => useToggleCommentLike("p1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(reply);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(["comments", "p1"])).toEqual(tree);
    expect(
      client.getQueryData<Comment[]>(["comments", "p1"])![0].replies[0]
        .likedByMe,
    ).toBe(false);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(authErrorMessage(new Error("offline")));
  });
});

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = () => rej(new Error("offline"));
  });
  return { promise, resolve, reject };
}

describe("rapid and concurrent likes", () => {
  it("reverts only the failed post and keeps another post liked in the same feed", async () => {
    const a = deferred();
    const b = deferred();
    mocked.setLike.mockImplementation((id) =>
      id === "a" ? a.promise : b.promise,
    );
    const client = freshClient();
    client.setQueryData(
      ["feed", "general"],
      singlePage([post("a"), post("b")]),
    );
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("a"));
      result.current.mutate(post("b"));
    });
    expect(cachedPost(client, ["feed", "general"], 0).likedByMe).toBe(true);
    expect(cachedPost(client, ["feed", "general"], 1).likedByMe).toBe(true);

    await act(async () => {
      b.resolve();
      a.reject();
    });

    await waitFor(() =>
      expect(cachedPost(client, ["feed", "general"], 0)).toMatchObject({
        likedByMe: false,
        likeCount: 2,
      }),
    );
    expect(cachedPost(client, ["feed", "general"], 1)).toMatchObject({
      likedByMe: true,
      likeCount: 3,
    });
  });

  it("keeps a page appended after the tap when the like fails", async () => {
    const a = deferred();
    mocked.setLike.mockReturnValue(a.promise);
    const client = freshClient();
    client.setQueryData(["feed", "general"], singlePage([post("a")]));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      result.current.mutate(post("a"));
    });

    client.setQueryData<Pages>(["feed", "general"], (data) => ({
      pages: [...data!.pages, { items: [post("later")], nextCursor: null }],
      pageParams: [...data!.pageParams, "c1"],
    }));
    await act(async () => a.reject());

    await waitFor(() =>
      expect(cachedPost(client, ["feed", "general"]).likedByMe).toBe(false),
    );
    expect(client.getQueryData<Pages>(["feed", "general"])!.pages).toHaveLength(
      2,
    );
  });

  it("ends at the pre-tap state when a double tap fails both times", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const before = snapshotAll(client);
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("p1"));
    });
    await act(async () => {
      result.current.mutate(post("p1", { likedByMe: true, likeCount: 3 }));
    });
    expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
      likedByMe: false,
    });

    await act(async () => first.reject());
    await waitFor(() => expect(mocked.setLike).toHaveBeenCalledTimes(2));
    await act(async () => second.reject());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(snapshotAll(client)).toEqual(before);
  });

  it("ends at the confirmed state when the first tap succeeds and the second fails", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      result.current.mutate(post("p1"));
      result.current.mutate(post("p1", { likedByMe: true, likeCount: 3 }));
    });

    await act(async () => first.resolve());
    await waitFor(() => expect(mocked.setLike).toHaveBeenCalledTimes(2));
    await act(async () => second.reject());

    await waitFor(() =>
      expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
        likedByMe: true,
        likeCount: 3,
      }),
    );
  });

  it("sends the requests of one post in order, each after the previous settled", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(post("p1"));
      result.current.mutate(post("p1", { likedByMe: true, likeCount: 3 }));
    });
    expect(mocked.setLike).toHaveBeenCalledTimes(1);
    expect(mocked.setLike).toHaveBeenLastCalledWith("p1", true);

    await act(async () => first.reject());
    await waitFor(() => expect(mocked.setLike).toHaveBeenCalledTimes(2));
    expect(mocked.setLike).toHaveBeenLastCalledWith("p1", false);
    // The failed tap does not roll back while a later tap is pending, so it says nothing.
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => second.resolve());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(showToast).not.toHaveBeenCalled();
    expect(client.getQueryData<Post>(["post", "p1"])).toMatchObject({
      likedByMe: false,
      likeCount: 2,
    });
  });

  it("reverts only the failed comment and keeps another comment liked", async () => {
    const one = deferred();
    const two = deferred();
    mocked.setCommentLike.mockImplementation((id) =>
      id === "c1" ? one.promise : two.promise,
    );
    const client = freshClient();
    client.setQueryData(
      ["comments", "p1"],
      [comment("c1"), comment("c2", [comment("r1")])],
    );
    const { result } = await renderHook(() => useToggleCommentLike("p1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(comment("c1"));
      result.current.mutate(comment("r1"));
    });
    await act(async () => {
      two.resolve();
      one.reject();
    });

    await waitFor(() => {
      const tree = client.getQueryData<Comment[]>(["comments", "p1"])!;
      expect(tree[0]).toMatchObject({ likedByMe: false, likeCount: 0 });
    });
    const tree = client.getQueryData<Comment[]>(["comments", "p1"])!;
    expect(tree[1].replies[0]).toMatchObject({ likedByMe: true, likeCount: 1 });
  });

  it("ends at the pre-tap state when a double comment tap fails both times", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setCommentLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    const tree = [comment("c1")];
    client.setQueryData(["comments", "p1"], tree);
    const { result } = await renderHook(() => useToggleCommentLike("p1"), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      result.current.mutate(comment("c1"));
    });
    await act(async () => {
      result.current.mutate(
        comment("c1", [], { likedByMe: true, likeCount: 1 }),
      );
    });
    expect(mocked.setCommentLike).toHaveBeenCalledTimes(1);

    await act(async () => first.reject());
    await waitFor(() => expect(mocked.setCommentLike).toHaveBeenCalledTimes(2));
    expect(mocked.setCommentLike).toHaveBeenLastCalledWith("c1", false);
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => second.reject());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["comments", "p1"])).toEqual(tree);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(authErrorMessage(new Error("offline")));
  });

  it("shows one toast for a post double tap that fails both times, after the last settles", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    seedEverywhere(client, post("p1"));
    const { result } = await renderHook(() => useTogglePostLike(), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      result.current.mutate(post("p1"));
      result.current.mutate(post("p1", { likedByMe: true, likeCount: 3 }));
    });

    await act(async () => first.reject());
    await waitFor(() => expect(mocked.setLike).toHaveBeenCalledTimes(2));
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => second.reject());

    await waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
  });

  it("does not toast when a comment like fails but a later tap is still pending", async () => {
    const first = deferred();
    const second = deferred();
    mocked.setCommentLike
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const client = freshClient();
    client.setQueryData(["comments", "p1"], [comment("c1")]);
    const { result } = await renderHook(() => useToggleCommentLike("p1"), {
      wrapper: wrapperFor(client),
    });
    await act(async () => {
      result.current.mutate(comment("c1"));
      result.current.mutate(comment("c1", [], { likedByMe: true, likeCount: 1 }));
    });

    await act(async () => first.reject());
    await waitFor(() => expect(mocked.setCommentLike).toHaveBeenCalledTimes(2));
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => second.resolve());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(showToast).not.toHaveBeenCalled();
  });
});
