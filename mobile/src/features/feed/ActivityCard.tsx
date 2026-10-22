import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, StatusIcon } from '@/components';
import { statusLabel } from '@/features/library/status';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, radii, space } from '@/theme/tokens';

import { PostActions } from './PostActions';
import { PostGameLink } from './PostGameLink';
import { displayName, type Post } from './types';

const AVATAR_SIZE = 32;
// Brings the 32 dp avatar up to the 48 dp touch target; the name link is 48 dp tall on its own.
const AVATAR_SLOP = space.sm;
const NAME_SLOP = { left: space.sm, right: space.sm };

export type ActivityCardProps = {
  post: Post;
  onPress?: () => void;
  /** Hides the game link, for lists already scoped to one game. */
  hideGame?: boolean;
};

/**
 * A library activity ("started playing…"), more compact than a written post. Like the post card,
 * it keeps the author links beside the pressable body.
 */
export function ActivityCard({ post, onPress, hideGame = false }: ActivityCardProps) {
  const name = displayName(post.author);
  const status = post.activityStatus;
  const time = formatRelativeTime(post.createdAt);
  const label = [`${name} ${post.content}`, status ? statusLabel[status] : null, time]
    .filter(Boolean)
    .join(', ');

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
          <ProfileLink user={post.author} hitSlop={NAME_SLOP} style={styles.nameLink}>
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </ProfileLink>
          <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={label}
            onPress={onPress}
            style={styles.body}
          >
            <Text style={styles.content}>{post.content}</Text>
            <View style={styles.meta}>
              {status ? (
                <View style={styles.chip}>
                  <StatusIcon status={status} />
                  <Text style={[styles.chipLabel, { color: colors.status[status] }]}>
                    {statusLabel[status]}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.time}>{time}</Text>
            </View>
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
    padding: space.md,
    gap: space.xs,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  // The 48 dp name link already leaves room above the body.
  column: { flex: 1 },
  // Centers the 32 dp avatar on the 48 dp name line.
  avatarLink: { marginTop: space.sm },
  nameLink: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  body: { gap: space.xs },
  content: { color: colors.text, fontSize: fontSize.sm },
  name: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: 'bold' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chipLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  time: { color: colors.textMuted, fontSize: fontSize.xs },
  // Aligned with the text column, past the avatar.
  footer: { paddingLeft: AVATAR_SIZE + space.md },
});
