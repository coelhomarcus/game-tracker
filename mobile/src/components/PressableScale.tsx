import type { ComponentProps } from 'react';
import { Pressable, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressableScaleProps = Omit<ComponentProps<typeof Pressable>, 'style'> & {
  /** Scale reached while pressed. */
  targetScale?: number;
  /**
   * Plain style only: unlike Pressable, a function style (pressed state) is not supported. The
   * animated scale transform replaces any `transform` the caller passes.
   */
  style?: StyleProp<ViewStyle>;
};

const DURATION_MS = 100;

export function PressableScale({ targetScale = 0.95, style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  function animateTo(value: number) {
    if (reduceMotion) return;
    scale.set(withTiming(value, { duration: DURATION_MS }));
  }

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event: GestureResponderEvent) => {
        animateTo(targetScale);
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        animateTo(1);
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    />
  );
}
