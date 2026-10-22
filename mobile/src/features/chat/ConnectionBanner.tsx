import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { useChatConnection } from '@/lib/realtime/connectionStore';
import { colors, fontSize, space } from '@/theme/tokens';

/** Says when realtime is down; written messages wait in the queue and go out on reconnect. */
export function ConnectionBanner() {
  const status = useChatConnection((state) => state.status);

  if (status === 'connecting') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.text}>Conectando…</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View accessibilityLiveRegion="polite" style={styles.banner}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.textMuted} />
        <Text style={styles.text}>Sem conexão. As mensagens saem quando voltar.</Text>
        <Button label="Tentar agora" variant="text" onPress={() => chatSocket.reconnectNow()} />
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
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  text: { flex: 1, color: colors.text, fontSize: fontSize.sm },
});
