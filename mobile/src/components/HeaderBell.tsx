import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useUnreadCount } from '@/features/notifications/queries';
import { colors, fontSize, space } from '@/theme/tokens';

const MAX_SHOWN = 9;

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
      {unread > 0 ? (
        <View pointerEvents="none" style={styles.badge}>
          <Text style={styles.badgeText}>
            {unread > MAX_SHOWN ? `${MAX_SHOWN}+` : String(unread)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    marginRight: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.onAccent, fontSize: fontSize.xs, fontWeight: 'bold', lineHeight: 14 },
});
