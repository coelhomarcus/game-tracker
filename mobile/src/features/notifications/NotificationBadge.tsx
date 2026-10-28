import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { colors, radii } from '@/theme/tokens';

import type { NotificationType } from './types';

export const NOTIFICATION_BADGE_SIZE = 24;
const ICON_SIZE = 14;
const RING = 2;

/** The icon and fill of each type's badge. */
export const NOTIFICATION_BADGES: Record<NotificationType, { icon: IoniconName; color: string }> = {
  like: { icon: 'heart', color: colors.like },
  repost: { icon: 'repeat', color: colors.repost },
  follow: { icon: 'person-add', color: colors.primary },
  comment: { icon: 'chatbubble', color: colors.replyBadge },
  reply: { icon: 'chatbubble', color: colors.replyBadge },
  mention: { icon: 'at', color: colors.replyBadge },
  quote: { icon: 'chatbox-ellipses', color: colors.replyBadge },
};

/** The type's circle on the actor's avatar; the row's label already says what happened. */
export function NotificationBadge({ type }: { type: NotificationType }) {
  const { icon, color } = NOTIFICATION_BADGES[type];
  return (
    <View
      testID="notification-badge"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.badge, { backgroundColor: color }]}
    >
      <Ionicons name={icon} size={ICON_SIZE} color={colors.onPrimary} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -RING * 2,
    bottom: -RING * 2,
    width: NOTIFICATION_BADGE_SIZE,
    height: NOTIFICATION_BADGE_SIZE,
    borderRadius: radii.full,
    borderWidth: RING,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
