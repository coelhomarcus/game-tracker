import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { statusIcon } from '@/features/library/status';
import { colors, type GameStatus } from '@/theme/tokens';

export type StatusIconProps = {
  status: GameStatus | null;
};

const SIZE = 22;
/** Two-digit hex alpha for 92% opacity, appended to a 6-digit hex token. */
const ALPHA_92 = 'EB';

/** Decorative: the card's accessibility label already carries the status. */
export function StatusIcon({ status }: StatusIconProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.circle}
    >
      {status ? (
        <Ionicons name={statusIcon[status]} size={16} color={colors.status[status]} />
      ) : (
        <Ionicons name="layers-outline" size={16} color={colors.textMedium} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: `${colors.bg}${ALPHA_92}`,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
