import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, StatusIcon } from '@/components';
import { statusLabel } from '@/features/library/status';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, radii, space } from '@/theme/tokens';

import { PostActions } from './PostActions';
import { PostGameLink } from './PostGameLink';
import { displayName, type Post } from './types';

const AVATAR_SIZE = 32;

export type ActivityCardProps = {
  post: Post;
  onPress?: () => void;
};

/** A library activity ("started playing…"), more compact than a written post. */
export function ActivityCard({ post, onPress }: ActivityCardProps) {
  const name = displayName(post.author);
  const status = post.activityStatus;
  const time = formatRelativeTime(post.createdAt);
  const label = [`${name} ${post.content}`, status ? statusLabel[status] : null, time]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.body}
      >
        <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
        <View style={styles.column}>
          <Text style={styles.content}>
            <Text style={styles.name}>{name}</Text>
            {` ${post.content}`}
          </Text>
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
    padding: space.md,
    gap: space.xs,
  },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  column: { flex: 1, gap: space.xs },
  content: { color: colors.text, fontSize: fontSize.sm },
  name: { color: colors.textStrong, fontWeight: 'bold' },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md },
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  chipLabel: { fontSize: fontSize.xs, fontWeight: '600' },
  time: { color: colors.textMuted, fontSize: fontSize.xs },
  // Aligned with the text column, past the avatar.
  footer: { paddingLeft: AVATAR_SIZE + space.md },
});
