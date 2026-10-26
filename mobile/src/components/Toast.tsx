import { StyleSheet, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/lib/toast';
import { colors, hairline, radii, space } from '@/theme/tokens';
import { Text } from './Text';

/** Clears the bottom tab bar. */
const TAB_BAR_CLEARANCE = 72;

/** Space left between the toast and the top of the keyboard. */
const KEYBOARD_GAP = space.lg;

/** Mount once near the root, after the navigation tree, so it overlays every screen. */
export function ToastHost() {
  const message = useToast((state) => state.message);
  const insets = useSafeAreaInsets();
  // The window does not resize for the keyboard (edge-to-edge), so the toast would sit under it.
  // `height` is negative while the keyboard is open; the offset swaps the tab bar clearance for
  // a small gap, since the keyboard covers the tab bar.
  const { height, progress } = useReanimatedKeyboardAnimation();
  const lift = insets.bottom + TAB_BAR_CLEARANCE - KEYBOARD_GAP;
  const keyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: height.value + progress.value * lift }],
  }));
  if (message === null) return null;
  return (
    <Animated.View
      testID="toast-host"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={[styles.host, { bottom: insets.bottom + TAB_BAR_CLEARANCE }, keyboardStyle]}
    >
      <View style={styles.toast}>
        <Text size="sm" tone="high" style={styles.text}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    backgroundColor: colors.bgContrast50,
    borderWidth: hairline,
    borderColor: colors.borderMedium,
    borderRadius: radii.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  text: { textAlign: 'center' },
});
