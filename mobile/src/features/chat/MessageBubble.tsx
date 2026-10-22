import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, radii, space } from '@/theme/tokens';

import type { PendingStatus } from './chatStore';

/** A message as the room shows it: from the server (`sent`) or still pending here. */
export type BubbleMessage = {
  content: string;
  createdAt: Date;
  mine: boolean;
  /** Who wrote it, for the screen reader label of other people's messages. */
  senderName: string;
  status: 'sent' | PendingStatus;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `HH:mm` in local time. */
export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export type MessageBubbleProps = {
  message: BubbleMessage;
  onRetry?: () => void;
  onDiscard?: () => void;
};

const STATUS_LINES = {
  sending: { icon: 'time-outline', label: 'Enviando…' },
  uncertain: { icon: 'sync-outline', label: 'Confirmando…' },
} as const;

export function MessageBubble({ message, onRetry, onDiscard }: MessageBubbleProps) {
  const { content, createdAt, mine, senderName, status } = message;
  const time = formatClock(createdAt);
  const label = `${mine ? 'Você' : senderName}: ${content}, ${time}`;
  const statusLine = status === 'sending' || status === 'uncertain' ? STATUS_LINES[status] : null;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
      <View
        accessible
        accessibilityLabel={label}
        style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
      >
        <Text tone={mine ? 'high' : 'default'}>{content}</Text>
      </View>
      <View style={styles.footer}>
        <Text size="xs" tone="medium">
          {time}
        </Text>
        {statusLine ? (
          <View style={styles.status}>
            <Ionicons name={statusLine.icon} size={14} color={colors.textMedium} />
            <Text size="xs" tone="medium">
              {statusLine.label}
            </Text>
          </View>
        ) : null}
        {status === 'failed' ? (
          <View style={styles.status}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text size="xs" weight="bold" tone="danger">
              Não enviada
            </Text>
          </View>
        ) : null}
      </View>
      {status === 'failed' ? (
        <View style={styles.actions}>
          {onRetry ? <Button label="Tentar de novo" variant="ghost" onPress={onRetry} /> : null}
          {onDiscard ? <Button label="Descartar" variant="ghost" onPress={onDiscard} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg, paddingVertical: space.xs, gap: space.xs },
  rowMine: { alignItems: 'flex-end' },
  rowOther: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radii.md,
  },
  bubbleMine: { backgroundColor: colors.selected },
  bubbleOther: { backgroundColor: colors.bgContrast50 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  actions: { flexDirection: 'row', gap: space.sm },
});
