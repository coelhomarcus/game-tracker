import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme/tokens';

const OPEN_MS = 250;
const CLOSE_MS = 200;

export type SheetModalProps = {
  visible: boolean;
  /** Android back and a tap on the dimmed area. */
  onRequestClose: () => void;
  /** Lifts the sheet over the keyboard. */
  avoidKeyboard?: boolean;
  backdropTestID?: string;
  testID?: string;
  /** The sheet's content; it styles itself (background, radius, padding). */
  children: ReactNode;
};

/**
 * A modal whose dimmed backdrop fades while only the sheet slides up from the bottom. The
 * platform's own `slide` animation moves the whole window, so the backdrop would rise with the
 * sheet. The `Modal` stays mounted while the sheet leaves.
 */
export function SheetModal({
  visible,
  onRequestClose,
  avoidKeyboard = false,
  backdropTestID,
  testID,
  children,
}: SheetModalProps) {
  const reduceMotion = useReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  // Stays true while the sheet leaves, after `visible` went false.
  const [leaving, setLeaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  // A new opening starts from fresh content, even when it comes while the last one is leaving.
  const [opening, setOpening] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const progress = useSharedValue(0);
  const distance = useSharedValue(windowHeight);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpening((current) => current + 1);
    else if (!reduceMotion) setLeaving(true);
  }

  useEffect(() => {
    distance.set(sheetHeight > 0 ? sheetHeight : windowHeight);
  }, [distance, sheetHeight, windowHeight]);

  useEffect(() => {
    if (visible) {
      progress.set(
        reduceMotion ? 1 : withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }),
      );
    } else if (reduceMotion) {
      progress.set(0);
    } else {
      progress.set(
        withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) scheduleOnRN(setLeaving, false);
        }),
      );
    }
  }, [visible, reduceMotion, progress]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * distance.get() }],
  }));

  const Root = avoidKeyboard ? KeyboardAvoidingView : View;

  return (
    <Modal
      testID={testID}
      transparent
      statusBarTranslucent
      animationType="none"
      visible={visible || leaving}
      onRequestClose={onRequestClose}
    >
      {/* A sheet on its way out takes no touch and is not read by screen readers. */}
      <Root
        {...(avoidKeyboard ? { behavior: 'padding' as const } : {})}
        pointerEvents={visible ? 'auto' : 'none'}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        style={styles.root}
      >
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            testID={backdropTestID}
            accessible={false}
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
          />
        </Animated.View>
        <Animated.View
          key={opening}
          onLayout={(event) => setSheetHeight(Math.round(event.nativeEvent.layout.height))}
          style={sheetStyle}
        >
          {children}
        </Animated.View>
      </Root>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.backdrop },
});
