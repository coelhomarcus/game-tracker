import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, space } from '@/theme/tokens';

import { useTogglePostLike } from './queries';
import type { Post } from './types';

const ICON_SIZE = 20;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export type PostActionsProps = {
  /** The post as the parent read it from the cache, so the toggle never works on a stale copy. */
  post: Post;
  /** Opens the post. Without it the comment counter is plain text, e.g. on the post's own page. */
  onComment?: () => void;
};

/** Like and comment counters of a post. */
export function PostActions({ post, onComment }: PostActionsProps) {
  const toggleLike = useTogglePostLike();
  const liked = post.likedByMe;
  const likes = plural(post.likeCount, 'curtida', 'curtidas');
  const comments = plural(post.commentCount, 'comentário', 'comentários');
  const commentContent = (
    <>
      <Ionicons name="chatbubble-outline" size={ICON_SIZE} color={colors.textMuted} />
      <Text style={styles.count}>{post.commentCount}</Text>
    </>
  );

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${liked ? 'Descurtir' : 'Curtir'} post, ${likes}`}
        hitSlop={space.sm}
        onPress={() => toggleLike.mutate(post)}
        style={styles.action}
      >
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={ICON_SIZE}
          color={liked ? colors.accent : colors.textMuted}
        />
        <Text style={styles.count}>{post.likeCount}</Text>
      </Pressable>
      {onComment ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={comments}
          hitSlop={space.sm}
          onPress={onComment}
          style={styles.action}
        >
          {commentContent}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={comments} style={styles.action}>
          {commentContent}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  count: { color: colors.textMuted, fontSize: fontSize.sm },
});
