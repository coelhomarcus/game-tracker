import type { UserSummary } from '@/features/games/types';

import type { Comment } from '../types';

export type ThreadMode = 'linear' | 'tree';

/** How many replies below a top-level comment the linear view follows before "Ler mais". */
export const LINEAR_CHAIN_DEPTH = 10;

export type ThreadCommentRow = {
  type: 'comment';
  key: string;
  comment: Comment;
  /** The top-level comment the row's branch starts with (its own id for that comment). */
  branchId: string;
  /** 0 for a top-level comment, 1 for its replies, and so on. */
  depth: number;
  /** The first row of a branch: it draws a hairline above and has no incoming line. */
  branchStart: boolean;
  /** A line comes down into the avatar from the row above. */
  hasParentLine: boolean;
  /** A line leaves the avatar towards the row below (a reply or a "Ler mais" row). */
  hasChildLine: boolean;
  /**
   * The author of the direct parent when that parent is not the row right above, so the row
   * says "Respondendo a @x"; `null` for a top-level comment or a reply right under its parent.
   */
  replyingTo: UserSummary | null;
};

export type ThreadReadMoreRow = {
  type: 'readMore';
  key: string;
  /** The branch the row expands. */
  branchId: string;
  /** The replies of the branch that are not shown. */
  moreReplies: number;
};

export type ThreadRow = ThreadCommentRow | ThreadReadMoreRow;

export type BuildThreadOptions = {
  mode: ThreadMode;
  /** Branches (top-level comment ids) that show every reply. */
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

/** The top-level comment and every reply below it, depth first, in the order the server sent. */
function wholeBranch(root: Comment): Visit[] {
  const visits: Visit[] = [];
  const walk = (comment: Comment, parent: Comment | null, depth: number) => {
    visits.push({ comment, parent, depth });
    for (const reply of comment.replies) walk(reply, comment, depth + 1);
  };
  walk(root, null, 0);
  return visits;
}

/**
 * Lays the comment tree out as list rows. Linear: each top-level comment starts a branch,
 * followed by its first reply chain only (first reply, its first reply, … up to 10 deep); the
 * branch's other replies collapse into one "Ler mais" row unless the branch is expanded, which
 * shows every reply depth first. A branch reads as one connected line from its first row to its
 * last, and a reply whose parent is not the row above names who it answers. Until the tree view
 * exists, `mode: 'tree'` lays rows out the same way.
 */
export function buildThread(roots: readonly Comment[], options: BuildThreadOptions): ThreadRow[] {
  const rows: ThreadRow[] = [];

  for (const root of roots) {
    const expanded = options.expanded.has(root.id);
    const visits = expanded ? wholeBranch(root) : firstChain(root);
    const hidden = expanded ? 0 : countReplies(root) - (visits.length - 1);

    visits.forEach((visit, index) => {
      const previous = index > 0 ? visits[index - 1]!.comment : null;
      const isLast = index === visits.length - 1;
      rows.push({
        type: 'comment',
        key: `comment:${visit.comment.id}`,
        comment: visit.comment,
        branchId: root.id,
        depth: visit.depth,
        branchStart: index === 0,
        hasParentLine: index > 0,
        hasChildLine: !isLast || hidden > 0,
        replyingTo:
          visit.parent !== null && visit.parent !== previous ? visit.parent.author : null,
      });
    });

    if (hidden > 0) {
      rows.push({
        type: 'readMore',
        key: `readMore:${root.id}`,
        branchId: root.id,
        moreReplies: hidden,
      });
    }
  }

  return rows;
}
