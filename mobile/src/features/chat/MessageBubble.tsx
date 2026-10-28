import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, lineHeight, radii, space, type } from '@/theme/tokens';

import type { PendingStatus } from './chatStore';
import { isEmojiOnly } from './isEmojiOnly';

/** A message as the room shows it: from the server (`sent`) or still pending here. */
export type BubbleMessage = {
  content: string;
  createdAt: Date;
  mine: boolean;
  /** Who wrote it, for the screen reader label of other people's messages. */
  senderName: string;
  status: 'sent' | PendingStatus;
  /** Why a failed message was refused for good (a block, or the recipient's message policy). */
  reason?: string;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `HH:mm` in local time. */
export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Space above a bubble that opens a group, and above one that continues it. */
export const GROUP_GAP = space.md;
export const CLUSTER_GAP = space._2xs;
export const BUBBLE_RADIUS = radii.xl;
/** The corners where bubbles of one group meet, on the sender's side. */
export const JOINED_RADIUS = radii.xs;
/** Two-digit hex alpha for 60% opacity: a pending bubble is `primary` at 0.6. */
const ALPHA_60 = '99';
export const PENDING_BUBBLE_COLOR = `${colors.primary}${ALPHA_60}`;
const EMOJI_SIZE = type.size.md * 3;

export const FAILED_RETRY_LABEL = 'Não enviada. Toque para tentar de novo';

const STATUS_LABELS = {
  sending: 'Enviando…',
  uncertain: 'Confirmando…',
  sent: 'Enviada',
} as const;

export type MessageBubbleProps = {
  message: BubbleMessage;
  /** The oldest bubble of its group (top on screen): full corners on top, a group gap above. */
  isFirstInGroup?: boolean;
  /** The newest bubble of its group (bottom on screen): full corners below, the time under it. */
  isLastInGroup?: boolean;
  onRetry?: () => void;
  onDiscard?: () => void;
};

export function MessageBubble({
  message,
  isFirstInGroup = true,
  isLastInGroup = true,
  onRetry,
  onDiscard,
}: MessageBubbleProps) {
  const { content, createdAt, mine, senderName, status, reason } = message;
  const time = formatClock(createdAt);
  const label = `${mine ? 'Você' : senderName}: ${content}, ${time}`;
  const pending = status !== 'sent';
  const emoji = isEmojiOnly(content);

  // The joined corners are on the sender's side: right for mine, left for theirs.
  const corners = mine
    ? {
        borderTopRightRadius: isFirstInGroup ? BUBBLE_RADIUS : JOINED_RADIUS,
        borderBottomRightRadius: isLastInGroup ? BUBBLE_RADIUS : JOINED_RADIUS,
      }
    : {
        borderTopLeftRadius: isFirstInGroup ? BUBBLE_RADIUS : JOINED_RADIUS,
        borderBottomLeftRadius: isLastInGroup ? BUBBLE_RADIUS : JOINED_RADIUS,
      };

  return (
    <View
      testID="message-row"
      style={[
        styles.row,
        mine ? styles.rowMine : styles.rowOther,
        { paddingTop: isFirstInGroup ? GROUP_GAP : CLUSTER_GAP },
      ]}
    >
      {emoji ? (
        <Text
          testID="message-emoji"
          accessibilityLabel={label}
          style={[styles.emoji, pending && styles.pendingEmoji]}
        >
          {content}
        </Text>
      ) : (
        <View
          testID="message-bubble"
          accessible
          accessibilityLabel={label}
          style={[
            styles.bubble,
            corners,
            mine ? (pending ? styles.bubblePending : styles.bubbleMine) : styles.bubbleOther,
          ]}
        >
          <Text tone={mine ? 'onPrimary' : 'default'}>{content}</Text>
        </View>
      )}
      {status === 'failed' ? (
        <FailedLine reason={reason} onRetry={onRetry} onDiscard={onDiscard} />
      ) : isLastInGroup ? (
        <View style={styles.footer}>
          <Text size="xs" tone="medium">
            {time}
          </Text>
          {mine ? (
            <>
              <Text size="xs" tone="medium">
                ·
              </Text>
              <Text size="xs" tone="medium">
                {STATUS_LABELS[status]}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type FailedLineProps = Pick<MessageBubbleProps, 'onRetry' | 'onDiscard'> & { reason?: string };

/**
 * Under a failed message: tap to send it again, or, when it was refused for good (a block, the
 * recipient's policy), the reason with no retry. Either way it can be thrown away.
 */
function FailedLine({ reason, onRetry, onDiscard }: FailedLineProps) {
  return (
    <View style={styles.failed}>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={FAILED_RETRY_LABEL}
          onPress={onRetry}
          style={styles.lineAction}
        >
          <Text size="sm" tone="danger">
            {FAILED_RETRY_LABEL}
          </Text>
        </Pressable>
      ) : (
        <Text size="sm" tone="danger" style={styles.failedText}>
          {reason ? `Não enviada. ${reason}` : 'Não enviada.'}
        </Text>
      )}
      {onDiscard ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Descartar"
          onPress={onDiscard}
          style={styles.lineAction}
        >
          <Text size="sm" weight="semibold" tone="medium">
            Descartar
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.lg },
  rowMine: { alignItems: 'flex-end' },
  rowOther: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: BUBBLE_RADIUS,
  },
  bubbleMine: { backgroundColor: colors.primary },
  bubblePending: { backgroundColor: PENDING_BUBBLE_COLOR },
  bubbleOther: { backgroundColor: colors.bgContrast50 },
  emoji: { maxWidth: '85%', fontSize: EMOJI_SIZE, lineHeight: lineHeight(EMOJI_SIZE, 'snug') },
  pendingEmoji: { opacity: 0.6 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingTop: space.xs,
    paddingHorizontal: space.xs,
  },
  failed: {
    maxWidth: '85%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    columnGap: space.sm,
  },
  failedText: { paddingVertical: space.xs, flexShrink: 1 },
  /** A real 48 dp target: hitSlop past the list cell would be lost on Android. */
  lineAction: { minHeight: 48, justifyContent: 'center' },
});
