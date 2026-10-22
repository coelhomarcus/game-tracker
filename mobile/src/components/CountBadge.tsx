import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { primary, radii } from '@/theme/tokens';
import { Text } from './Text';

export type CountBadgeProps = {
  count: number;
  /** Counts above this show as `${max}+`. */
  max?: number;
  /** Overrides the default position (e.g. to sit on an icon's corner). */
  style?: StyleProp<ViewStyle>;
};

/**
 * A count pinned to the top of its (relatively positioned) parent, beside the centred icon.
 * Decorative: the parent's accessibility label carries the number. Renders nothing for 0.
 */
export function CountBadge({ count, max = 99, style }: CountBadgeProps) {
  if (!(count > 0)) return null;
  return (
    <View testID="count-badge" pointerEvents="none" style={[styles.badge, style]}>
      <Text weight="semibold" tone="onPrimary" style={styles.text}>
        {count > max ? `${max}+` : String(count)}
      </Text>
    </View>
  );
}

/** A small marker for "something new" with no number. */
export function NewDot() {
  return <View testID="new-dot" pointerEvents="none" style={styles.dot} />;
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: '52%',
    top: 8,
    paddingHorizontal: 5,
    paddingTop: 1,
    paddingBottom: 2,
    borderRadius: radii.full,
    backgroundColor: primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 12, lineHeight: 15, fontVariant: ['tabular-nums'] },
  dot: { width: 8, height: 8, borderRadius: radii.full, backgroundColor: primary[500] },
});
