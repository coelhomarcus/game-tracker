import type { UserSummary } from '@/features/games/types';

import { flattenComments } from '../flattenComments';
import type { Comment } from '../types';

const ana: UserSummary = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const bia: UserSummary = { id: 'u2', username: 'bia', name: null, avatarUrl: null };
const caio: UserSummary = { id: 'u3', username: 'caio', name: 'Caio', avatarUrl: null };

function comment(id: string, author = ana, replies: Comment[] = []): Comment {
  return {
    id,
    postId: 'p1',
    author,
    content: `texto ${id}`,
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    parentCommentId: null,
    likeCount: 0,
    likedByMe: false,
    replies,
  };
}

describe('flattenComments', () => {
  it('returns nothing for no comments', () => {
    expect(flattenComments([])).toEqual([]);
  });

  it('keeps roots at depth 0 without a reply target', () => {
    const rows = flattenComments([comment('a'), comment('b', bia)]);

    expect(rows.map((row) => [row.comment.id, row.depth, row.replyingTo])).toEqual([
      ['a', 0, null],
      ['b', 0, null],
    ]);
  });

  it('puts replies at depth 1 right after their root, replying to the root author', () => {
    const rows = flattenComments([
      comment('a', ana, [comment('a1', bia), comment('a2', caio)]),
      comment('b', bia),
    ]);

    expect(rows.map((row) => [row.comment.id, row.depth, row.replyingTo?.id ?? null])).toEqual([
      ['a', 0, null],
      ['a1', 1, 'u1'],
      ['a2', 1, 'u1'],
      ['b', 0, null],
    ]);
  });

  it('flattens a reply of a reply to depth 1, replying to the author of its direct parent', () => {
    const rows = flattenComments([
      comment('a', ana, [comment('a1', bia, [comment('a1x', caio, [comment('a1y', ana)])])]),
    ]);

    expect(rows.map((row) => [row.comment.id, row.depth, row.replyingTo?.id ?? null])).toEqual([
      ['a', 0, null],
      ['a1', 1, 'u1'],
      ['a1x', 1, 'u2'],
      ['a1y', 1, 'u3'],
    ]);
  });

  it('visits descendants depth first', () => {
    const rows = flattenComments([
      comment('a', ana, [comment('a1', bia, [comment('a1x', caio)]), comment('a2', caio)]),
    ]);

    expect(rows.map((row) => row.comment.id)).toEqual(['a', 'a1', 'a1x', 'a2']);
  });

  it('passes the cached comment through untouched', () => {
    const root = comment('a');

    expect(flattenComments([root])[0].comment).toBe(root);
  });
});
