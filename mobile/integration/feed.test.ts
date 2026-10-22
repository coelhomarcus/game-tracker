// Feed, posts and comments. Requires the synthetic games 900001/900002 (`npm run test:seed` in
// backend/).
import { flattenComments } from '@/features/feed/flattenComments';
import type { Comment, Post, PostPage } from '@/features/feed/types';
import type { EntryDraft, GameEntry } from '@/features/library/types';

import {
  apiErrorOf,
  describeBackend,
  eventually,
  FIXTURE_GAME_ONE,
  FIXTURE_GAME_TWO,
  signUpAccount,
} from './backend';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

function draft(fields: Partial<EntryDraft> & Pick<EntryDraft, 'status'>): EntryDraft {
  return {
    platform: 'PC',
    startedAt: null,
    finishedAt: null,
    hoursPlayed: null,
    rating: null,
    notes: null,
    ...fields,
  };
}

/** The form values of an existing entry, as the edit form starts from them. */
function draftOf(entry: GameEntry, changes: Partial<EntryDraft> = {}): EntryDraft {
  const { platform, status, startedAt, finishedAt, hoursPlayed, rating, notes } = entry;
  return { platform, status, startedAt, finishedAt, hoursPlayed, rating, notes, ...changes };
}

/** Every page of a cursor-paginated list, in order; stops after `maxPages`. */
async function allPages(
  load: (cursor?: string) => Promise<PostPage>,
  maxPages = 10,
): Promise<{ items: Post[]; pages: number }> {
  const items: Post[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await load(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    pages += 1;
  } while (cursor !== undefined && pages < maxPages);
  return { items, pages };
}

function commentIn(tree: Comment[], id: string): Comment | undefined {
  return flattenComments(tree).find((row) => row.comment.id === id)?.comment;
}

describeBackend('feed against the test API', () => {
  it("post without a link: created, read by id, in the author's General and the follower's Following feeds", async () => {
    const a = await signUpAccount('fa');
    const b = await signUpAccount('fb');
    const post = await a.feed.create({ content: 'Olá, comunidade!' });
    expect(post.author.id).toBe(a.user.id);
    expect(post.game).toBeNull();
    expect(post.entry).toBeNull();
    // The server's UTC timestamp parses to a real instant (not NaN), close to now.
    expect(Math.abs(post.createdAt.getTime() - Date.now())).toBeLessThan(60_000);

    expect((await b.feed.post(post.id)).content).toBe('Olá, comunidade!');
    expect((await b.feed.feed('general')).items.some((p) => p.id === post.id)).toBe(true);
    // B follows nobody yet.
    expect((await b.feed.feed('following')).items).toEqual([]);

    await b.profiles.setFollow(a.user.id, true);
    expect((await b.feed.feed('following')).items.map((p) => p.id)).toContain(post.id);
    // Following also shows one's own posts.
    expect((await a.feed.feed('following')).items.map((p) => p.id)).toContain(post.id);
  });

  it('posts by game: only that game, through the UUID, paginated without repeats', async () => {
    const a = await signUpAccount('fg');
    const b = await signUpAccount('fh');
    const one = await a.games.byIgdbId(FIXTURE_GAME_ONE);
    const two = await a.games.byIgdbId(FIXTURE_GAME_TWO);

    // 5 posts about game 1 (from two accounts), 1 about game 2 and 1 without a game.
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await a.feed.create({ content: `A${i}`, gameId: one.id })).id);
    }
    for (let i = 0; i < 2; i++) {
      ids.push((await b.feed.create({ content: `B${i}`, gameId: one.id })).id);
    }
    const other = await a.feed.create({ content: 'Outro jogo', gameId: two.id });
    const none = await a.feed.create({ content: 'Sem jogo' });

    const { items } = await allPages((cursor) => b.feed.gamePosts(one.id, cursor));
    // Only posts about this game.
    expect(items.every((p) => p.game?.id === one.id)).toBe(true);
    const seen = items.map((p) => p.id);
    // No repeats.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(ids));
    expect(seen).not.toContain(other.id);
    expect(seen).not.toContain(none.id);

    const pageOfTwo = (await b.feed.gamePosts(two.id)).items.map((p) => p.id);
    expect(pageOfTwo).toContain(other.id);
    expect(pageOfTwo).not.toContain(ids[0]);
  });

  it('posts by game: a missing UUID returns an empty list', async () => {
    const a = await signUpAccount('fi');
    expect((await a.feed.gamePosts(MISSING_ID)).items).toEqual([]);
  });

  it('post linked to a game (without an entry) and to an entry', async () => {
    const a = await signUpAccount('fc');
    const game = await a.games.byIgdbId(FIXTURE_GAME_ONE);

    const withGame = await a.feed.create({ content: 'Quero jogar', gameId: game.id });
    expect(withGame.game?.igdbId).toBe(FIXTURE_GAME_ONE);
    expect(withGame.entry).toBeNull();

    const entry = await a.library.create(FIXTURE_GAME_ONE, draft({ status: 'completed' }));
    const withEntry = await a.feed.create({
      content: 'Zerei!',
      gameEntryId: entry.id,
      gameId: game.id,
    });
    expect(withEntry.entry?.id).toBe(entry.id);
    // The backend derived the game from the entry.
    expect(withEntry.game?.id).toBe(game.id);
  });

  it("another user's entry cannot be used in a post", async () => {
    const a = await signUpAccount('fd');
    const b = await signUpAccount('fe');
    const entry = await a.library.create(FIXTURE_GAME_ONE, draft({ status: 'backlog' }));

    expect(
      await apiErrorOf(b.feed.create({ content: 'roubando', gameEntryId: entry.id })),
    ).toMatchObject({ status: 404, code: 'not_found' });
  });

  it('like and unlike are idempotent and update likedByMe and likeCount', async () => {
    const a = await signUpAccount('ff');
    const b = await signUpAccount('fg');
    const post = await a.feed.create({ content: 'curta-me' });

    await b.feed.setLike(post.id, true);
    await b.feed.setLike(post.id, true);
    let seen = await b.feed.post(post.id);
    expect([seen.likedByMe, seen.likeCount]).toEqual([true, 1]);
    // likedByMe is per viewer.
    expect((await a.feed.post(post.id)).likedByMe).toBe(false);

    await b.feed.setLike(post.id, false);
    await b.feed.setLike(post.id, false);
    seen = await b.feed.post(post.id);
    expect([seen.likedByMe, seen.likeCount]).toEqual([false, 0]);
  });

  it('comments: tree, deep replies, likes and the post counter', async () => {
    const a = await signUpAccount('fh');
    const b = await signUpAccount('fi');
    const post = await a.feed.create({ content: 'discutam' });

    await b.feed.addComment(post.id, 'raiz');
    let tree = await a.feed.comments(post.id);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    await a.feed.addComment(post.id, 'nível 1', root.id);
    tree = await a.feed.comments(post.id);
    expect(tree[0].replies).toHaveLength(1);
    const l1 = tree[0].replies[0];
    await b.feed.addComment(post.id, 'nível 2', l1.id);
    tree = await a.feed.comments(post.id);
    expect(tree[0].replies[0].replies).toHaveLength(1);
    const l2 = tree[0].replies[0].replies[0];
    await a.feed.addComment(post.id, 'nível 3', l2.id);

    tree = await a.feed.comments(post.id);
    expect(flattenComments(tree)).toHaveLength(4);
    expect(commentIn(tree, l2.id)?.replies.map((c) => c.content)).toEqual(['nível 3']);
    // The post counter counts every level.
    expect((await a.feed.post(post.id)).commentCount).toBe(4);

    await a.feed.setCommentLike(l2.id, true);
    await a.feed.setCommentLike(l2.id, true);
    const liked = commentIn(await a.feed.comments(post.id), l2.id);
    expect([liked?.likedByMe, liked?.likeCount]).toEqual([true, 1]);
    await a.feed.setCommentLike(l2.id, false);
    expect(commentIn(await a.feed.comments(post.id), l2.id)?.likeCount).toBe(0);
  });

  it('cursor pagination: more pages, without duplicates or lost posts', async () => {
    const a = await signUpAccount('fj');
    const b = await signUpAccount('fk');
    const total = 23;
    for (let i = 1; i <= total; i++) {
      await a.feed.create({ content: `post ${i}` });
    }
    await b.profiles.setFollow(a.user.id, true);

    const { items, pages } = await allPages((cursor) => b.feed.feed('following', cursor));
    // 23 posts in pages of 20.
    expect(pages).toBe(2);
    expect(items).toHaveLength(total);
    // No duplicates.
    expect(new Set(items.map((p) => p.id)).size).toBe(total);
    // Newest first.
    expect((await b.feed.feed('following')).items[0].content).toBe('post 23');
  });

  it('automatic activity keeps the status of its moment and survives the entry deletion', async () => {
    const a = await signUpAccount('fl');
    const entry = await a.library.create(FIXTURE_GAME_ONE, draft({ status: 'playing' }));
    await a.library.update(entry, draftOf(entry, { status: 'completed' }));

    const activities = async () => (await a.profiles.posts(a.user.id, 'activity')).items;
    // The backend creates the activity posts asynchronously.
    let list: Post[] = [];
    await eventually(
      async () => {
        list = await activities();
        return list.length >= 2;
      },
      { reason: () => `expected 2 activity posts, got ${list.length}` },
    );
    // One post per change, with the status of each moment.
    expect(list.map((p) => p.activityStatus)).toEqual(
      expect.arrayContaining(['playing', 'completed']),
    );
    expect(list.every((p) => p.entry?.id === entry.id)).toBe(true);

    await a.library.remove(entry.id);
    list = await activities();
    // The history stays.
    expect(list).toHaveLength(2);
    // The deleted entry becomes null; the post stays.
    expect(list.every((p) => p.entry === null)).toBe(true);
    expect(list.map((p) => p.activityStatus)).toEqual(
      expect.arrayContaining(['playing', 'completed']),
    );
  });

  it('a missing post and an over-limit text become domain errors', async () => {
    const a = await signUpAccount('fm');
    expect(await apiErrorOf(a.feed.post(MISSING_ID))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    expect(await apiErrorOf(a.feed.create({ content: 'x'.repeat(501) }))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
  });
});
