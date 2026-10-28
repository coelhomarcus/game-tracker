import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PressableScale } from '@/components';
import { fontFamily } from '@/components/Text';
import { chatSocket } from '@/lib/realtime/chatSocket';
import { colors, lineHeight, radii, space, type } from '@/theme/tokens';

import { MAX_MESSAGE_LENGTH, useChatStore } from './chatStore';

const FONT_SIZE = type.size.md;
const LINE_HEIGHT = lineHeight(FONT_SIZE, 'snug');
/** The field grows up to this many lines, then scrolls. */
export const COMPOSER_MAX_LINES = 12;
const INPUT_MAX_HEIGHT = LINE_HEIGHT * COMPOSER_MAX_LINES;
const PILL_MIN_HEIGHT = 40;
const PILL_VERTICAL_PADDING = 10;
const SEND_SIZE = 40;

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

/**
 * The message pill under the conversation: grows up to 12 lines and then scrolls, with a round
 * send button that stays off for blank text. The text is the conversation's draft.
 */
export function ChatComposer({ conversationId, onChangeText, onSent }: ChatComposerProps) {
  const draft = useChatStore((state) => state.drafts[conversationId] ?? '');
  const setDraft = useChatStore((state) => state.setDraft);
  const send = useChatStore((state) => state.send);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
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
      {/* A 48 dp target around the 40 dp pill: a tap on its padding focuses the field too. */}
      <Pressable
        accessible={false}
        onPress={() => inputRef.current?.focus()}
        style={styles.pillTouch}
      >
        <View style={styles.pill}>
          <TextInput
            ref={inputRef}
            accessibilityLabel="Mensagem"
            placeholder="Escreva uma mensagem"
            placeholderTextColor={colors.textMedium}
            selectionColor={colors.primary}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            autoCapitalize="sentences"
            value={draft}
            onChangeText={change}
            style={styles.input}
          />
        </View>
      </Pressable>
      <PressableScale
        targetScale={0.95}
        accessibilityRole="button"
        accessibilityLabel="Enviar mensagem"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        style={styles.sendTouch}
      >
        <View testID="send-circle" style={[styles.send, canSend ? styles.sendOn : styles.sendOff]}>
          <Ionicons name="arrow-up" size={22} color={canSend ? colors.onPrimary : colors.textLow} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    backgroundColor: colors.bg,
    paddingLeft: space.lg,
    paddingRight: space.sm,
    paddingVertical: space.xs,
  },
  /** 4 + 40 + 4: a 48 dp target, and the pill's bottom stays level with the send circle's. */
  pillTouch: { flex: 1, paddingVertical: (48 - PILL_MIN_HEIGHT) / 2 },
  pill: {
    minHeight: PILL_MIN_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: PILL_VERTICAL_PADDING,
    borderRadius: radii.xl,
    backgroundColor: colors.bgContrast50,
  },
  input: {
    maxHeight: INPUT_MAX_HEIGHT,
    padding: 0,
    color: colors.text,
    fontFamily: fontFamily.normal,
    fontSize: FONT_SIZE,
    lineHeight: LINE_HEIGHT,
    textAlignVertical: 'center',
  },
  sendTouch: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  send: {
    width: SEND_SIZE,
    height: SEND_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendOn: { backgroundColor: colors.primary },
  sendOff: { backgroundColor: colors.controlDisabled },
});
