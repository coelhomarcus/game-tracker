// Reposts, bookmarks, quotes, post images, deletes, post search, mentions, comment sorting and
// the profile limits. Requires the synthetic games (`npm run test:seed` in backend/).
import { flattenComments } from '@/features/feed/flattenComments';
import type { Comment, Post, PostPage } from '@/features/feed/types';
import { postKey } from '@/features/feed/types';

import {
  apiErrorOf,
  describeBackend,
  eventually,
  signUpAccount,
  uniqueSuffix,
  type Account,
} from './backend';
import { gradientPng, picked, served, withNativeFormData } from './images';

const MISSING_ID = '00000000-0000-0000-0000-000000000000';

async function allPages(load: (cursor?: string) => Promise<PostPage>, maxPages = 10) {
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

/** The ids of a comment tree, in the order the screen would list them (parents before replies). */
const commentOrder = (tree: Comment[]) => flattenComments(tree).map((row) => row.comment.content);

async function uploadPostImage(account: Account, width: number, height: number) {
  const image = picked(gradientPng(width, height), 'foto.png', 'image/png');
  return withNativeFormData(() => account.feed.uploadPostImage(image));
}

describeBackend('reposts against the test API', () => {
  it('repost and unrepost are idempotent and update the counter and the viewer flag', async () => {
    const a = await signUpAccount('ra');
    const b = await signUpAccount('rb');
    const post = await a.feed.create({ content: 'Para repostar' });

    await b.feed.setRepost(post.id, true);
    await b.feed.setRepost(post.id, true);

    let seen = await b.feed.post(post.id);
    expect([seen.repostedByMe, seen.repostCount]).toEqual([true, 1]);
    const asAuthor = await a.feed.post(post.id);
    expect([asAuthor.repostedByMe, asAuthor.repostCount]).toEqual([false, 1]);

    await b.feed.setRepost(post.id, false);
    await b.feed.setRepost(post.id, false);
    seen = await b.feed.post(post.id);
    expect([seen.repostedByMe, seen.repostCount]).toEqual([false, 0]);
  });

  it('a repost shows in the Following feed and the profile with its reason, next to the original', async () => {
    const a = await signUpAccount('rc');
    const b = await signUpAccount('rd');
    const c = await signUpAccount('re');
    const post = await a.feed.create({ content: 'Original' });
    await c.profiles.setFollow(a.user.id, true);
    await c.profiles.setFollow(b.user.id, true);

    await b.feed.setRepost(post.id, true);

    const { items } = await allPages((cursor) => c.feed.feed('following', cursor));
    const copies = items.filter((p) => p.id === post.id);
    expect(copies).toHaveLength(2);
    const reposted = copies.find((p) => p.reason !== null)!;
    expect(reposted.reason).toMatchObject({ type: 'repost', by: { id: b.user.id } });
    expect(Math.abs(reposted.reason!.at.getTime() - Date.now())).toBeLessThan(60_000);
    expect(copies.find((p) => p.reason === null)).toBeDefined();
    // The list keys tell the two copies apart.
    expect(new Set(copies.map(postKey)).size).toBe(2);

    const onProfile = await b.profiles.posts(b.user.id, 'post');
    expect(onProfile.items.find((p) => p.id === post.id)?.reason?.by.id).toBe(b.user.id);

    await b.feed.setRepost(post.id, false);
    const after = await allPages((cursor) => c.feed.feed('following', cursor));
    expect(after.items.filter((p) => p.id === post.id)).toHaveLength(1);
  });

  it('a repost notifies the author once; reposting your own post does not', async () => {
    const a = await signUpAccount('rf');
    const b = await signUpAccount('rg');
    const post = await a.feed.create({ content: 'Notificar' });

    await b.feed.setRepost(post.id, true);
    await b.feed.setRepost(post.id, true);
    await a.feed.setRepost(post.id, true);

    const { items } = await a.notifications.list();
    const reposts = items.filter((n) => n.type === 'repost');
    expect(reposts).toHaveLength(1);
    expect(reposts[0]).toMatchObject({ postId: post.id, excerpt: 'Notificar' });
    expect(reposts[0]!.actor.id).toBe(b.user.id);
  });

  it('a missing post is 404', async () => {
    const a = await signUpAccount('rh');
    expect(await apiErrorOf(a.feed.setRepost(MISSING_ID, true))).toMatchObject({ status: 404 });
  });
});

describeBackend('bookmarks against the test API', () => {
  it('bookmark and unbookmark: flag, counter and the private list, newest first', async () => {
    const a = await signUpAccount('ba');
    const b = await signUpAccount('bb');
    const first = await a.feed.create({ content: 'Primeiro' });
    const second = await a.feed.create({ content: 'Segundo' });

    await b.feed.setBookmark(first.id, true);
    await b.feed.setBookmark(second.id, true);
    await b.feed.setBookmark(second.id, true);

    const mine = await b.feed.bookmarks();
    expect(mine.items.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(mine.items.every((p) => p.bookmarkedByMe && p.reason === null)).toBe(true);
    expect(mine.nextCursor).toBeNull();
    expect((await b.feed.post(first.id)).bookmarkCount).toBe(1);
    // Bookmarks are private and never notify.
    expect((await a.feed.bookmarks()).items).toEqual([]);
    expect((await a.notifications.list()).items).toEqual([]);

    await b.feed.setBookmark(first.id, false);
    await b.feed.setBookmark(first.id, false);
    expect((await b.feed.bookmarks()).items.map((p) => p.id)).toEqual([second.id]);
    expect((await b.feed.post(first.id)).bookmarkedByMe).toBe(false);
  });

  it('pages through more bookmarks than one page, with the opaque cursor and no repeats', async () => {
    const a = await signUpAccount('bc');
    const b = await signUpAccount('bd');
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) {
      const post = await a.feed.create({ content: `Marcado ${i}` });
      await b.feed.setBookmark(post.id, true);
      ids.push(post.id);
    }

    const { items, pages } = await allPages((cursor) => b.feed.bookmarks(cursor));

    expect(pages).toBe(2);
    expect(items.map((p) => p.id)).toEqual([...ids].reverse());
  });

  it('a deleted post leaves the bookmarks', async () => {
    const a = await signUpAccount('be');
    const b = await signUpAccount('bf');
    const post = await a.feed.create({ content: 'Vai sumir' });
    await b.feed.setBookmark(post.id, true);

    await a.feed.deletePost(post.id);

    expect((await b.feed.bookmarks()).items).toEqual([]);
  });
});

describeBackend('quotes against the test API', () => {
  it('a quote carries a summary of the original and counts as a quote of it', async () => {
    const a = await signUpAccount('qa');
    const b = await signUpAccount('qb');
    const original = await a.feed.create({ content: 'Texto original' });

    const quote = await b.feed.create({ content: 'Concordo!', quotedPostId: original.id });

    expect(quote.quotedPostId).toBe(original.id);
    expect(quote.quotedPost).toMatchObject({
      id: original.id,
      content: 'Texto original',
      author: { id: a.user.id },
    });
    expect((await a.feed.post(original.id)).quoteCount).toBe(1);
    const read = await a.feed.post(quote.id);
    expect(read.quotedPost?.id).toBe(original.id);
  });

  it('notifies the author with the quote post, and deleting the original leaves a null summary', async () => {
    const a = await signUpAccount('qc');
    const b = await signUpAccount('qd');
    const original = await a.feed.create({ content: 'Original' });
    const quote = await b.feed.create({ content: 'Minha opinião', quotedPostId: original.id });

    const { items } = await a.notifications.list();
    const notification = items.find((n) => n.type === 'quote');
    expect(notification).toMatchObject({ postId: quote.id, excerpt: 'Minha opinião' });
    expect(notification!.actor.id).toBe(b.user.id);

    await a.feed.deletePost(original.id);
    const after = await b.feed.post(quote.id);
    expect(after.quotedPost).toBeNull();
    expect(after.quotedPostId).toBeNull();
    expect(after.quotedPostRemoved).toBe(true);
    expect(quote.quotedPostRemoved).toBe(false);
  });

  it('a missing quoted post is 404 and a malformed id is 400', async () => {
    const a = await signUpAccount('qe');
    expect(
      await apiErrorOf(a.feed.create({ content: 'Citação', quotedPostId: MISSING_ID })),
    ).toMatchObject({ status: 404 });
    expect(
      await apiErrorOf(a.feed.create({ content: 'Citação', quotedPostId: 'nao-e-uuid' })),
    ).toMatchObject({ status: 400 });
  });
});

describeBackend('post images against the test API', () => {
  it('upload, attach to a post and read the images back with their size', async () => {
    const a = await signUpAccount('ia');
    const b = await signUpAccount('ib');

    const one = await uploadPostImage(a, 300, 200);
    const two = await uploadPostImage(a, 120, 240);
    expect(one).toMatchObject({ width: 300, height: 200 });
    expect(one.url).toContain('/uploads/posts/');

    const post = await a.feed.create({
      content: 'Com fotos',
      images: [one, { ...two, alt: 'Segunda foto' }],
    });

    expect(post.images).toEqual([
      { url: one.url, width: 300, height: 200, alt: null },
      { url: two.url, width: 120, height: 240, alt: 'Segunda foto' },
    ]);
    expect(post.imageUrl).toBe(one.url);
    const seen = await b.feed.post(post.id);
    expect(seen.images.map((image) => image.url)).toEqual([one.url, two.url]);
    expect((await served(one.url)).type).toBe('image/jpeg');
  });

  it('refuses an image that this API did not issue, and a text that is not an image', async () => {
    const a = await signUpAccount('ic');

    expect(
      await apiErrorOf(
        a.feed.create({
          content: 'Foto de fora',
          images: [{ url: 'https://example.com/x.jpg', width: 10, height: 10 }],
        }),
      ),
    ).toMatchObject({ status: 400 });

    const text = picked(Buffer.from('isto não é uma imagem'), 'ruim.png', 'image/png');
    expect(
      await apiErrorOf(withNativeFormData(() => a.feed.uploadPostImage(text))),
    ).toMatchObject({ status: 400 });
  });

  it('accepts four images and refuses five', async () => {
    const a = await signUpAccount('id');
    const images = [];
    for (let i = 0; i < 5; i++) images.push(await uploadPostImage(a, 40 + i, 30));

    const four = await a.feed.create({ content: 'Quatro', images: images.slice(0, 4) });
    expect(four.images).toHaveLength(4);
    expect(await apiErrorOf(a.feed.create({ content: 'Cinco', images }))).toMatchObject({
      status: 400,
    });
  });
});

describeBackend('deleting posts and comments against the test API', () => {
  it('only the author deletes a post; it is gone for everyone afterwards', async () => {
    const a = await signUpAccount('da');
    const b = await signUpAccount('db');
    const post = await a.feed.create({ content: 'Apagável' });

    expect(await apiErrorOf(b.feed.deletePost(post.id))).toMatchObject({
      status: 403,
      code: 'forbidden',
    });
    expect((await b.feed.post(post.id)).id).toBe(post.id);

    await a.feed.deletePost(post.id);

    expect(await apiErrorOf(b.feed.post(post.id))).toMatchObject({ status: 404 });
    expect(await apiErrorOf(a.feed.deletePost(post.id))).toMatchObject({ status: 404 });
  });

  it('deleting a post removes its reposts from the feeds', async () => {
    const a = await signUpAccount('dc');
    const b = await signUpAccount('dd');
    const post = await a.feed.create({ content: 'Com repost' });
    await b.feed.setRepost(post.id, true);

    await a.feed.deletePost(post.id);

    const { items } = await allPages((cursor) => b.feed.feed('general', cursor));
    expect(items.some((p) => p.id === post.id)).toBe(false);
  });

  it('only the comment author deletes a comment, not even the post author; replies go with it', async () => {
    const a = await signUpAccount('de');
    const b = await signUpAccount('df');
    const post = await a.feed.create({ content: 'Post' });
    await b.feed.addComment(post.id, 'Raiz');
    const [root] = await b.feed.comments(post.id);
    await a.feed.addComment(post.id, 'Resposta', root!.id);
    expect((await a.feed.post(post.id)).commentCount).toBe(2);

    expect(await apiErrorOf(a.feed.deleteComment(root!.id))).toMatchObject({
      status: 403,
      code: 'forbidden',
    });

    await b.feed.deleteComment(root!.id);

    expect(await a.feed.comments(post.id)).toEqual([]);
    expect((await a.feed.post(post.id)).commentCount).toBe(0);
    expect(await apiErrorOf(b.feed.deleteComment(root!.id))).toMatchObject({ status: 404 });
  });
});

describeBackend('post search against the test API', () => {
  it('finds posts by any part of the text, newest first, case-insensitively', async () => {
    const a = await signUpAccount('sa');
    const b = await signUpAccount('sb');
    const tag = `busca${uniqueSuffix()}`;
    const older = await a.feed.create({ content: `primeiro ${tag}` });
    const newer = await a.feed.create({ content: `SEGUNDO ${tag.toUpperCase()}` });
    await a.feed.create({ content: 'nada a ver' });

    const found = await b.feed.searchPosts(`  ${tag}  `);

    expect(found.items.map((p) => p.id)).toEqual([newer.id, older.id]);
    expect(found.nextCursor).toBeNull();
    expect(found.items.every((p) => p.reason === null)).toBe(true);
  });

  it('pages with the opaque cursor', async () => {
    const a = await signUpAccount('sc');
    const tag = `pagina${uniqueSuffix()}`;
    const ids: string[] = [];
    for (let i = 0; i < 21; i++) ids.push((await a.feed.create({ content: `${tag} ${i}` })).id);

    const { items, pages } = await allPages((cursor) => a.feed.searchPosts(tag, cursor));

    expect(pages).toBe(2);
    expect(items.map((p) => p.id)).toEqual([...ids].reverse());
  });

  it('treats % and _ literally, and refuses a term shorter than two characters', async () => {
    const a = await signUpAccount('sd');
    const tag = uniqueSuffix();
    const literal = await a.feed.create({ content: `100% ${tag}` });
    await a.feed.create({ content: `100 ${tag}` });

    expect((await a.feed.searchPosts(`% ${tag}`)).items.map((p) => p.id)).toEqual([literal.id]);
    expect(await apiErrorOf(a.feed.searchPosts('a'))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
    expect(await apiErrorOf(a.feed.searchPosts('   '))).toMatchObject({ status: 400 });
  });
});

describeBackend('mentions and replies against the test API', () => {
  it('a mention in a post notifies the person once, with the post and its text', async () => {
    const a = await signUpAccount('ma');
    const b = await signUpAccount('mb');

    const post = await a.feed.create({
      content: `oi @${b.user.username}, @${b.user.username} e @${a.user.username}!`,
    });

    await eventually(async () => (await b.notifications.list()).items.length > 0);
    const { items } = await b.notifications.list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'mention', postId: post.id, commentId: null });
    expect(items[0]!.excerpt).toContain(`@${b.user.username}`);
    // Mentioning yourself notifies nobody.
    expect((await a.notifications.list()).items).toEqual([]);
  });

  it('a reply notifies the comment author with reply, the comment and its text', async () => {
    const a = await signUpAccount('mc');
    const b = await signUpAccount('md');
    const c = await signUpAccount('me');
    const post = await a.feed.create({ content: 'Post' });
    await b.feed.addComment(post.id, 'Comentário do B');
    const [root] = await b.feed.comments(post.id);

    await c.feed.addComment(post.id, 'Resposta do C', root!.id);

    const [reply] = (await c.feed.comments(post.id))[0]!.replies;
    const forB = (await b.notifications.list()).items.find((n) => n.type === 'reply');
    expect(forB).toMatchObject({
      postId: post.id,
      commentId: reply!.id,
      excerpt: 'Resposta do C',
    });
    expect(forB!.actor.id).toBe(c.user.id);
    // The post author hears about the new comment on the post as before.
    const forA = (await a.notifications.list()).items.filter((n) => n.type === 'comment');
    expect(forA.map((n) => n.excerpt)).toEqual(
      expect.arrayContaining(['Comentário do B', 'Resposta do C']),
    );
  });

  it('a mention in a comment carries the comment id', async () => {
    const a = await signUpAccount('mf');
    const b = await signUpAccount('mg');
    const c = await signUpAccount('mh');
    const post = await a.feed.create({ content: 'Post' });

    await c.feed.addComment(post.id, `chamando @${b.user.username}`);

    const [comment] = await c.feed.comments(post.id);
    const mention = (await b.notifications.list()).items.find((n) => n.type === 'mention');
    expect(mention).toMatchObject({ postId: post.id, commentId: comment!.id });
  });
});

describeBackend('comment sorting against the test API', () => {
  it('oldest is the default; newest reverses; top puts the most liked first', async () => {
    const a = await signUpAccount('ca');
    const b = await signUpAccount('cb');
    const post = await a.feed.create({ content: 'Post' });
    for (const text of ['um', 'dois', 'tres']) await b.feed.addComment(post.id, text);
    const dois = flattenComments(await a.feed.comments(post.id)).find(
      (row) => row.comment.content === 'dois',
    )!;
    await a.feed.setCommentLike(dois.comment.id, true);

    expect(commentOrder(await a.feed.comments(post.id))).toEqual(['um', 'dois', 'tres']);
    expect(commentOrder(await a.feed.comments(post.id, 'oldest'))).toEqual(['um', 'dois', 'tres']);
    expect(commentOrder(await a.feed.comments(post.id, 'newest'))).toEqual(['tres', 'dois', 'um']);
    const top = await a.feed.comments(post.id, 'top');
    expect(commentOrder(top)).toEqual(['dois', 'um', 'tres']);
    expect(top[0]).toMatchObject({ likeCount: 1, likedByMe: true });
  });
});

describeBackend('profile limits against the test API', () => {
  it('accepts a 64-character name and a 256-character bio, and refuses one more', async () => {
    const a = await signUpAccount('la');

    await a.profiles.update({ name: 'n'.repeat(64), bio: 'b'.repeat(256) });
    const profile = await a.profiles.get(a.user.id);
    expect([profile.name?.length, profile.bio?.length]).toEqual([64, 256]);

    expect(await apiErrorOf(a.profiles.update({ name: 'n'.repeat(65) }))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
    expect(await apiErrorOf(a.profiles.update({ bio: 'b'.repeat(257) }))).toMatchObject({
      status: 400,
      code: 'validation_error',
    });
  });
});
