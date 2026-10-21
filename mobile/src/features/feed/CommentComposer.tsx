import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField, type TextFieldInput } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { showToast } from '@/lib/toast';
import { colors, fontSize, space } from '@/theme/tokens';

const MAX_LENGTH = 500;

/** The comment being answered; `username` is the handle of its author. */
export type ReplyTarget = { commentId: string; username: string };

export type CommentComposerProps = {
  /** `null` for a comment on the post itself. */
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  /** Receives the trimmed text; a rejection keeps the text in the field. */
  onSubmit: (content: string) => Promise<void>;
};

/** The field pinned under the thread, with the reply bar above it while answering. */
export function CommentComposer({ replyTo, onCancelReply, onSubmit }: CommentComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<TextFieldInput>(null);
  const replyId = replyTo?.commentId;

  // Choosing someone to answer is a request to type: bring the keyboard up.
  useEffect(() => {
    if (replyId !== undefined) input.current?.focus();
  }, [replyId]);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && text.length <= MAX_LENGTH && !sending;
  const placeholder = replyTo ? 'Escreva sua resposta' : 'Escreva um comentário';

  async function send() {
    if (!canSend) return;
    setSending(true);
    try {
      await onSubmit(trimmed);
      setText('');
    } catch (error) {
      showToast(authErrorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      {replyTo ? (
        <View style={styles.replyBar}>
          <Text numberOfLines={1} style={styles.replyText}>
            {`Respondendo a @${replyTo.username}`}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar resposta"
            onPress={onCancelReply}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label={placeholder}
            hideLabel
            placeholder={placeholder}
            maxLength={MAX_LENGTH}
            returnKeyType="send"
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => void send()}
            inputRef={input}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enviar comentário"
          accessibilityState={{ disabled: !canSend, busy: sending }}
          disabled={!canSend}
          onPress={() => void send()}
          style={styles.iconButton}
        >
          <Ionicons name="send" size={22} color={canSend ? colors.accent : colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.xs,
  },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  replyText: { flex: 1, color: colors.textMuted, fontSize: fontSize.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: { flex: 1 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
