import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space, threadLine } from '@/theme/tokens';

import { PostMeta } from '../PostMeta';
import { displayName, type Comment } from '../types';
import type { ThreadCommentRow } from './buildThread';
import { CommentControls } from './CommentControls';

/** The avatar of a tree row, inline at the start of its name line. */
export const TREE_AVATAR = 24;
/** How far each level sits in from its parent. */
export const TREE_INDENT = space.lg;
/** The width of one indent: the indent plus half an avatar, so a rail runs under the avatar. */
export const TREE_INDENT_WIDTH = TREE_INDENT + TREE_AVATAR / 2;
const OUTER_SPACE = space.lg;
/** The avatar and the space after it in the name line; the text below starts past it. */
const AVATAR_PLUS_SPACE = TREE_AVATAR + space.xs;
/** The real touch box around the avatar: Android ignores hit slop beyond the parent's bounds. */
const AVATAR_BOX = 48;
const AVATAR_BOX_SIDE = (AVATAR_BOX - TREE_AVATAR) / 2;
const NESTED_TOP = OUTER_SPACE / 2;
const FIRST_LEVEL_TOP = 11;

/**
 * The indents a tree row (or its "Ler mais") sits in, one per level above it. An indent whose
 * level still has a later sibling to reach draws a 2 dp rail down its right edge.
 */
export function TreeIndents({ rails }: { rails: readonly boolean[] }) {
  return rails.map((on, level) => (
    <View
      key={level}
      testID={on ? 'thread-tree-rail' : 'thread-tree-indent'}
      style={[styles.indent, on && styles.rail]}
    />
  ));
}

export type ThreadItemTreeProps = {
  row: ThreadCommentRow;
  onReply: (comment: Comment) => void;
  onToggleLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
};

/**
 * A comment in the tree view, as the design reference draws a threaded reply: a 24 dp avatar in
 * the name line, one indent per level with rails down to later siblings, an elbow from the
 * parent's line into the avatar, and a line down from the avatar when replies follow. A
 * top-level comment has a hairline above it instead of an elbow.
 */
export const ThreadItemTree = memo(function ThreadItemTree({
  row,
  onReply,
  onToggleLike,
  onDelete,
}: ThreadItemTreeProps) {
  const { comment, replyingTo } = row;
  const name = displayName(comment.author);
  const summary = `Comentário de ${name}, ${formatRelativeTime(comment.createdAt)}: ${comment.content}`;
  const firstLevel = row.depth === 0;
  const top = firstLevel ? FIRST_LEVEL_TOP : NESTED_TOP;

  return (
    <View testID="thread-item-tree" style={[styles.outer, firstLevel && styles.firstLevel]}>
      <TreeIndents rails={row.rails} />
      <View
        testID="thread-tree-content"
        style={[styles.inner, { paddingTop: top }, !row.hasChildLine && styles.last]}
      >
        {row.hasParentLine ? <View testID="thread-tree-elbow" style={styles.elbow} /> : null}
        <PostMeta author={comment.author} createdAt={comment.createdAt} style={styles.meta} />
        <View style={styles.below}>
          <View style={styles.childLineColumn}>
            {row.hasChildLine ? <View testID="thread-child-line" style={styles.childLine} /> : null}
          </View>
          <View style={styles.content}>
            {replyingTo ? (
              <ProfileLink
                user={replyingTo}
                hitSlop={undefined}
                accessibilityLabel={`Respondendo a @${replyingTo.username}`}
                style={styles.replyingTo}
              >
                <Text numberOfLines={1} size="xs" tone="medium">
                  {`Respondendo a @${replyingTo.username}`}
                </Text>
              </ProfileLink>
            ) : null}
            <View accessible accessibilityLabel={summary} style={styles.body}>
              <Text testID="comment-text">{comment.content}</Text>
            </View>
            <CommentControls
              comment={comment}
              onReply={onReply}
              onToggleLike={onToggleLike}
              onDelete={onDelete}
              compact
            />
          </View>
        </View>
        {/*
          Drawn last, over the start of the name line: a 48 dp box inside the row with the avatar
          at its place in the line. Its edges only cover the start of the name (the same
          profile) and of the text.
        */}
        <ProfileLink
          user={comment.author}
          hitSlop={undefined}
          touchOnly
          testID="author-avatar-link"
          style={[styles.avatarBox, { top: top - NESTED_TOP }]}
        >
          <Avatar uri={resolveImageUrl(comment.author.avatarUrl)} name={name} size={TREE_AVATAR} />
        </ProfileLink>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: { flexDirection: 'row' },
  firstLevel: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  // Moved 1 dp right so the rail is centred on the elbow of the level below it.
  indent: { width: TREE_INDENT_WIDTH, left: 1 },
  rail: { borderRightWidth: threadLine, borderRightColor: colors.borderLow },
  inner: { flex: 1, paddingHorizontal: OUTER_SPACE },
  last: { paddingBottom: OUTER_SPACE / 2 },
  // From the parent's line (the rail position) into the middle of the avatar.
  elbow: {
    position: 'absolute',
    left: -1,
    top: 0,
    height: NESTED_TOP + TREE_AVATAR / 2 + threadLine / 2,
    width: TREE_INDENT,
    borderLeftWidth: threadLine,
    borderBottomWidth: threadLine,
    borderBottomLeftRadius: radii.sm,
    borderColor: colors.borderLow,
  },
  // The avatar is drawn by the touch box over this space.
  meta: { paddingLeft: AVATAR_PLUS_SPACE, paddingBottom: 0, minHeight: TREE_AVATAR },
  below: { flexDirection: 'row' },
  childLineColumn: { width: AVATAR_PLUS_SPACE, paddingTop: space._2xs },
  // A 2 dp line centred under the avatar, down to the row's end where the reply's elbow starts.
  childLine: {
    flex: 1,
    width: '50%',
    left: -1,
    borderRightWidth: threadLine,
    borderRightColor: colors.borderLow,
  },
  content: { flex: 1, paddingLeft: space._2xs },
  replyingTo: { alignSelf: 'flex-start', paddingBottom: space._2xs },
  body: { paddingBottom: space._2xs },
  avatarBox: {
    position: 'absolute',
    left: OUTER_SPACE - AVATAR_BOX_SIDE,
    width: AVATAR_BOX,
    height: AVATAR_BOX,
    paddingLeft: AVATAR_BOX_SIDE,
    paddingTop: NESTED_TOP,
  },
});
