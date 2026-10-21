import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, radii, space } from '@/theme/tokens';

import { PostActions } from './PostActions';
import { PostGameLink } from './PostGameLink';
import { displayName, type Post } from './types';

const AVATAR_SIZE = 40;

export type PostCardProps = {
  post: Post;
  onPress?: () => void;
};

/** A written post. The game link and the actions stay outside the pressable body so they remain reachable. */
export function PostCard({ post, onPress }: PostCardProps) {
  const name = displayName(post.author);
  const image = resolveImageUrl(post.imageUrl);

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Post de ${name}`}
        onPress={onPress}
        style={styles.body}
      >
        <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
        <View style={styles.column}>
          <Text style={styles.meta}>
            <Text style={styles.name}>{name}</Text>
            {` @${post.author.username} · ${formatRelativeTime(post.createdAt)}`}
          </Text>
          <Text style={styles.content}>{post.content}</Text>
          {image ? (
            <Image
              testID="post-image"
              accessibilityLabel="Imagem do post"
              source={{ uri: image }}
              resizeMode="cover"
              style={styles.image}
            />
          ) : null}
        </View>
      </Pressable>
      <View style={styles.footer}>
        {post.game ? <PostGameLink game={post.game} /> : null}
        <PostActions post={post} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: space.lg,
    gap: space.sm,
  },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  column: { flex: 1, gap: space.sm },
  meta: { color: colors.textMuted, fontSize: fontSize.sm },
  name: { color: colors.textStrong, fontWeight: 'bold' },
  content: { color: colors.text, fontSize: fontSize.md },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.card },
  // Aligned with the text column, past the avatar.
  footer: { paddingLeft: AVATAR_SIZE + space.md },
});
