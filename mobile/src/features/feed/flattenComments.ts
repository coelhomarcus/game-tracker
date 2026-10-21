import type { UserSummary } from '@/features/games/types';

import type { Comment } from './types';

export type FlatComment = {
  comment: Comment;
  depth: 0 | 1;
  /** The author of the direct parent; `null` for a root comment. */
  replyingTo: UserSummary | null;
};

/**
 * One level of indentation: each root at depth 0, then all of its descendants depth first at
 * depth 1, each pointing at the author it answered.
 */
export function flattenComments(roots: Comment[]): FlatComment[] {
  const rows: FlatComment[] = [];

  const addReplies = (parent: Comment) => {
    for (const reply of parent.replies) {
      rows.push({ comment: reply, depth: 1, replyingTo: parent.author });
      addReplies(reply);
    }
  };

  for (const root of roots) {
    rows.push({ comment: root, depth: 0, replyingTo: null });
    addReplies(root);
  }
  return rows;
}
