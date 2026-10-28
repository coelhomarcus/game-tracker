import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from '@/lib/haptics';
import { colors, space } from '@/theme/tokens';

/** Dragged this far right, releasing replies to the message. */
export const REPLY_SWIPE_THRESHOLD = 56;
/** The bubble follows the finger up to this far. */
export const REPLY_SWIPE_MAX = 72;
/** Horizontal travel before the swipe takes over; vertical travel first lets the list scroll. */
const ACTIVATE_OFFSET = 10;
/** Large enough that a drag to the left never activates (there is no action on that side). */
const NEVER = 10_000;
/**
 * Touches that start this close to the left screen edge are left to the system: that is where the
 * Android back gesture begins, and it moves the same way.
 */
export const BACK_GESTURE_EDGE = 24;
const ICON_SIZE = 22;
const SETTLE_MS = 180;

/** How far the bubble sits for a drag of `translationX`: right only, up to 72. Runs on the UI thread too. */
export function replySwipeOffset(translationX: number): number {
  'worklet';
  return Math.max(0, Math.min(REPLY_SWIPE_MAX, translationX));
}

/** Whether releasing at `translationX` replies: from 56 on. Runs on the UI thread too. */
export function replySwipeArmed(translationX: number): boolean {
  'worklet';
  return replySwipeOffset(translationX) >= REPLY_SWIPE_THRESHOLD;
}

function playArmedHaptic() {
  haptic('tap');
}

export type SwipeToReplyProps = {
  /** Used for the gesture's test id. */
  id: string;
  /** Off for a message that cannot be replied to (not confirmed yet). */
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
};

/**
 * Swipe a message right to reply: it follows the finger up to 72 while a reply arrow fades in
 * behind it, plays one haptic on reaching 56, and releasing from there replies. Releasing earlier
 * does nothing. A vertical move first leaves the touch to the list, and a touch the system takes
 * over (the Android back swipe) is cancelled and does nothing either.
 */
export function SwipeToReply({ id, enabled, onReply, children }: SwipeToReplyProps) {
  const reduceMotion = useReducedMotion();
  const translateX = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = usePanGesture({
    testID: `reply-swipe-${id}`,
    enabled,
    activeOffsetX: [-NEVER, ACTIVATE_OFFSET],
    failOffsetX: -ACTIVATE_OFFSET,
    failOffsetY: [-ACTIVATE_OFFSET, ACTIVATE_OFFSET],
    hitSlop: { left: -BACK_GESTURE_EDGE },
    onUpdate: (event) => {
      'worklet';
      translateX.set(replySwipeOffset(event.translationX));
      const now = replySwipeArmed(event.translationX);
      if (now !== armed.get()) {
        armed.set(now);
        if (now) scheduleOnRN(playArmedHaptic);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      // Cancelled: the list or the system (the Android back swipe) took the touch over.
      if (!event.canceled && replySwipeArmed(event.translationX)) scheduleOnRN(onReply);
      armed.set(false);
      translateX.set(reduceMotion ? 0 : withTiming(0, { duration: SETTLE_MS }));
    },
  });

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.get(), [0, REPLY_SWIPE_THRESHOLD], [0, 1], 'clamp'),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View
          testID="reply-swipe-icon"
          style={[styles.icon, iconStyle]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
        >
          <Ionicons name="arrow-undo" size={ICON_SIZE} color={colors.textMedium} />
        </Animated.View>
        <Animated.View style={contentStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  icon: {
    position: 'absolute',
    left: space.lg,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
