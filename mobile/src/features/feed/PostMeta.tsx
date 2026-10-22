import { StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import type { UserSummary } from '@/features/games/types';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { space } from '@/theme/tokens';

import { displayName } from './types';

const NBSP = ' ';

export type PostMetaProps = {
  author: UserSummary;
  createdAt: Date;
  /**
   * Whether the name and handle open the profile. Off inside a card that is a link as a whole
   * (a quoted post), where a second link would only steal its taps.
   */
  linked?: boolean;
  /** Shows a small avatar before the name, as in a quoted post. */
  avatarSize?: number;
};

/**
 * One line: the name (at most 70% of the line), the handle (the first to be cut) and the time.
 * Linked, the name and handle are one 48 dp tall profile link.
 */
export function PostMeta({ author, createdAt, linked = true, avatarSize }: PostMetaProps) {
  const name = displayName(author);
  const who = (
    <>
      <Text
        testID="post-meta-name"
        numberOfLines={1}
        weight="semibold"
        tone="high"
        leading="tight"
        style={styles.name}
      >
        {name}
      </Text>
      <Text
        testID="post-meta-handle"
        numberOfLines={1}
        tone="medium"
        leading="tight"
        style={styles.handle}
      >
        {`${NBSP}@${author.username}`}
      </Text>
    </>
  );

  return (
    <View style={[styles.row, !linked && styles.plainRow]}>
      {avatarSize ? (
        <View style={styles.avatar}>
          <Avatar uri={resolveImageUrl(author.avatarUrl)} name={name} size={avatarSize} />
        </View>
      ) : null}
      {linked ? (
        <ProfileLink user={author} hitSlop={undefined} style={[styles.who, styles.link]}>
          {who}
        </ProfileLink>
      ) : (
        <View style={styles.who}>{who}</View>
      )}
      <Text numberOfLines={1} tone="medium" leading="tight" style={styles.time}>
        {`· ${formatRelativeTime(createdAt)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // Unlinked, nothing needs a 48 dp box: the line keeps the design reference's spacing.
  plainRow: { paddingBottom: space.xs },
  avatar: { marginRight: space.xs },
  who: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  // A real 48 dp tall touch target; Android ignores hit slop beyond the parent's bounds.
  link: { minHeight: 48 },
  name: { flexShrink: 0, maxWidth: '70%' },
  handle: { flexShrink: 10 },
  time: { flexShrink: 0, paddingLeft: space.xs },
});
