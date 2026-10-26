import {
  InfiniteQueryObserver,
  type InfiniteData,
  type Query,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import type { Post, PostPage } from './types';

type PostPages = InfiniteData<PostPage, string | undefined>;

const LIST_KEYS: readonly QueryKey[] = [['feed'], ['gamePosts'], ['userPosts'], ['bookmarks']];

type Interrupted = { query: Query; nextPage: boolean };

/** Fetches cut short by a cancel, per client, until `resumeInterrupted` restarts them. */
const interrupted = new WeakMap<QueryClient, Map<string, Interrupted>>();

/**
 * Stops in-flight fetches of `keys` so a refetch cannot overwrite an optimistic write.
 * Cancelling reverts a query to its state before the fetch, which silently drops a next page
 * or a refetch, so what was fetching is remembered to be restarted by `resumeInterrupted`.
 */
async function cancelAndRemember(client: QueryClient, keys: readonly QueryKey[]): Promise<void> {
  const remembered = interrupted.get(client) ?? new Map<string, Interrupted>();
  for (const queryKey of keys) {
    for (const query of client.getQueryCache().findAll({ queryKey, fetchStatus: 'fetching' })) {
      const nextPage = query.state.fetchMeta?.fetchMore?.direction === 'forward';
      remembered.set(query.queryHash, { query, nextPage });
    }
  }
  interrupted.set(client, remembered);
  await Promise.all(keys.map((queryKey) => client.cancelQueries({ queryKey })));
}

export function cancelPostQueries(client: QueryClient, postId: string): Promise<void> {
  return cancelAndRemember(client, [...LIST_KEYS, ['post', postId]]);
}

export function cancelCommentQueries(client: QueryClient, postId: string): Promise<void> {
  return cancelAndRemember(client, [['comments', postId]]);
}

/**
 * Restarts the fetches that a toggle cancelled: a next page is fetched again, anything else is
 * refetched. Call it once no toggle is in flight, so the server already holds the toggles and the
 * response cannot overwrite an optimistic write. Inactive queries are left alone.
 */
export function resumeInterrupted(client: QueryClient): void {
  const remembered = interrupted.get(client);
  if (remembered === undefined) return;
  interrupted.delete(client);
  for (const { query, nextPage } of remembered.values()) {
    const observer = nextPage
      ? query.observers.find((o) => o instanceof InfiniteQueryObserver)
      : undefined;
    if (observer) void observer.fetchNextPage();
    else void client.refetchQueries({ queryKey: query.queryKey, exact: true });
  }
}

function updatePages(data: PostPages, postId: string, update: (p: Post) => Post): PostPages {
  let changed = false;
  const pages = data.pages.map((page) => {
    if (!page.items.some((item) => item.id === postId)) return page;
    changed = true;
    return { ...page, items: page.items.map((item) => (item.id === postId ? update(item) : item)) };
  });
  return changed ? { ...data, pages } : data;
}

/**
 * Applies `update` to the post in every cached feed, game or profile post list and post detail,
 * immutably. Only entries that hold the post are written.
 */
export function updatePostEverywhere(
  client: QueryClient,
  postId: string,
  update: (p: Post) => Post,
): void {
  const detailKey: QueryKey = ['post', postId];
  // Read before the lists change: a detail that still shows a list's copy as its placeholder
  // holds no data of its own, and that copy is where its next state comes from.
  const detail =
    client.getQueryData<Post>(detailKey) ??
    (client.getQueryState(detailKey) ? findCachedPost(client, postId) : undefined);

  for (const key of LIST_KEYS) {
    for (const [queryKey, data] of client.getQueriesData<PostPages>({ queryKey: key })) {
      if (data === undefined) continue;
      const next = updatePages(data, postId, update);
      if (next === data) continue;
      client.setQueryData(queryKey, next);
    }
  }

  if (detail !== undefined) {
    client.setQueryData(detailKey, update(detail));
  }
}

/** A quote of a deleted post shows "Post removido" in its place, as the server will say too. */
function withoutQuoteOf(postId: string) {
  return (p: Post): Post =>
    p.quotedPost?.id === postId || p.quotedPostId === postId
      ? { ...p, quotedPostId: null, quotedPost: null, quotedPostRemoved: true }
      : p;
}

function removeFromPages(data: PostPages, postId: string): PostPages {
  const unquote = withoutQuoteOf(postId);
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items: Post[] = [];
    for (const item of page.items) {
      if (item.id === postId) {
        pageChanged = true;
        continue;
      }
      const next = unquote(item);
      if (next !== item) pageChanged = true;
      items.push(next);
    }
    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

/**
 * Takes a deleted post out of every cached feed, game, profile and bookmark list (its reposts
 * too), marks the posts that quote it as quoting a removed post, and drops its own detail and
 * comments once no screen shows them. A detail still on screen keeps its data until it closes.
 */
export function removePostEverywhere(client: QueryClient, postId: string): void {
  for (const key of LIST_KEYS) {
    for (const [queryKey, data] of client.getQueriesData<PostPages>({ queryKey: key })) {
      if (data === undefined) continue;
      const next = removeFromPages(data, postId);
      if (next !== data) client.setQueryData(queryKey, next);
    }
  }

  const unquote = withoutQuoteOf(postId);
  for (const [queryKey, data] of client.getQueriesData<Post>({ queryKey: ['post'] })) {
    if (data === undefined || data.id === postId) continue;
    const next = unquote(data);
    if (next !== data) client.setQueryData(queryKey, next);
  }

  client.removeQueries({ queryKey: ['post', postId], exact: true, type: 'inactive' });
  client.removeQueries({ queryKey: ['comments', postId], type: 'inactive' });
}

/**
 * The post as any cached feed, game or profile post list holds it, to show before its own fetch
 * ends. A list item can be a reposter's copy; the detail is of the post itself, so `reason` is
 * dropped.
 */
export function findCachedPost(client: QueryClient, postId: string): Post | undefined {
  for (const key of LIST_KEYS) {
    for (const [, data] of client.getQueriesData<PostPages>({ queryKey: key })) {
      for (const page of data?.pages ?? []) {
        const found = page.items.find((item) => item.id === postId);
        if (found) return found.reason === null ? found : { ...found, reason: null };
      }
    }
  }
  return undefined;
}
