import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, space } from '@/theme/tokens';

import type { AppNotification, NotificationType } from './types';

const AVATAR_SIZE = 40;

const TEXTS: Record<NotificationType, string> = {
  like: 'curtiu seu post',
  comment: 'comentou no seu post',
  follow: 'começou a seguir você',
  reply: 'respondeu seu comentário',
  mention: 'mencionou você',
  repost: 'repostou seu post',
  quote: 'citou seu post',
};

export type NotificationRowProps = {
  notification: AppNotification;
  /** Whether the row leads somewhere; a like or comment without a post does not. */
  canOpen: boolean;
  onPress: () => void;
};

export function NotificationRow({ notification, canOpen, onPress }: NotificationRowProps) {
  const name = displayName(notification.actor);
  const text = TEXTS[notification.type];
  const time = formatRelativeTime(notification.createdAt);
  const unread = !notification.read;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Não lida. ' : ''}${name} ${text}, ${time}`}
      accessibilityState={{ disabled: !canOpen }}
      disabled={!canOpen}
      onPress={onPress}
      style={[styles.row, unread ? styles.unread : null]}
    >
      <Avatar uri={resolveImageUrl(notification.actor.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.column}>
        <Text>
          <Text weight="bold" tone="high">
            {name}
          </Text>
          {` ${text}`}
        </Text>
        <Text size="sm" tone="medium">
          {time}
        </Text>
      </View>
      {unread ? <View testID="unread-dot" style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  unread: { backgroundColor: colors.bgContrast25 },
  column: { flex: 1, gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
