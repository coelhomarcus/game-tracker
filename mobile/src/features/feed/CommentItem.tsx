import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, space } from '@/theme/tokens';

import type { FlatComment } from './flattenComments';
import { displayName, type Comment } from './types';

const AVATAR_SIZE = 32;
const ICON_SIZE = 20;

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
      <Avatar uri={resolveImageUrl(comment.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.column}>
        {replyingTo ? (
          <Text style={styles.replyingTo}>{`Respondendo a @${replyingTo.username}`}</Text>
        ) : null}
        <Text style={styles.meta}>
          <Text style={styles.name}>{name}</Text>
          {` · ${formatRelativeTime(comment.createdAt)}`}
        </Text>
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
  meta: { color: colors.textMuted, fontSize: fontSize.sm },
  name: { color: colors.textStrong, fontWeight: 'bold' },
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
