import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, space } from '@/theme/tokens';

import type { FlatComment } from './flattenComments';
import { displayName, type Comment } from './types';

const AVATAR_SIZE = 32;
const ICON_SIZE = 20;
// Brings the 32 dp avatar and the one-line name up to the 48 dp touch target.
const AVATAR_SLOP = space.sm;
const NAME_SLOP = { top: 14, bottom: 14, left: space.sm, right: space.sm };

export type CommentItemProps = {
  item: FlatComment;
  /** Receives the comment as the parent read it from the cache, so the toggle never works on a stale copy. */
  onToggleLike: (comment: Comment) => void;
  onReply: (comment: Comment) => void;
};

/** A comment of the thread; replies (depth 1) are indented and name who they answer. */
export function CommentItem({ item, onToggleLike, onReply }: CommentItemProps) {
  const { comment, depth, replyingTo } = item;
  const name = displayName(comment.author);
  const liked = comment.likedByMe;
  const likes = `${comment.likeCount} ${comment.likeCount === 1 ? 'curtida' : 'curtidas'}`;

  return (
    <View style={[styles.row, depth === 1 ? styles.reply : null]}>
      <ProfileLink user={comment.author} hitSlop={AVATAR_SLOP}>
        <Avatar uri={resolveImageUrl(comment.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
      </ProfileLink>
      <View style={styles.column}>
        {replyingTo ? (
          <Text style={styles.replyingTo}>{`Respondendo a @${replyingTo.username}`}</Text>
        ) : null}
        <View style={styles.meta}>
          <ProfileLink user={comment.author} hitSlop={NAME_SLOP} style={styles.nameLink}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </ProfileLink>
          <Text style={styles.time}>{` · ${formatRelativeTime(comment.createdAt)}`}</Text>
        </View>
        <Text style={styles.content}>{comment.content}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${liked ? 'Descurtir' : 'Curtir'} comentário, ${likes}`}
            hitSlop={space.sm}
            onPress={() => onToggleLike(comment)}
            style={styles.action}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={ICON_SIZE}
              color={liked ? colors.accent : colors.textMuted}
            />
            <Text style={styles.count}>{comment.likeCount}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Responder a ${name}`}
            hitSlop={space.sm}
            onPress={() => onReply(comment)}
            style={styles.action}
          >
            <Text style={styles.replyLabel}>Responder</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  reply: { marginLeft: space.xl },
  column: { flex: 1, gap: space.xs },
  replyingTo: { color: colors.textMuted, fontSize: fontSize.xs },
  meta: { flexDirection: 'row', alignItems: 'center' },
  nameLink: { flexShrink: 1 },
  name: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: 'bold' },
  time: { color: colors.textMuted, fontSize: fontSize.sm },
  content: { color: colors.text, fontSize: fontSize.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    minWidth: 48,
  },
  count: { color: colors.textMuted, fontSize: fontSize.sm },
  replyLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '600' },
});
