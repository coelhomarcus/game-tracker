import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

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
  style?: StyleProp<ViewStyle>;
};

/**
 * One line: the name (at most 70% of the line), the handle (the first to be cut) and the time.
 * Linked, the name and handle are one inline profile link, as in the design reference: the
 * avatar beside it is the large target for the same profile.
 */
export function PostMeta({ author, createdAt, linked = true, avatarSize, style }: PostMetaProps) {
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
    <View testID="post-meta" style={[styles.row, style]}>
      {avatarSize ? (
        <View style={styles.avatar}>
          <Avatar uri={resolveImageUrl(author.avatarUrl)} name={name} size={avatarSize} />
        </View>
      ) : null}
      {linked ? (
        <ProfileLink user={author} hitSlop={undefined} style={styles.who}>
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
  row: { flexDirection: 'row', alignItems: 'center', paddingBottom: space.xs },
  avatar: { marginRight: space.xs },
  who: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  name: { flexShrink: 0, maxWidth: '70%' },
  handle: { flexShrink: 10 },
  time: { flexShrink: 0, paddingLeft: space.xs },
});
