import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { statusLabel } from '@/features/library/status';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { PostMeta } from '../PostMeta';
import { displayName, type QuotedPost as QuotedPostData } from '../types';
import { ImageGrid } from './ImageGrid';

const MAX_LINES = 20;
const AVATAR_SIZE = 16;
/** The quoted post's first image is a preview: a fixed landscape box, whatever its shape. */
const PREVIEW_ASPECT = 16 / 9;

export type QuotedPostProps = {
  post: QuotedPostData;
  /** Defaults to opening the quoted post. */
  onPress?: () => void;
};

/** The original of a quote post, one level deep: a card that opens it. */
export function QuotedPost({ post, onPress }: QuotedPostProps) {
  const router = useRouter();
  const name = displayName(post.author);
  const time = formatRelativeTime(post.createdAt);
  const status = post.type === 'activity' ? post.activityStatus : null;
  const label = [`Post citado de ${name}, ${time}`, status ? statusLabel[status] : null]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      testID="quoted-post"
      accessibilityRole="link"
      accessibilityLabel={post.content ? `${label}: ${post.content}` : label}
      onPress={onPress ?? (() => router.push(`/posts/${post.id}` as Href))}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <PostMeta
        author={post.author}
        createdAt={post.createdAt}
        linked={false}
        avatarSize={AVATAR_SIZE}
      />
      {post.content ? <Text numberOfLines={MAX_LINES}>{post.content}</Text> : null}
      {status ? (
        <Text size="sm" style={{ color: colors.status[status] }}>
          {statusLabel[status]}
        </Text>
      ) : null}
      {post.images.length > 0 ? (
        <View style={styles.image}>
          <ImageGrid
            images={post.images.slice(0, 1)}
            interactive={false}
            aspect={PREVIEW_ASPECT}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Where the original of a quote post was, once it is deleted. */
export function RemovedQuote() {
  return (
    <View testID="quoted-post-removed" style={[styles.card, styles.removed]}>
      <Text size="sm" tone="low">
        Post removido
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    gap: space.xs,
  },
  pressed: { backgroundColor: colors.bgContrast25 },
  removed: { backgroundColor: colors.bgContrast25 },
  image: { marginTop: space.xs },
});
