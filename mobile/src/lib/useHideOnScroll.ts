import { useCallback, useEffect } from 'react';
import {
  Reanimated3DefaultSpringConfig,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  type WithSpringConfig,
} from 'react-native-reanimated';

/**
 * Hide-on-scroll for a header floating over a list, after the design reference's main scroll
 * provider. `progress` runs from 0 (shown) to 1 (hidden): while the finger drags it follows the
 * finger, one header height for a full hide; once the list stops it snaps to hidden or shown.
 */

/** The spring the header settles with; no overshoot, so it never bounces past shown or hidden. */
const SNAP_SPRING: WithSpringConfig = { ...Reanimated3DefaultSpringConfig, overshootClamping: true };

function clampProgress(value: number): number {
  'worklet';
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Progress while dragging: where the header was when the drag began plus the distance scrolled
 * since, in header heights (positive = content moving up, the header hiding).
 */
export function dragProgress(
  startProgress: number,
  startOffset: number,
  offset: number,
  headerHeight: number,
): number {
  'worklet';
  if (headerHeight <= 0) return 0;
  return clampProgress(startProgress + (offset - startOffset) / headerHeight);
}

/**
 * Where the header settles when the list stops: shown near the top, hidden after scrolling down,
 * shown after scrolling up, otherwise the closest state.
 */
export function snapProgress(
  startOffset: number,
  offset: number,
  headerHeight: number,
  progress: number,
): 0 | 1 {
  'worklet';
  if (offset < headerHeight) return 0;
  if (offset > startOffset) return 1;
  if (offset < startOffset) return 0;
  return progress >= 0.5 ? 1 : 0;
}

/** Progress for a scroll the finger does not drive (momentum, programmatic): shown near the top. */
export function idleProgress(offset: number, headerHeight: number, progress: number): number {
  'worklet';
  return offset < headerHeight ? 0 : progress;
}

/**
 * `scrollHandler` goes to the list's `onScroll` (an `Animated` list), `headerStyle` to the
 * header's `Animated.View`; `reveal` brings the header back (for example before scrolling to the
 * top). With reduce motion on, the header never hides.
 */
export function useHideOnScroll(headerHeight: number) {
  const reduceMotion = useReducedMotion();
  const enabled = !reduceMotion;
  const height = useSharedValue(headerHeight);
  const progress = useSharedValue(0);
  /** The progress the header is springing to, or -1 while the finger drives it. */
  const target = useSharedValue(0);
  const dragStartOffset = useSharedValue<number | null>(null);
  const dragStartProgress = useSharedValue(0);

  useEffect(() => {
    height.set(headerHeight);
  }, [height, headerHeight]);

  const settle = useCallback(
    (next: number) => {
      'worklet';
      if (target.get() === next) return;
      target.set(next);
      progress.set(withSpring(next, SNAP_SPRING));
    },
    [progress, target],
  );

  const snap = useCallback(
    (offsetY: number) => {
      'worklet';
      const start = dragStartOffset.get();
      if (start === null) return;
      dragStartOffset.set(null);
      settle(snapProgress(start, Math.max(0, offsetY), height.get(), progress.get()));
    },
    [dragStartOffset, height, progress, settle],
  );

  // The worklets plugin tracks what the handlers capture; no dependency list on native.
  const scrollHandler = useAnimatedScrollHandler({
    onBeginDrag: (event) => {
      if (!enabled) return;
      dragStartOffset.set(Math.max(0, event.contentOffset.y));
      dragStartProgress.set(progress.get());
    },
    onScroll: (event) => {
      if (!enabled) return;
      const offset = Math.max(0, event.contentOffset.y);
      const start = dragStartOffset.get();
      if (start === null) {
        const settled = target.get();
        settle(idleProgress(offset, height.get(), settled === -1 ? progress.get() : settled));
        return;
      }
      target.set(-1);
      progress.set(dragProgress(dragStartProgress.get(), start, offset, height.get()));
    },
    onEndDrag: (event) => {
      if (!enabled) return;
      // A fling keeps scrolling: wait for the momentum to end.
      if (event.velocity && event.velocity.y !== 0) return;
      snap(event.contentOffset.y);
    },
    onMomentumEnd: (event) => {
      if (!enabled) return;
      snap(event.contentOffset.y);
    },
  });

  const headerStyle = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: (1 - value) ** 2,
      transform: [{ translateY: -height.get() * value }],
      // A header on its way out must not catch taps meant for the list below it.
      pointerEvents: value === 0 ? 'auto' : 'none',
    };
  });

  const reveal = useCallback(() => {
    dragStartOffset.set(null);
    target.set(0);
    progress.set(withSpring(0, SNAP_SPRING));
  }, [dragStartOffset, progress, target]);

  return { scrollHandler, headerStyle, reveal };
}
