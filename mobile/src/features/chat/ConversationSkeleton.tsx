import { StyleSheet, View, type DimensionValue } from 'react-native';

import { Skeleton } from '@/components';
import { space } from '@/theme/tokens';

const ROWS = 12;
const AVATAR_SIZE = 52;
/** Four name/preview widths, alternating down the list so it does not look stamped. */
const WIDTHS: readonly (readonly [DimensionValue, DimensionValue])[] = [
  ['42%', '86%'],
  ['30%', '64%'],
  ['52%', '78%'],
  ['36%', '58%'],
];

/** The conversation list while it first loads: 12 rows shaped like the real ones. */
export function ConversationSkeleton() {
  return (
    <View accessibilityLabel="Carregando conversas" accessibilityRole="progressbar">
      {Array.from({ length: ROWS }, (_, index) => {
        const [name, preview] = WIDTHS[index % WIDTHS.length];
        return (
          <View key={index} testID="conversation-skeleton-row" style={styles.row}>
            <Skeleton.Circle size={AVATAR_SIZE} />
            <View style={styles.column}>
              <Skeleton.Text width={name} />
              <Skeleton.Text size="sm" width={preview} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  column: { flex: 1, gap: space.xs },
});
