import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { useUnreadCount } from '@/features/notifications/queries';
import { colors } from '@/theme/tokens';
import { CountBadge } from './CountBadge';

const MAX_SHOWN = 30;

function bellLabel(unread: number): string {
  if (unread <= 0) return 'Notificações';
  return `Notificações, ${unread === 1 ? '1 não lida' : `${unread} não lidas`}`;
}

export function HeaderBell() {
  const router = useRouter();
  const unread = useUnreadCount();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bellLabel(unread)}
      onPress={() => router.navigate('/notifications')}
      style={styles.button}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
      <CountBadge count={unread} max={MAX_SHOWN} style={styles.badge} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // On the icon's top-right corner (the 24dp icon is centred in the 48dp box).
  badge: { left: 'auto', right: 2, top: 4 },
});
