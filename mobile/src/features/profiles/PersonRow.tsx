import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, fontSize, space } from '@/theme/tokens';

import { FollowButton } from './FollowButton';
import type { PersonResult } from './types';

const AVATAR_SIZE = 48;

export type PersonRowProps = {
  person: PersonResult;
  onPress: () => void;
  /** Rows that lead somewhere other than the profile hide the follow button. Default: shown. */
  showFollow?: boolean;
  /** Replaces the default `Perfil de <name>` label when the press does something else. */
  pressLabel?: string;
};

export function PersonRow({ person, onPress, showFollow = true, pressLabel }: PersonRowProps) {
  const selfId = useSession((state) => state.user?.id);
  const name = displayName(person);
  const bio = person.bio?.trim();

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pressLabel ?? `Perfil de ${name}`}
        onPress={onPress}
        style={styles.body}
      >
        <Avatar uri={resolveImageUrl(person.avatarUrl)} name={name} size={AVATAR_SIZE} />
        <View style={styles.column}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text numberOfLines={1} style={styles.username}>{`@${person.username}`}</Text>
          {bio ? (
            <Text testID="person-bio" numberOfLines={1} style={styles.bio}>
              {bio}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {!showFollow || person.id === selfId ? null : (
        <FollowButton userId={person.id} following={person.isFollowedByMe} name={name} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
  },
  column: { flex: 1 },
  name: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: 'bold' },
  username: { color: colors.textMuted, fontSize: fontSize.sm },
  bio: { color: colors.textMuted, fontSize: fontSize.sm },
});
