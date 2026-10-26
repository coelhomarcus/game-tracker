import { buildThread } from '@/features/feed/thread/buildThread';
import type { Comment } from '@/features/feed/types';

/** Every comment of a tree in the order the thread lists them with all branches expanded. */
export function threadComments(tree: Comment[]): Comment[] {
  const expanded = new Set(tree.map((comment) => comment.id));
  return buildThread(tree, { mode: 'linear', expanded }).flatMap((row) =>
    row.type === 'comment' ? [row.comment] : [],
  );
}
