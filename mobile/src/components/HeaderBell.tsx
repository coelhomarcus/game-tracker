import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { colors, space } from '@/theme/tokens';

export function HeaderBell() {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notificações"
      onPress={() => router.push('/notifications')}
      style={styles.button}
    >
      <Ionicons name="notifications-outline" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 44, minHeight: 44, marginRight: space.xs, alignItems: 'center', justifyContent: 'center' },
});
