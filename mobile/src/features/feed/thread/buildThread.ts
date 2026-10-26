import type { UserSummary } from '@/features/games/types';

import type { Comment } from '../types';

export type ThreadMode = 'linear' | 'tree';

/** How many replies below a top-level comment the linear view follows before "Ler mais". */
export const LINEAR_CHAIN_DEPTH = 10;

/**
 * How many levels the tree view nests (depth 0 to 3). The replies of a comment on the last
 * level collapse into "Ler mais"; expanded, they show one level further in and nest no more, so
 * a deep tree never grows wider than that.
 */
export const TREE_LEVELS = 4;

export type ThreadCommentRow = {
  type: 'comment';
  key: string;
  comment: Comment;
  /** The top-level comment the row's branch starts with (its own id for that comment). */
  branchId: string;
  /**
   * 0 for a top-level comment, 1 for its replies, and so on. In the tree view it is the level the
   * row is drawn at, which stops at `TREE_LEVELS` for the replies an expansion reveals.
   */
  depth: number;
  /** The first row of a branch: it draws a hairline above and has no incoming line. */
  branchStart: boolean;
  /** A line comes down into the avatar from the row above (the elbow in the tree view). */
  hasParentLine: boolean;
  /** A line leaves the avatar towards the row below (a reply or a "Ler mais" row). */
  hasChildLine: boolean;
  /**
   * The author of the direct parent when the row does not hang from that parent visually (in the
   * linear view: the parent is not the row right above), so the row says "Respondendo a @x";
   * `null` otherwise.
   */
  replyingTo: UserSummary | null;
  /**
   * Tree view: one entry per indent the row sits in (as many as its `depth`), outermost first.
   * Entry `n` is on when the row's ancestor on level `n + 1` (the row itself, for the last
   * entry) has a later sibling, so a 2 dp rail runs down that indent towards it. Empty in the
   * linear view.
   */
  rails: readonly boolean[];
  /** No reply of its own follows the row: the next row is a sibling, a shallower row or none. */
  isLastChild: boolean;
};

export type ThreadReadMoreRow = {
  type: 'readMore';
  key: string;
  /**
   * What the row expands: the branch (its top-level comment) in the linear view, the comment
   * whose replies it stands for in the tree view.
   */
  branchId: string;
  /** The replies that are not shown. */
  moreReplies: number;
  /** Tree view: the rails of the comment whose replies it stands for. Empty in the linear view. */
  rails: readonly boolean[];
};

export type ThreadRow = ThreadCommentRow | ThreadReadMoreRow;

export type BuildThreadOptions = {
  mode: ThreadMode;
  /**
   * What shows every reply: branches (top-level comment ids) in the linear view, comments on
   * the last level in the tree view.
   */
  expanded: ReadonlySet<string>;
};

function countReplies(comment: Comment): number {
  let count = 0;
  for (const reply of comment.replies) count += 1 + countReplies(reply);
  return count;
}

type Visit = { comment: Comment; parent: Comment | null; depth: number };

/** The top-level comment and its first reply, that reply's first reply, … up to the cap. */
function firstChain(root: Comment): Visit[] {
  const chain: Visit[] = [{ comment: root, parent: null, depth: 0 }];
  let current = root;
  while (chain.length <= LINEAR_CHAIN_DEPTH && current.replies.length > 0) {
    const next = current.replies[0]!;
    chain.push({ comment: next, parent: current, depth: chain.length });
    current = next;
  }
  return chain;
}

/** The comment and every reply below it, depth first, in the order the server sent. */
function wholeBranch(root: Comment, depth = 0): Visit[] {
  const visits: Visit[] = [];
  const walk = (comment: Comment, parent: Comment | null, at: number) => {
    visits.push({ comment, parent, depth: at });
    for (const reply of comment.replies) walk(reply, comment, at + 1);
  };
  walk(root, null, depth);
  return visits;
}

/** Linear: each top-level comment, its first reply chain and one "Ler mais" for the rest. */
function linearRows(roots: readonly Comment[], expandedBranches: ReadonlySet<string>): ThreadRow[] {
  const rows: ThreadRow[] = [];

  for (const root of roots) {
    const expanded = expandedBranches.has(root.id);
    const visits = expanded ? wholeBranch(root) : firstChain(root);
    const hidden = expanded ? 0 : countReplies(root) - (visits.length - 1);

    visits.forEach((visit, index) => {
      const previous = index > 0 ? visits[index - 1]!.comment : null;
      const next = visits[index + 1];
      rows.push({
        type: 'comment',
        key: `comment:${visit.comment.id}`,
        comment: visit.comment,
        branchId: root.id,
        depth: visit.depth,
        branchStart: index === 0,
        hasParentLine: index > 0,
        hasChildLine: next !== undefined || hidden > 0,
        replyingTo:
          visit.parent !== null && visit.parent !== previous ? visit.parent.author : null,
        rails: [],
        isLastChild: next === undefined || next.depth <= visit.depth,
      });
    });

    if (hidden > 0) {
      rows.push({
        type: 'readMore',
        key: `readMore:${root.id}`,
        branchId: root.id,
        moreReplies: hidden,
        rails: [],
      });
    }
  }

  return rows;
}

/**
 * Tree: every comment depth first, each level indented under its parent, `TREE_LEVELS` levels
 * deep. A comment on the last level stands for its replies with one "Ler mais" row; expanded,
 * all of them (replies of replies too) hang from it one level further in, each naming who it
 * answers when that is not the comment it hangs from.
 */
function treeRows(roots: readonly Comment[], expanded: ReadonlySet<string>): ThreadRow[] {
  const rows: ThreadRow[] = [];
  const lastLevel = TREE_LEVELS - 1;

  const push = (
    comment: Comment,
    branchId: string,
    depth: number,
    rails: readonly boolean[],
    replyingTo: UserSummary | null,
  ) => {
    rows.push({
      type: 'comment',
      key: `comment:${comment.id}`,
      comment,
      branchId,
      depth,
      branchStart: depth === 0,
      hasParentLine: depth > 0,
      // Both are set once the rows below it are known.
      hasChildLine: false,
      isLastChild: true,
      replyingTo,
      rails,
    });
  };

  const walk = (comment: Comment, branchId: string, depth: number, rails: readonly boolean[]) => {
    push(comment, branchId, depth, rails, null);
    if (comment.replies.length === 0) return;

    if (depth < lastLevel) {
      comment.replies.forEach((reply, index) => {
        walk(reply, branchId, depth + 1, [...rails, index < comment.replies.length - 1]);
      });
      return;
    }

    if (!expanded.has(comment.id)) {
      rows.push({
        type: 'readMore',
        key: `readMore:${comment.id}`,
        branchId: comment.id,
        moreReplies: countReplies(comment),
        rails,
      });
      return;
    }

    const below = wholeBranch(comment).slice(1);
    below.forEach(({ comment: reply, parent }, index) => {
      push(
        reply,
        branchId,
        depth + 1,
        [...rails, index < below.length - 1],
        parent === comment ? null : (parent?.author ?? null),
      );
    });
  };

  for (const root of roots) walk(root, root.id, 0, []);

  // The row's own line runs down from its avatar when its replies (or their "Ler mais") follow.
  rows.forEach((row, index) => {
    if (row.type !== 'comment') return;
    const next = rows[index + 1];
    const repliesFollow = next?.type === 'comment' && next.depth > row.depth;
    row.isLastChild = !repliesFollow;
    row.hasChildLine =
      repliesFollow || (next?.type === 'readMore' && next.branchId === row.comment.id);
  });

  return rows;
}

/**
 * Lays the comment tree out as list rows.
 *
 * Linear: each top-level comment starts a branch, followed by its first reply chain only (first
 * reply, its first reply, … up to 10 deep); the branch's other replies collapse into one "Ler
 * mais" row unless the branch is expanded, which shows every reply depth first. A branch reads
 * as one connected line from its first row to its last, and a reply whose parent is not the row
 * above names who it answers.
 *
 * Tree: every reply nested under its parent with rails and elbows (see `treeRows`).
 */
export function buildThread(roots: readonly Comment[], options: BuildThreadOptions): ThreadRow[] {
  return options.mode === 'tree'
    ? treeRows(roots, options.expanded)
    : linearRows(roots, options.expanded);
}
