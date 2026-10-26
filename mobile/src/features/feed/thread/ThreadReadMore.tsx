import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radii, space, threadLine } from '@/theme/tokens';

import type { ThreadMode, ThreadReadMoreRow } from './buildThread';
import { LINEAR_AVATAR } from './ThreadItemLinear';
import { TREE_INDENT, TREE_INDENT_WIDTH, TreeIndents } from './ThreadItemTree';

const OUTER_SPACE = space.lg;
const ICON_SIZE = 18;

/** "Ler mais 1 resposta" / "Ler mais N respostas". */
export function readMoreLabel(count: number): string {
  return `Ler mais ${count} ${count === 1 ? 'resposta' : 'respostas'}`;
}

export type ThreadReadMoreProps = {
  row: ThreadReadMoreRow;
  onExpand: (branchId: string) => void;
  /** The view the row closes a branch of; linear unless said. */
  mode?: ThreadMode;
};

/**
 * Closes a collapsed branch: the branch's line bends into an elbow towards "Ler mais N
 * respostas", which shows the rest of the branch in place. In the tree view the row sits in the
 * indents of the comment whose replies it stands for, and the elbow leaves that comment's avatar.
 */
export const ThreadReadMore = memo(function ThreadReadMore({
  row,
  onExpand,
  mode = 'linear',
}: ThreadReadMoreProps) {
  const label = readMoreLabel(row.moreReplies);
  const tree = mode === 'tree';
  return (
    <View testID="thread-read-more" style={styles.row}>
      {tree ? <TreeIndents rails={row.rails} /> : null}
      <View
        testID="thread-read-more-elbow"
        style={[styles.elbow, tree ? styles.treeElbow : styles.linearElbow]}
      />
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
  elbow: {
    height: 18,
    borderLeftWidth: threadLine,
    borderBottomWidth: threadLine,
    borderBottomLeftRadius: radii.sm,
    borderColor: colors.borderLow,
  },
  // Continues the 2 dp line of the avatar column above (centered under the 42 dp avatar) and
  // turns right towards the label.
  linearElbow: {
    marginLeft: OUTER_SPACE + (LINEAR_AVATAR - threadLine) / 2,
    width: LINEAR_AVATAR / 2 + 10,
  },
  // Continues the line under the 24 dp avatar of the comment above, one indent further in.
  treeElbow: { marginLeft: TREE_INDENT_WIDTH - 1, width: TREE_INDENT },
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
