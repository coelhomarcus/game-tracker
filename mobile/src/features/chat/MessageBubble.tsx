import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, lineHeight, radii, space, threadLine, type } from '@/theme/tokens';

import type { PendingStatus } from './chatStore';
import { pad } from './formatConversationTime';
import { isEmojiOnly } from './isEmojiOnly';
import { ReactionsPill } from './ReactionsPill';
import type { Reaction, ReplyTo } from './types';

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
  /** Oldest first; only server messages have any. */
  reactions?: Reaction[];
  /** The earlier message this one answers, shown as a quote above it. */
  replyTo?: ReplyTo | null;
  /** Who wrote `replyTo` ("você" for my own), for the quote's label. */
  replyToName?: string;
};

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
const EMOJI_SIZE = type.size.md * 3;

export const FAILED_RETRY_LABEL = 'Não enviada. Toque para tentar de novo';

const STATUS_LABELS = {
  sending: 'Enviando…',
  uncertain: 'Confirmando…',
  sent: 'Enviada',
} as const;

const NO_REACTIONS: Reaction[] = [];

export type MessageBubbleProps = {
  message: BubbleMessage;
  /** The oldest bubble of its group (top on screen): full corners on top, a group gap above. */
  isFirstInGroup?: boolean;
  /** The newest bubble of its group (bottom on screen): full corners below, the time under it. */
  isLastInGroup?: boolean;
  /** The signed-in user, to tell my reactions apart. */
  selfId?: string;
  onRetry?: () => void;
  onDiscard?: () => void;
  /** Long press on the bubble (or its reactions): the message menu. */
  onLongPress?: () => void;
  /** A tap on the reactions pill. */
  onReactionsPress?: () => void;
  /** A tap on the quote: go to the original. */
  onQuotePress?: () => void;
};

export type BubbleContentProps = {
  content: string;
  mine: boolean;
  pending: boolean;
  /** Squared corners where bubbles of a group meet; full corners when left out. */
  corners?: object;
  /** Caps the lines (the message menu's copy of a long message). */
  numberOfLines?: number;
  /** The screen reader label; the menu's copy has none (it is not the message itself). */
  label?: string;
  onLongPress?: () => void;
};

const LONG_PRESS_HINT = 'Toque duas vezes e segure para reagir e ver opções';

/** The bubble itself: text in a coloured bubble, or 1–3 emoji large and without one. */
export function BubbleContent({
  content,
  mine,
  pending,
  corners,
  numberOfLines,
  label,
  onLongPress,
}: BubbleContentProps) {
  const hint = onLongPress ? LONG_PRESS_HINT : undefined;
  if (isEmojiOnly(content)) {
    return (
      <Text
        testID="message-emoji"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onLongPress={onLongPress}
        style={[styles.emoji, pending && styles.pendingEmoji]}
      >
        {content}
      </Text>
    );
  }
  const style = [
    styles.bubble,
    corners,
    mine ? (pending ? styles.bubblePending : styles.bubbleMine) : styles.bubbleOther,
  ];
  const text = (
    <Text tone={mine ? 'onPrimary' : 'default'} numberOfLines={numberOfLines}>
      {content}
    </Text>
  );
  if (!onLongPress) {
    return (
      <View testID="message-bubble" accessible={label !== undefined} accessibilityLabel={label} style={style}>
        {text}
      </View>
    );
  }
  return (
    <Pressable
      testID="message-bubble"
      accessible
      accessibilityLabel={label}
      accessibilityHint={hint}
      onLongPress={onLongPress}
      style={style}
    >
      {text}
    </Pressable>
  );
}

export function MessageBubble({
  message,
  isFirstInGroup = true,
  isLastInGroup = true,
  selfId,
  onRetry,
  onDiscard,
  onLongPress,
  onReactionsPress,
  onQuotePress,
}: MessageBubbleProps) {
  const { content, createdAt, mine, senderName, status, reason, replyTo, replyToName } = message;
  const reactions = message.reactions ?? NO_REACTIONS;
  const time = formatClock(createdAt);
  const label = `${mine ? 'Você' : senderName}: ${content}, ${time}`;
  const pending = status !== 'sent';

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
      {replyTo ? (
        <QuotedReply replyTo={replyTo} name={replyToName ?? ''} onPress={onQuotePress} />
      ) : null}
      <BubbleContent
        content={content}
        mine={mine}
        pending={pending}
        corners={corners}
        label={label}
        onLongPress={onLongPress}
      />
      <ReactionsPill
        reactions={reactions}
        selfId={selfId}
        alignRight={mine}
        onPress={() => onReactionsPress?.()}
        onLongPress={onLongPress}
      />
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

type QuotedReplyProps = { replyTo: ReplyTo; name: string; onPress?: () => void };

/** The message being answered, above the reply: a left bar and up to two lines of it. */
function QuotedReply({ replyTo, name, onPress }: QuotedReplyProps) {
  return (
    <Pressable
      testID="message-quote"
      accessibilityRole="button"
      accessibilityLabel={`Em resposta a ${name}: ${replyTo.content}`}
      accessibilityHint="Vai para a mensagem original"
      onPress={onPress}
      style={styles.quoteTouch}
    >
      <View style={styles.quote}>
        <Text size="sm" tone="medium" numberOfLines={2}>
          {replyTo.content}
        </Text>
      </View>
    </Pressable>
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
  bubblePending: { backgroundColor: colors.primaryPending },
  bubbleOther: { backgroundColor: colors.bgContrast50 },
  emoji: { maxWidth: '85%', fontSize: EMOJI_SIZE, lineHeight: lineHeight(EMOJI_SIZE, 'snug') },
  pendingEmoji: { opacity: 0.6 },
  /** A real 48 dp target around the two-line quote. */
  quoteTouch: { maxWidth: '85%', minHeight: 48, justifyContent: 'flex-end', paddingBottom: space._2xs },
  quote: {
    paddingLeft: space.sm,
    paddingVertical: space._2xs,
    borderLeftWidth: threadLine,
    borderLeftColor: colors.borderMedium,
  },
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
