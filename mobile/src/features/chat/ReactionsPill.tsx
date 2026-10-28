import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, hairline, radii, space } from '@/theme/tokens';

import type { Reaction } from './types';

/** The pill shows at most this many different emoji. */
export const PILL_MAX_EMOJI = 3;
/** How far the pill rides up over the bubble's bottom edge. */
export const PILL_OVERLAP = space.sm;
const PILL_HEIGHT = 24;
const TOUCH = 48;

export type ReactionSummary = {
  /** Up to 3 different emoji, the most used first (ties: the first used first). */
  emoji: string[];
  /** Every reaction on the message. */
  total: number;
  /** Whether any of them is mine. */
  mine: boolean;
  /** My first reaction (the one a tap takes back), if any. */
  myFirst: string | null;
};

export function summarizeReactions(reactions: Reaction[], selfId: string | undefined): ReactionSummary {
  const counts = new Map<string, number>();
  for (const { emoji } of reactions) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  // A Map keeps insertion order, so the sort's ties keep the first used first.
  const emoji = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, PILL_MAX_EMOJI)
    .map(([value]) => value);
  const myFirst = reactions.find((item) => item.userId === selfId)?.emoji ?? null;
  return { emoji, total: reactions.length, mine: myFirst !== null, myFirst };
}

/** "Reações: 😂 2, ❤️ 1" plus whether mine are among them, for screen readers. */
function reactionsLabel(reactions: Reaction[], mine: boolean): string {
  const counts = new Map<string, number>();
  for (const { emoji } of reactions) counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  const parts = [...counts.entries()].map(([emoji, count]) => `${emoji} ${count}`);
  return `Reações: ${parts.join(', ')}${mine ? '. Inclui as suas' : ''}`;
}

export type ReactionsPillProps = {
  reactions: Reaction[];
  selfId: string | undefined;
  /** Mine sit on the right; the pill hangs on the sender's side. */
  alignRight: boolean;
  /** A tap: takes back my first reaction, or (with none of mine) opens the message menu. */
  onPress: () => void;
  onLongPress?: () => void;
};

/**
 * The reactions hanging under a bubble: up to 3 different emoji and the total when over 1, in a
 * small pill that rides 8 up over the bubble's edge. Outlined in `primary` when mine are among them.
 * The pill is 24 high; its touch box is a real 48 around it.
 */
export function ReactionsPill({ reactions, selfId, alignRight, onPress, onLongPress }: ReactionsPillProps) {
  if (reactions.length === 0) return null;
  const summary = summarizeReactions(reactions, selfId);
  return (
    <Pressable
      testID="reactions-pill"
      accessibilityRole="button"
      accessibilityLabel={reactionsLabel(reactions, summary.mine)}
      accessibilityHint={summary.mine ? 'Remove a sua reação' : 'Abre as opções da mensagem'}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[styles.touch, alignRight ? styles.right : styles.left]}
    >
      <View testID="reactions-pill-body" style={[styles.pill, summary.mine && styles.pillMine]}>
        {summary.emoji.map((emoji) => (
          <Text key={emoji} size="xs" style={styles.emoji}>
            {emoji}
          </Text>
        ))}
        {summary.total > 1 ? (
          <Text testID="reactions-count" size="xs" weight="semibold" tone="medium">
            {summary.total}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Centred in its 48 box, the pill's top sits PILL_OVERLAP over the bubble's bottom edge.
  touch: {
    minWidth: TOUCH,
    minHeight: TOUCH,
    marginTop: -(PILL_OVERLAP + (TOUCH - PILL_HEIGHT) / 2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: { alignSelf: 'flex-end', marginRight: space.xs },
  left: { alignSelf: 'flex-start', marginLeft: space.xs },
  pill: {
    height: PILL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space._2xs,
    paddingHorizontal: space.sm,
    borderRadius: radii.full,
    borderWidth: hairline,
    borderColor: colors.bg,
    backgroundColor: colors.bgContrast50,
  },
  pillMine: { borderWidth: 1, borderColor: colors.primary },
  emoji: { lineHeight: PILL_HEIGHT - 6 },
});
