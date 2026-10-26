import type { UserSummary } from '@/features/games/types';

import type { Comment } from '../../types';
import {
  buildThread,
  LINEAR_CHAIN_DEPTH,
  TREE_LEVELS,
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
    expect(readMore).toEqual({ type: 'readMore', key: 'readMore:a', branchId: 'a', moreReplies: 4, rails: [] });
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

const tree = (roots: Comment[], expanded: string[] = []) =>
  buildThread(roots, { mode: 'tree', expanded: new Set(expanded) });

/**
 * a ─┬─ b ─┬─ c
 *    │     └─ d
 *    └─ e
 * f
 */
function sampleTree(): Comment[] {
  return [
    comment('a', ana, [comment('b', bia, [comment('c', caio), comment('d')]), comment('e', bia)]),
    comment('f', caio),
  ];
}

/** root ─ r1 ─ r2 ─ … ─ r`length`: one reply per level. */
function deepChain(length: number): Comment[] {
  return [chain('root', length)];
}

describe('buildThread tree', () => {
  it('nests every reply under its parent, depth first', () => {
    const rows = tree(sampleTree());

    expect(shape(rows)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(rows.map((row) => (row.type === 'comment' ? row.depth : -1))).toEqual([
      0, 1, 2, 2, 1, 0,
    ]);
  });

  it('runs a rail down every level whose comment still has a later sibling', () => {
    const rows = tree(sampleTree());

    expect(commentRow(rows, 'a').rails).toEqual([]);
    // b has e after it; c has d after it.
    expect(commentRow(rows, 'b').rails).toEqual([true]);
    expect(commentRow(rows, 'c').rails).toEqual([true, true]);
    // d is b's last reply, but b's rail still runs on to e.
    expect(commentRow(rows, 'd').rails).toEqual([true, false]);
    expect(commentRow(rows, 'e').rails).toEqual([false]);
    expect(commentRow(rows, 'f').rails).toEqual([]);
  });

  it('gives nested rows an elbow and top-level rows a hairline', () => {
    const rows = tree(sampleTree());

    for (const id of ['a', 'f']) {
      expect(commentRow(rows, id)).toMatchObject({
        branchStart: true,
        hasParentLine: false,
        branchId: id,
      });
    }
    for (const id of ['b', 'c', 'd', 'e']) {
      expect(commentRow(rows, id)).toMatchObject({
        branchStart: false,
        hasParentLine: true,
        branchId: 'a',
        replyingTo: null,
      });
    }
  });

  it('marks the rows no reply of their own follows, and draws a line down from the others', () => {
    const rows = tree(sampleTree());
    const flags = (id: string) => {
      const row = commentRow(rows, id);
      return [row.isLastChild, row.hasChildLine];
    };

    expect(flags('a')).toEqual([false, true]);
    expect(flags('b')).toEqual([false, true]);
    expect(flags('c')).toEqual([true, false]);
    expect(flags('d')).toEqual([true, false]);
    expect(flags('e')).toEqual([true, false]);
    expect(flags('f')).toEqual([true, false]);
  });

  it(`nests ${TREE_LEVELS} levels and stands for the deeper replies with one Ler mais row`, () => {
    const rows = tree(deepChain(6));

    expect(shape(rows)).toEqual(['root', 'r1', 'r2', 'r3', '+3']);
    expect(rows[4]).toMatchObject({
      type: 'readMore',
      branchId: 'r3',
      moreReplies: 3,
      rails: [false, false, false],
    });
    // The last level's line runs down into the Ler mais elbow.
    expect(commentRow(rows, 'r3')).toMatchObject({ depth: 3, hasChildLine: true, isLastChild: true });
  });

  it('keeps the rail of a collapsed comment that has a later sibling through its Ler mais', () => {
    const r3 = comment('r3', ana, [comment('r4')]);
    const r3b = comment('r3b', bia);
    const roots = [comment('root', caio, [comment('r1', bia, [comment('r2', caio, [r3, r3b])])])];
    const rows = tree(roots);

    expect(shape(rows)).toEqual(['root', 'r1', 'r2', 'r3', '+1', 'r3b']);
    expect(rows[4]).toMatchObject({ type: 'readMore', branchId: 'r3', rails: [false, false, true] });
    expect(commentRow(rows, 'r3b').rails).toEqual([false, false, false]);
  });

  it('shows the expanded replies one level further in, naming who each answers', () => {
    const rows = tree(deepChain(6), ['r3']);

    expect(shape(rows)).toEqual(['root', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']);
    const level = (id: string) => commentRow(rows, id);
    for (const id of ['r4', 'r5', 'r6']) expect(level(id).depth).toBe(TREE_LEVELS);
    expect(level('r4')).toMatchObject({ rails: [false, false, false, true], replyingTo: null });
    expect(level('r5')).toMatchObject({ rails: [false, false, false, true], replyingTo: ana });
    expect(level('r6')).toMatchObject({ rails: [false, false, false, false], replyingTo: bia });
    for (const id of ['r4', 'r5', 'r6']) {
      expect(level(id)).toMatchObject({ hasParentLine: true, hasChildLine: false, isLastChild: true });
    }
    expect(level('r3')).toMatchObject({ hasChildLine: true, isLastChild: false });
  });

  it('never draws a row deeper than one level past the last', () => {
    const rows = tree(deepChain(30), ['r3']);
    const depths = rows.map((row) => (row.type === 'comment' ? row.depth : 0));

    expect(Math.max(...depths)).toBe(TREE_LEVELS);
    expect(rows).toHaveLength(31);
  });

  it('expands nothing from a linear branch id that is not on the last level', () => {
    const rows = tree(deepChain(5), ['root']);

    expect(shape(rows)).toEqual(['root', 'r1', 'r2', 'r3', '+2']);
  });

  it('gives every row a unique key', () => {
    const rows = tree([...sampleTree(), ...deepChain(6)]);
    const keys = rows.map((row) => row.key);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
