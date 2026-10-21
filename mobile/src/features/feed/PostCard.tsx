import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, radii, space } from '@/theme/tokens';

import { PostActions } from './PostActions';
import { PostGameLink } from './PostGameLink';
import { displayName, type Post } from './types';

const AVATAR_SIZE = 40;
// Brings the 40 dp avatar and the one-line name up to the 48 dp touch target.
const AVATAR_SLOP = space.xs;
const NAME_SLOP = { top: 14, bottom: 14, left: space.sm, right: space.sm };

export type PostCardProps = {
  post: Post;
  onPress?: () => void;
  /** Hides the game link, for lists already scoped to one game. */
  hideGame?: boolean;
};

/**
 * A written post. The author links, the game link and the actions are siblings of the pressable
 * body, never inside it, so each stays reachable and none of them also opens the post.
 */
export function PostCard({ post, onPress, hideGame = false }: PostCardProps) {
  const name = displayName(post.author);
  const image = resolveImageUrl(post.imageUrl);
  const time = formatRelativeTime(post.createdAt);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <ProfileLink user={post.author} hitSlop={AVATAR_SLOP}>
          <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
        </ProfileLink>
        <View style={styles.column}>
          <View style={styles.meta}>
            <ProfileLink user={post.author} hitSlop={NAME_SLOP} style={styles.nameLink}>
              <Text numberOfLines={1} style={styles.name}>
                {name}
              </Text>
            </ProfileLink>
            <Text numberOfLines={1} style={styles.handle}>
              {` @${post.author.username} · ${time}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`Post de ${name}, ${time}: ${post.content}`}
            onPress={onPress}
            style={styles.body}
          >
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
          </Pressable>
        </View>
      </View>
      <View style={styles.footer}>
        {post.game && !hideGame ? <PostGameLink game={post.game} /> : null}
        <PostActions post={post} onComment={onPress} />
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  column: { flex: 1, gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center' },
  nameLink: { flexShrink: 1 },
  name: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: 'bold' },
  handle: { flexShrink: 1, color: colors.textMuted, fontSize: fontSize.sm },
  body: { gap: space.sm },
  content: { color: colors.text, fontSize: fontSize.md },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.card },
  // Aligned with the text column, past the avatar.
  footer: { paddingLeft: AVATAR_SIZE + space.md },
});
