import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { haptic } from '@/lib/haptics';
import { colors, primary, space } from '@/theme/tokens';
import { PressableScale } from './PressableScale';

/** Diameter of the floating compose button. */
export const FAB_SIZE = 56;
/** Distance of the button from the bottom of its (relatively positioned) parent. */
export const FAB_BOTTOM = 15;

export type FabProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
};

/** The floating compose button, pinned to the bottom-right of its parent. */
export function Fab({ icon = 'create', accessibilityLabel, onPress }: FabProps) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      targetScale={0.9}
      onPressIn={() => haptic('tap')}
      onPress={onPress}
      style={styles.fab}
    >
      <Ionicons name={icon} size={24} color={colors.onPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: space._2xl,
    bottom: FAB_BOTTOM,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
