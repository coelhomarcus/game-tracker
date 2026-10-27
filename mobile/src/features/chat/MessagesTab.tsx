import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OptionSheet } from '@/components';
import { HEADER_SLOT_SIZE, HEADER_TOUCH_SIZE } from '@/components/Layout/Header';
import { colors, radii } from '@/theme/tokens';

import { useConversations, useMarkAllRead } from './queries';
import { openNewConversationSheet } from './sheetStore';
import { showsUnread } from './types';

/** How many conversations show as unread, from the same cached list the screen shows. */
export function useUnreadConversationCount(): number {
  const { data } = useConversations();
  return data?.filter(showsUnread).length ?? 0;
}

/** The tab's accessibility label; the badge itself is decorative. */
export function messagesTabLabel(unread: number): string {
  if (unread <= 0) return 'Mensagens';
  return `Mensagens, ${unread === 1 ? '1 não lida' : `${unread} não lidas`}`;
}

/** The "+" round button: opens the new conversation sheet. */
export function NewConversationButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nova conversa"
      onPress={openNewConversationSheet}
      style={styles.button}
    >
      {({ pressed }) => (
        <View style={[styles.circle, styles.filled, pressed && styles.pressed]}>
          <Ionicons name="add" size={22} color={colors.textEmphasis} />
        </View>
      )}
    </Pressable>
  );
}

type ListChoice = 'readAll';

/** The "…" button and its sheet with the actions on the whole list. */
export function MessagesMoreButton() {
  const [open, setOpen] = useState(false);
  const unread = useUnreadConversationCount();
  const markAllRead = useMarkAllRead();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mais opções"
        onPress={() => setOpen(true)}
        style={styles.button}
      >
        {({ pressed }) => (
          <View style={[styles.circle, pressed && styles.pressed]}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </View>
        )}
      </Pressable>
      <OptionSheet<ListChoice>
        visible={open}
        title="Mensagens"
        options={[
          {
            value: 'readAll',
            label: 'Marcar todas como lidas',
            icon: 'checkmark-done-outline',
            disabled: unread === 0,
          },
        ]}
        onSelect={(choice) => {
          if (choice === 'readAll') markAllRead.mutate();
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** The Mensagens header's right side: "…" (list actions) and "+" (new conversation). */
export function MessagesHeaderRight() {
  return (
    <View style={styles.row}>
      <MessagesMoreButton />
      <NewConversationButton />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  button: {
    minWidth: HEADER_TOUCH_SIZE,
    minHeight: HEADER_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: HEADER_SLOT_SIZE,
    height: HEADER_SLOT_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: { backgroundColor: colors.bgContrast50 },
  pressed: { backgroundColor: colors.bgContrast25 },
});
