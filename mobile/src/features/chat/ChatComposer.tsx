import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { colors, hairline, space } from '@/theme/tokens';

import { MAX_MESSAGE_LENGTH, useChatStore } from './chatStore';

/** Without a keystroke for this long, the other side is told typing stopped. */
export const TYPING_IDLE_MS = 3000;

export type TypingSignal = {
  /** The field changed to `text`. */
  keystroke(text: string): void;
  /** Sent, left or cleared: tells the other side right away. */
  stop(): void;
};

/**
 * `typing:start` on the first keystroke after being idle, `typing:stop` after 3 s without one, on
 * `stop()` and on unmount. Fire-and-forget: while disconnected nothing goes out, and the next
 * keystroke tries the start again.
 */
export function useTypingSignal(conversationId: string): TypingSignal {
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!active.current) return;
    active.current = false;
    chatSocket.emit('typing:stop', { conversationId });
  }, [conversationId]);

  const keystroke = useCallback(
    (text: string) => {
      if (text.trim() === '') {
        stop();
        return;
      }
      if (!active.current) active.current = chatSocket.emit('typing:start', { conversationId });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(stop, TYPING_IDLE_MS);
    },
    [conversationId, stop],
  );

  useEffect(() => stop, [stop]);

  return { keystroke, stop };
}

export type ChatComposerProps = {
  conversationId: string;
  onChangeText: (text: string) => void;
  /** Runs after a message was queued for sending. */
  onSent: () => void;
};

/** The message field pinned under the conversation. The text is the conversation's draft. */
export function ChatComposer({ conversationId, onChangeText, onSent }: ChatComposerProps) {
  const draft = useChatStore((state) => state.drafts[conversationId] ?? '');
  const setDraft = useChatStore((state) => state.setDraft);
  const send = useChatStore((state) => state.send);
  const canSend = draft.trim().length > 0;

  function change(text: string) {
    setDraft(conversationId, text);
    onChangeText(text);
  }

  function submit() {
    if (!canSend) return;
    if (send(conversationId, draft) !== null) onSent();
  }

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <TextField
          label="Mensagem"
          hideLabel
          placeholder="Mensagem"
          multiline
          maxLines={5}
          maxLength={MAX_MESSAGE_LENGTH}
          autoCapitalize="sentences"
          value={draft}
          onChangeText={change}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Enviar mensagem"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        style={styles.iconButton}
      >
        <Ionicons name="send" size={22} color={canSend ? colors.primary : colors.textMedium} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    backgroundColor: colors.bg,
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.sm,
  },
  field: { flex: 1 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
