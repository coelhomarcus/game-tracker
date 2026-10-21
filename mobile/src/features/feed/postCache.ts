import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import type { Post, PostPage } from './types';

type PostPages = InfiniteData<PostPage, string | undefined>;

/** The previous data of every cache entry a change touched, to roll it back. */
export type Snapshot = [QueryKey, unknown][];

const LIST_KEYS: readonly QueryKey[] = [['feed'], ['gamePosts']];

/** Stops in-flight fetches so a refetch cannot overwrite an optimistic write. */
export async function cancelPostQueries(client: QueryClient, postId: string): Promise<void> {
  await Promise.all([
    ...LIST_KEYS.map((queryKey) => client.cancelQueries({ queryKey })),
    client.cancelQueries({ queryKey: ['post', postId] }),
  ]);
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
 * Applies `update` to the post in every cached feed, game post list and post detail,
 * immutably. Only entries that hold the post are written and snapshotted.
 */
export function updatePostEverywhere(
  client: QueryClient,
  postId: string,
  update: (p: Post) => Post,
): Snapshot {
  const snapshot: Snapshot = [];

  for (const key of LIST_KEYS) {
    for (const [queryKey, data] of client.getQueriesData<PostPages>({ queryKey: key })) {
      if (data === undefined) continue;
      const next = updatePages(data, postId, update);
      if (next === data) continue;
      snapshot.push([queryKey, data]);
      client.setQueryData(queryKey, next);
    }
  }

  const detailKey: QueryKey = ['post', postId];
  const detail = client.getQueryData<Post>(detailKey);
  if (detail !== undefined) {
    snapshot.push([detailKey, detail]);
    client.setQueryData(detailKey, update(detail));
  }

  return snapshot;
}

export function restoreSnapshot(client: QueryClient, snapshot: Snapshot): void {
  for (const [queryKey, data] of snapshot) client.setQueryData(queryKey, data);
}
