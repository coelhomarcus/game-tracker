import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radii, space, threadLine } from '@/theme/tokens';

import type { ThreadReadMoreRow } from './buildThread';
import { LINEAR_AVATAR } from './ThreadItemLinear';

const OUTER_SPACE = space.lg;
const ICON_SIZE = 18;

/** "Ler mais 1 resposta" / "Ler mais N respostas". */
export function readMoreLabel(count: number): string {
  return `Ler mais ${count} ${count === 1 ? 'resposta' : 'respostas'}`;
}

export type ThreadReadMoreProps = {
  row: ThreadReadMoreRow;
  onExpand: (branchId: string) => void;
};

/**
 * Closes a collapsed branch: the branch's line bends into an elbow towards "Ler mais N
 * respostas", which shows the rest of the branch in place.
 */
export const ThreadReadMore = memo(function ThreadReadMore({ row, onExpand }: ThreadReadMoreProps) {
  const label = readMoreLabel(row.moreReplies);
  return (
    <View testID="thread-read-more" style={styles.row}>
      <View testID="thread-read-more-elbow" style={styles.elbow} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => onExpand(row.branchId)}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle-outline" size={ICON_SIZE} color={colors.textLow} />
        <Text size="sm" tone="medium">
          {label}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  // Continues the 2 dp line of the avatar column above (centered under the 42 dp avatar) and
  // turns right towards the label.
  elbow: {
    marginLeft: OUTER_SPACE + (LINEAR_AVATAR - threadLine) / 2,
    width: LINEAR_AVATAR / 2 + 10,
    height: 18,
    borderLeftWidth: threadLine,
    borderBottomWidth: threadLine,
    borderBottomLeftRadius: radii.sm,
    borderColor: colors.borderLow,
  },
  // 48 dp tall, with the icon's middle level with the elbow's bend (8 + 18 / 2 ≈ 18 dp down).
  link: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 48,
    paddingTop: space.sm,
    paddingBottom: 48 - space.sm - ICON_SIZE,
    paddingRight: OUTER_SPACE,
  },
  pressed: { opacity: 0.6 },
});
