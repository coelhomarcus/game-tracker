import type { UserSummary } from '@/features/games/types';

import type { Comment } from '../../types';
import {
  buildThread,
  LINEAR_CHAIN_DEPTH,
  type ThreadCommentRow,
  type ThreadRow,
} from '../buildThread';

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

const linear = (roots: Comment[], expanded: string[] = []) =>
  buildThread(roots, { mode: 'linear', expanded: new Set(expanded) });

/** One letter per row: the comment id, or `+N` for a "Ler mais" row. */
function shape(rows: ThreadRow[]): string[] {
  return rows.map((row) => (row.type === 'comment' ? row.comment.id : `+${row.moreReplies}`));
}

function commentRow(rows: ThreadRow[], id: string): ThreadCommentRow {
  const row = rows.find((r) => r.type === 'comment' && r.comment.id === id);
  if (!row || row.type !== 'comment') throw new Error(`no row ${id}`);
  return row;
}

/** A chain of `length` replies under `root`: r1 answers the root, r2 answers r1, … */
function chain(rootId: string, length: number): Comment {
  let node: Comment | null = null;
  for (let i = length; i >= 1; i -= 1) {
    node = comment(`r${i}`, i % 2 === 0 ? ana : bia, node ? [node] : []);
  }
  return comment(rootId, caio, node ? [node] : []);
}

describe('buildThread linear', () => {
  it('returns nothing for no comments', () => {
    expect(linear([])).toEqual([]);
  });

  it('starts a branch at every top-level comment, with a hairline and no incoming line', () => {
    const rows = linear([comment('a'), comment('b', bia)]);

    expect(shape(rows)).toEqual(['a', 'b']);
    for (const id of ['a', 'b']) {
      expect(commentRow(rows, id)).toMatchObject({
        branchStart: true,
        branchId: id,
        depth: 0,
        hasParentLine: false,
        hasChildLine: false,
        replyingTo: null,
      });
    }
  });

  it('follows the first reply chain, connecting each row to the next', () => {
    const c3 = comment('c3', caio);
    const c2 = comment('c2', bia, [c3]);
    const rows = linear([comment('c1', ana, [c2])]);

    expect(shape(rows)).toEqual(['c1', 'c2', 'c3']);
    expect(commentRow(rows, 'c1')).toMatchObject({
      branchStart: true,
      hasParentLine: false,
      hasChildLine: true,
      depth: 0,
    });
    expect(commentRow(rows, 'c2')).toMatchObject({
      branchStart: false,
      branchId: 'c1',
      hasParentLine: true,
      hasChildLine: true,
      depth: 1,
    });
    expect(commentRow(rows, 'c3')).toMatchObject({
      branchStart: false,
      branchId: 'c1',
      hasParentLine: true,
      hasChildLine: false,
      depth: 2,
    });
    // Each reply sits right under its parent, so none names who it answers.
    expect(rows.every((row) => row.type === 'comment' && row.replyingTo === null)).toBe(true);
  });

  it('collapses the other replies of the branch into one row that counts them', () => {
    // a: first chain a > b > c; the other replies are d (with its reply e) and f under a, and g under b.
    const c = comment('c');
    const b = comment('b', bia, [c, comment('g')]);
    const d = comment('d', caio, [comment('e')]);
    const rows = linear([comment('a', ana, [b, d, comment('f')]), comment('z')]);

    expect(shape(rows)).toEqual(['a', 'b', 'c', '+4', 'z']);
    const readMore = rows[3]!;
    expect(readMore).toEqual({ type: 'readMore', key: 'readMore:a', branchId: 'a', moreReplies: 4 });
    // The last shown reply's line runs on into the "Ler mais" elbow.
    expect(commentRow(rows, 'c').hasChildLine).toBe(true);
    expect(commentRow(rows, 'z').branchStart).toBe(true);
  });

  it('caps the first chain at ten replies and counts the rest as more replies', () => {
    const rows = linear([chain('root', LINEAR_CHAIN_DEPTH + 3)]);

    expect(shape(rows)).toEqual([
      'root',
      ...Array.from({ length: LINEAR_CHAIN_DEPTH }, (_, i) => `r${i + 1}`),
      '+3',
    ]);
    expect(commentRow(rows, `r${LINEAR_CHAIN_DEPTH}`)).toMatchObject({
      depth: LINEAR_CHAIN_DEPTH,
      hasChildLine: true,
    });
  });

  it('shows a chain of exactly ten replies whole', () => {
    const rows = linear([chain('root', LINEAR_CHAIN_DEPTH)]);

    expect(rows).toHaveLength(LINEAR_CHAIN_DEPTH + 1);
    expect(rows.some((row) => row.type === 'readMore')).toBe(false);
    expect(commentRow(rows, `r${LINEAR_CHAIN_DEPTH}`).hasChildLine).toBe(false);
  });

  it('shows every reply of an expanded branch depth first, still one connected line', () => {
    const c = comment('c', caio);
    const b = comment('b', bia, [c, comment('g', caio)]);
    const d = comment('d', caio, [comment('e', ana)]);
    const a = comment('a', ana, [b, d, comment('f', bia)]);
    const rows = linear([a, comment('z')], ['a']);

    expect(shape(rows)).toEqual(['a', 'b', 'c', 'g', 'd', 'e', 'f', 'z']);
    const branch = rows.slice(0, 7) as ThreadCommentRow[];
    expect(branch.map((row) => row.branchId)).toEqual(Array(7).fill('a'));
    expect(branch.map((row) => row.hasParentLine)).toEqual([false, true, true, true, true, true, true]);
    expect(branch.map((row) => row.hasChildLine)).toEqual([true, true, true, true, true, true, false]);
    expect(branch.map((row) => row.depth)).toEqual([0, 1, 2, 2, 1, 2, 1]);
    // A reply whose parent is not the row right above names the author it answers.
    expect(branch.map((row) => row.replyingTo?.username ?? null)).toEqual([
      null,
      null,
      null,
      'bia',
      'ana',
      null,
      'ana',
    ]);
    expect(commentRow(rows, 'z')).toMatchObject({ branchStart: true, hasParentLine: false });
  });

  it('expands only the branches it is given', () => {
    const rows = linear(
      [comment('a', ana, [comment('a1'), comment('a2')]), comment('b', bia, [comment('b1'), comment('b2')])],
      ['b'],
    );

    expect(shape(rows)).toEqual(['a', 'a1', '+1', 'b', 'b1', 'b2']);
  });

  it('gives every row a unique key', () => {
    const rows = linear([comment('a', ana, [comment('b'), comment('c')]), comment('d')]);
    const keys = rows.map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
