import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme/tokens';

import { useConversations } from './queries';
import { openNewConversationSheet } from './sheetStore';

/** How many conversations are unread, from the same cached list the screen shows. */
export function useUnreadConversationCount(): number {
  const { data } = useConversations();
  return data?.filter((conversation) => conversation.unread).length ?? 0;
}

/** The tab's accessibility label; the badge itself is decorative. */
export function messagesTabLabel(unread: number): string {
  if (unread <= 0) return 'Mensagens';
  return `Mensagens, ${unread === 1 ? '1 não lida' : `${unread} não lidas`}`;
}

export function NewConversationButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova conversa"
      onPress={openNewConversationSheet}
      style={styles.button}
    >
      <Ionicons name="create-outline" size={24} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
