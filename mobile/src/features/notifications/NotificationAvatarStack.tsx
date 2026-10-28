import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, space } from '@/theme/tokens';

/** At most this many faces; the rest are counted as "+N". */
export const STACK_MAX = 5;
const STACK_AVATAR = 28;
const STACK_OVERLAP = -8;
const LIST_AVATAR = 32;
/** The toggle is a real 48 dp box around the 28 dp faces; the row lends it the room above. */
export const STACK_TOUCH = 48;
export const STACK_TOUCH_OVERHANG = (STACK_TOUCH - STACK_AVATAR) / 2;

export type NotificationAvatarStackProps = {
  actors: readonly UserSummary[];
  expanded: boolean;
  onToggle: () => void;
};

/** The faces of a grouped row, "+N" past five, and a chevron; pressing it shows everyone. */
export function NotificationAvatarStack({ actors, expanded, onToggle }: NotificationAvatarStackProps) {
  const shown = actors.slice(0, STACK_MAX);
  const rest = actors.length - shown.length;
  return (
    <Pressable
      testID="notification-avatar-stack"
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Ocultar pessoas' : `Mostrar as ${actors.length} pessoas`}
      accessibilityState={{ expanded }}
      onPress={onToggle}
      style={styles.stack}
    >
      {shown.map((actor, index) => (
        <View key={actor.id} style={index > 0 ? styles.overlap : null}>
          <Avatar uri={resolveImageUrl(actor.avatarUrl)} name={displayName(actor)} size={STACK_AVATAR} />
        </View>
      ))}
      {rest > 0 ? (
        <Text size="sm" weight="semibold" tone="medium" style={styles.rest}>
          {`+${rest}`}
        </Text>
      ) : null}
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={16}
        color={colors.textMedium}
        style={styles.chevron}
      />
    </Pressable>
  );
}

export type NotificationActorListProps = {
  actors: readonly UserSummary[];
  onOpenProfile: (actor: UserSummary) => void;
};

/** Everyone in an expanded group, each opening their profile. */
export function NotificationActorList({ actors, onOpenProfile }: NotificationActorListProps) {
  return (
    <View testID="notification-actor-list">
      {actors.map((actor) => {
        const name = displayName(actor);
        return (
          <Pressable
            key={actor.id}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${name}`}
            onPress={() => onOpenProfile(actor)}
            style={styles.person}
          >
            <Avatar uri={resolveImageUrl(actor.avatarUrl)} name={name} size={LIST_AVATAR} />
            <Text weight="semibold" tone="high" numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: STACK_TOUCH,
    minWidth: STACK_TOUCH,
    marginTop: -STACK_TOUCH_OVERHANG,
    // The box's lower overhang already spaces the faces from the sentence: take back the content's
    // gap so the box ends exactly where the sentence starts (no touch area under the text).
    marginBottom: -space.xs,
  },
  overlap: { marginLeft: STACK_OVERLAP },
  rest: { marginLeft: space.sm },
  chevron: { marginLeft: space.xs },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  name: { flexShrink: 1 },
});
