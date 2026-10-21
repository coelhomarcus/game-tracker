import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
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
};

/** Like and comment counters of a post. */
export function PostActions({ post }: PostActionsProps) {
  const router = useRouter();
  const toggleLike = useTogglePostLike();
  const liked = post.likedByMe;
  const likes = plural(post.likeCount, 'curtida', 'curtidas');

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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={plural(post.commentCount, 'comentário', 'comentários')}
        hitSlop={space.sm}
        onPress={() => router.push(`/posts/${post.id}` as Href)}
        style={styles.action}
      >
        <Ionicons name="chatbubble-outline" size={ICON_SIZE} color={colors.textMuted} />
        <Text style={styles.count}>{post.commentCount}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48 },
  count: { color: colors.textMuted, fontSize: fontSize.sm },
});
