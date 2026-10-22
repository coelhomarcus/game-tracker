import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { PostActions } from './PostActions';
import { PostGameLink } from './PostGameLink';
import { displayName, type Post } from './types';

const AVATAR_SIZE = 40;
// Brings the 40 dp avatar up to the 48 dp touch target; the name link is 48 dp tall on its own.
const AVATAR_SLOP = space.xs;
const NAME_SLOP = { left: space.sm, right: space.sm };

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
        <ProfileLink
          user={post.author}
          hitSlop={AVATAR_SLOP}
          touchOnly
          testID="author-avatar-link"
          style={styles.avatarLink}
        >
          <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
        </ProfileLink>
        <View style={styles.column}>
          <View style={styles.meta}>
            <ProfileLink user={post.author} hitSlop={NAME_SLOP} style={styles.nameLink}>
              <Text numberOfLines={1} size="sm" weight="bold" tone="high">
                {name}
              </Text>
            </ProfileLink>
            <Text numberOfLines={1} size="sm" tone="medium" style={styles.handle}>
              {` @${post.author.username} · ${time}`}
            </Text>
          </View>
          <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={`Post de ${name}, ${time}: ${post.content}`}
            onPress={onPress}
            style={styles.body}
          >
            <Text>{post.content}</Text>
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
    backgroundColor: colors.bgContrast25,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    borderRadius: radii.md,
    padding: space.lg,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  // The 48 dp name link already leaves room above the body.
  column: { flex: 1 },
  // Centers the 40 dp avatar on the 48 dp name line.
  avatarLink: { marginTop: space.xs },
  meta: { flexDirection: 'row', alignItems: 'center' },
  nameLink: { flexShrink: 1, minHeight: 48, justifyContent: 'center' },
  handle: { flexShrink: 1 },
  body: { gap: space.sm },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: radii.md },
  // Aligned with the text column, past the avatar.
  footer: { paddingLeft: AVATAR_SIZE + space.md },
});
