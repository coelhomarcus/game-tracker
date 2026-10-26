import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Keyframe,
  LayoutAnimationConfig,
  useReducedMotion,
  withSequence,
  withTiming,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';

import { colors } from '@/theme/tokens';

const DURATION_MS = 300;

// The heart dips, overshoots and settles.
const heartKeyframe = new Keyframe({
  0: { transform: [{ scale: 1 }] },
  10: { transform: [{ scale: 0.7 }] },
  40: { transform: [{ scale: 1.2 }] },
  100: { transform: [{ scale: 1 }] },
});

/**
 * One step of a keyframe-like sequence: a linear move to `value` over `percent` of the run. The
 * discs use these instead of `Keyframe`, whose builder warns about the `opacity: 0` they keep in
 * their style: that style is what hides them once the animation hands the view back.
 */
function step(value: number, percent: number) {
  'worklet';
  return withTiming(value, { duration: (DURATION_MS * percent) / 100, easing: Easing.linear });
}

// A pink disc grows behind the heart to 1.5× at 0.4 opacity...
const burst: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0 }] },
    animations: {
      opacity: withSequence(step(0.4, 10), step(0.4, 85), step(0, 5)),
      transform: [{ scale: withSequence(step(1.5, 40), step(1.5, 60)) }],
    },
  };
};

// ...and a background-colored disc grows inside it from 40%, hollowing it into a ring.
const hollow: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0 }] },
    animations: {
      opacity: withSequence(step(1, 10), step(1, 85), step(0, 5)),
      transform: [{ scale: withSequence(step(0, 40), step(1.5, 60)) }],
    },
  };
};

export type LikeIconProps = {
  liked: boolean;
  size: number;
  /** Only a like the user just gave animates: not the first render, nor a like from a refetch. */
  hasBeenToggled: boolean;
};

/** The like heart: outline, or filled pink with a burst when the user likes the post. */
export function LikeIcon({ liked, size, hasBeenToggled }: LikeIconProps) {
  const animate = !useReducedMotion() && hasBeenToggled;
  const disc = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View pointerEvents="none">
      <LayoutAnimationConfig skipEntering>
        {liked ? (
          <Animated.View
            testID="like-icon-filled"
            entering={animate ? heartKeyframe.duration(DURATION_MS) : undefined}
          >
            <Ionicons name="heart" size={size} color={colors.like} />
          </Animated.View>
        ) : (
          <Ionicons
            testID="like-icon-outline"
            name="heart-outline"
            size={size}
            color={colors.textMedium}
          />
        )}
        {liked && animate ? (
          <>
            <Animated.View
              testID="like-burst"
              entering={burst}
              style={[styles.disc, disc, { backgroundColor: colors.like }]}
            />
            <Animated.View
              entering={hollow}
              style={[styles.disc, disc, { backgroundColor: colors.bg }]}
            />
          </>
        ) : null}
      </LayoutAnimationConfig>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hidden at rest, so nothing is left once the burst ends.
  disc: { position: 'absolute', top: 0, left: 0, zIndex: -1, opacity: 0 },
});
