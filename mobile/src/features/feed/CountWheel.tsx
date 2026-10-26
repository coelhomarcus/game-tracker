import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  LayoutAnimationConfig,
  useReducedMotion,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

const SHIFT = 18;
const timing = { duration: 400, easing: Easing.out(Easing.cubic) };

/** The number slides in from `from` (dp below when positive) while it fades in. */
function slideIn(from: number): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0, transform: [{ translateY: from }] },
      animations: {
        opacity: withTiming(1, timing),
        transform: [{ translateY: withTiming(0, timing) }],
      },
    };
  };
}

/** The number slides out towards `to` while it fades out. */
function slideOut(to: number): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ translateY: withTiming(to, timing) }],
      },
    };
  };
}

// On a like the new number comes up from below and the old one leaves upwards; on an unlike the
// other way round.
const enterUp = slideIn(SHIFT);
const enterDown = slideIn(-SHIFT);
const exitUp = slideOut(-SHIFT);
const exitDown = slideOut(SHIFT);

/**
 * Whether the change is visible as a roll: from 1 to 0, anything up to 999, and the steps that
 * change a compact count ("1,2 mil" only changes at multiples of 100).
 */
export function shouldRoll(toggled: boolean, count: number): boolean {
  if (!toggled && count === 0) return true;
  if (count > 0 && count < 1000) return true;
  if (count >= 1000) return toggled ? count % 100 === 0 : count % 100 === 99;
  return false;
}

export type CountWheelProps = {
  count: number;
  toggled: boolean;
  /** Only a toggle the user just made rolls the number. */
  hasBeenToggled: boolean;
  renderCount: (count: number) => ReactNode;
};

/**
 * A counter that rolls to its new value when the user toggles it: the new number slides in while
 * the old one slides out the other way. Hidden at 0.
 */
export function CountWheel({ count, toggled, hasBeenToggled, renderCount }: CountWheelProps) {
  const reduceMotion = useReducedMotion();
  // A new key remounts the number, which plays the entering animation picked for this change.
  const [roll, setRoll] = useState({ key: 0, toggled, previous: count });
  if (roll.toggled !== toggled) {
    setRoll({ key: roll.key + 1, toggled, previous: toggled ? count - 1 : count + 1 });
  }

  const animate = !reduceMotion && hasBeenToggled && shouldRoll(toggled, count);
  const showPrevious = animate && roll.previous > 0;
  if (count === 0 && !showPrevious) return null;

  return (
    <LayoutAnimationConfig skipEntering skipExiting>
      <View style={styles.wheel}>
        {count > 0 ? (
          <Animated.View key={roll.key} entering={animate ? (toggled ? enterUp : enterDown) : undefined}>
            {renderCount(count)}
          </Animated.View>
        ) : null}
        {showPrevious ? (
          <Animated.View
            testID="count-wheel-previous"
            // Never the same key as the current number.
            key={roll.key + 2}
            entering={toggled ? exitUp : exitDown}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.previous}
          >
            {renderCount(roll.previous)}
          </Animated.View>
        ) : null}
      </View>
    </LayoutAnimationConfig>
  );
}

const styles = StyleSheet.create({
  wheel: { justifyContent: 'center' },
  previous: { position: 'absolute', left: 0, opacity: 0 },
});
