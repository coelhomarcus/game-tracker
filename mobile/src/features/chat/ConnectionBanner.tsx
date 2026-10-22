import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { useChatConnection } from '@/lib/realtime/connectionStore';
import { colors, hairline, space } from '@/theme/tokens';

/** Says when realtime is down; written messages wait in the queue and go out on reconnect. */
export function ConnectionBanner() {
  const status = useChatConnection((state) => state.status);

  if (status === 'connecting') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <ActivityIndicator size="small" color={colors.textMedium} />
        <Text size="sm" style={styles.text}>
          Conectando…
        </Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textMedium} />
        <Text size="sm" style={styles.text}>
          Sem conexão. As mensagens saem quando voltar.
        </Text>
        <Button label="Tentar agora" variant="ghost" onPress={() => chatSocket.reconnectNow()} />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    backgroundColor: colors.bg,
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
  },
  text: { flex: 1 },
});
