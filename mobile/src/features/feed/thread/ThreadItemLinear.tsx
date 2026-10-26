import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, space, threadLine } from '@/theme/tokens';

import { PostMeta } from '../PostMeta';
import { displayName, type Comment } from '../types';
import type { ThreadCommentRow } from './buildThread';
import { CommentControls } from './CommentControls';

/** The avatar of a linear row, and the width of the column its lines run through. */
export const LINEAR_AVATAR = 42;
/** The real touch box around the avatar: Android ignores hit slop beyond the parent's bounds. */
const AVATAR_BOX = 48;
const OVERHANG = (AVATAR_BOX - LINEAR_AVATAR) / 2;
const OUTER_SPACE = space.lg;
/** The space above each row, which carries the line coming down from the row above. */
const PARENT_LINE_SPACE = space.md;

export type ThreadItemLinearProps = {
  row: ThreadCommentRow;
  onReply: (comment: Comment) => void;
  onToggleLike: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
};

/**
 * A comment in the linear view, as the design reference draws a thread reply: the avatar column
 * carries a 2 dp line in from the row above and out to the row below, so a branch reads as one
 * line; the first row of a branch has a hairline above it instead.
 */
export const ThreadItemLinear = memo(function ThreadItemLinear({
  row,
  onReply,
  onToggleLike,
  onDelete,
}: ThreadItemLinearProps) {
  const { comment, replyingTo } = row;
  const name = displayName(comment.author);
  const summary = `Comentário de ${name}, ${formatRelativeTime(comment.createdAt)}: ${comment.content}`;

  return (
    <View
      testID="thread-item-linear"
      style={[
        styles.outer,
        row.branchStart && styles.branchStart,
        !row.hasChildLine && styles.last,
      ]}
    >
      {/* 12 dp above the avatar in all; its last 3 dp are the top of the avatar's touch box. */}
      <View style={styles.parentLineSpace}>
        <View style={styles.lineColumn}>
          {row.hasParentLine ? <View testID="thread-parent-line" style={styles.parentLine} /> : null}
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.avatarColumn}>
          <ProfileLink
            user={comment.author}
            hitSlop={undefined}
            touchOnly
            testID="author-avatar-link"
            style={styles.avatarLink}
          >
            <Avatar uri={resolveImageUrl(comment.author.avatarUrl)} name={name} size={LINEAR_AVATAR} />
          </ProfileLink>
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
          <PostMeta author={comment.author} createdAt={comment.createdAt} />
          <View accessible accessibilityLabel={summary} style={styles.body}>
            <Text testID="comment-text">{comment.content}</Text>
          </View>
          <CommentControls
            comment={comment}
            onReply={onReply}
            onToggleLike={onToggleLike}
            onDelete={onDelete}
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // The left padding stops short by the touch box's overhang, which the avatar column takes back.
  outer: { paddingLeft: OUTER_SPACE - OVERHANG, paddingRight: OUTER_SPACE },
  branchStart: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  last: { paddingBottom: OUTER_SPACE / 2 },
  parentLineSpace: { flexDirection: 'row', height: PARENT_LINE_SPACE - OVERHANG },
  lineColumn: { width: AVATAR_BOX, alignItems: 'center' },
  // 4 dp short of the avatar, counting the touch box's 3 dp above it.
  parentLine: {
    flex: 1,
    width: threadLine,
    marginBottom: space.xs - OVERHANG,
    backgroundColor: colors.borderLow,
  },
  row: { flexDirection: 'row', gap: space.md - OVERHANG },
  avatarColumn: { width: AVATAR_BOX, alignItems: 'center' },
  avatarLink: {
    width: AVATAR_BOX,
    height: AVATAR_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // From 4 dp under the avatar to the bottom of the row, where the next row's line goes on.
  childLine: {
    flex: 1,
    width: threadLine,
    marginTop: space.xs - OVERHANG,
    backgroundColor: colors.borderLow,
  },
  // Level with the avatar inside its touch box.
  content: { flex: 1, paddingTop: OVERHANG },
  replyingTo: { alignSelf: 'flex-start', paddingBottom: space._2xs },
  body: { paddingBottom: space._2xs },
});
