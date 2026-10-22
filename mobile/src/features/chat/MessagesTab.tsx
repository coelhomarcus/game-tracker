import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { colors } from '@/theme/tokens';

import { useConversations } from './queries';
import { openNewConversationSheet } from './sheetStore';

/** Whether any conversation is unread, from the same cached list the screen shows. */
export function useHasUnreadConversations(): boolean {
  const { data } = useConversations();
  return data?.some((conversation) => conversation.unread) ?? false;
}

export const MESSAGES_TAB_UNREAD_LABEL = 'Mensagens, há conversas não lidas';

type TabIconProps = { color: ColorValue; size: number };

/** The dot is decorative; the tab's accessibility label says that something is unread. */
export function MessagesTabIcon({ color, size }: TabIconProps) {
  const unread = useHasUnreadConversations();
  return (
    <View>
      <Ionicons name="chatbubbles" size={size} color={typeof color === 'string' ? color : undefined} />
      {unread ? (
        <View
          testID="messages-tab-dot"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.dot}
        />
      ) : null}
    </View>
  );
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
  dot: {
    position: 'absolute',
    top: -1,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.chrome,
  },
});
