import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/lib/toast';
import { colors, fontSize, radii, space } from '@/theme/tokens';

/** Clears the bottom tab bar. */
const TAB_BAR_CLEARANCE = 72;

/** Mount once near the root, after the navigation tree, so it overlays every screen. */
export function ToastHost() {
  const message = useToast((state) => state.message);
  const insets = useSafeAreaInsets();
  if (message === null) return null;
  return (
    <View
      testID="toast-host"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.host, { bottom: insets.bottom + TAB_BAR_CLEARANCE }]}
    >
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.control,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  text: { color: colors.textStrong, fontSize: fontSize.sm, textAlign: 'center' },
});
