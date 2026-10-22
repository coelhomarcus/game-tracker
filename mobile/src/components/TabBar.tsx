import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { colors, hairline } from '@/theme/tokens';
import { Text } from './Text';

/** Space between the bar's edges and its first and last tab. */
const CONTENT_PADDING = 6;
const ITEM_PADDING = 10;
/** Minimum touch target; each tab is a real box this tall (hitSlop past the parent is lost on Android). */
const TAB_MIN_HEIGHT = 48;
const INDICATOR_HEIGHT = 2;
const INDICATOR_MIN_WIDTH = 45;
const INDICATOR_DURATION = 200;
const INACTIVE_OPACITY = 0.7;
/** How much of a neighbour must show beside a tab for it to count as in view. */
const OFFSCREEN_ITEM_WIDTH = 20;

type Frame = { x: number; width: number };

/** The underline under a tab: as wide as its label (at least 45), centred, inside the tab. */
export function indicatorFrame(item: Frame, textWidth: number): Frame {
  const max = item.width - 2 * CONTENT_PADDING;
  const width = Math.min(Math.max(INDICATOR_MIN_WIDTH, textWidth), max);
  return { x: item.x + (item.width - width) / 2, width };
}

export type TabBarProps<T extends string> = {
  items: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  /** A tap on the tab that is already selected, for example to scroll its page back to the top. */
  onReselect?: () => void;
};

/**
 * Pager-style tabs after the design reference: text tabs over one underline that slides to the
 * selected tab. The row scrolls sideways when it is wider than the screen.
 */
export function TabBar<T extends string>({ items, selected, onSelect, onReselect }: TabBarProps<T>) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollX = useRef(0);
  const containerWidth = useRef(0);
  const [itemFrames, setItemFrames] = useState<Partial<Record<T, Frame>>>({});
  const [textWidths, setTextWidths] = useState<Partial<Record<T, number>>>({});

  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);
  const placed = useRef(false);

  const selectedFrame = itemFrames[selected];
  const selectedTextWidth = textWidths[selected];
  useEffect(() => {
    if (selectedFrame === undefined || selectedTextWidth === undefined) return;
    const frame = indicatorFrame(selectedFrame, selectedTextWidth);
    if (placed.current) {
      indicatorX.set(withTiming(frame.x, { duration: INDICATOR_DURATION }));
      indicatorWidth.set(withTiming(frame.width, { duration: INDICATOR_DURATION }));
    } else {
      // The first placement jumps: there is no previous tab to slide from.
      placed.current = true;
      indicatorX.set(frame.x);
      indicatorWidth.set(frame.width);
      indicatorOpacity.set(1);
    }
  }, [selectedFrame, selectedTextWidth, indicatorX, indicatorWidth, indicatorOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.get(),
    width: indicatorWidth.get(),
    transform: [{ translateX: indicatorX.get() }],
  }));

  function scrollIntoView(frame: Frame | undefined) {
    if (frame === undefined) return;
    const left = frame.x + CONTENT_PADDING - OFFSCREEN_ITEM_WIDTH;
    const right = frame.x + CONTENT_PADDING + frame.width + OFFSCREEN_ITEM_WIDTH;
    if (left < scrollX.current) {
      scrollRef.current?.scrollTo({ x: Math.max(0, left), animated: true });
    } else if (right > scrollX.current + containerWidth.current) {
      scrollRef.current?.scrollTo({ x: right - containerWidth.current, animated: true });
    }
  }

  function press(value: T) {
    if (value === selected) {
      onReselect?.();
      return;
    }
    scrollIntoView(itemFrames[value]);
    onSelect(value);
  }

  function rememberFrame(value: T, { nativeEvent }: LayoutChangeEvent) {
    const { x, width } = nativeEvent.layout;
    setItemFrames((frames) => {
      const current = frames[value];
      return current?.x === x && current.width === width ? frames : { ...frames, [value]: { x, width } };
    });
  }

  function rememberTextWidth(value: T, { nativeEvent }: LayoutChangeEvent) {
    const { width } = nativeEvent.layout;
    setTextWidths((widths) => (widths[value] === width ? widths : { ...widths, [value]: width }));
  }

  return (
    <View testID="tab-bar" accessibilityRole="tablist" style={styles.bar}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        onLayout={(event) => {
          containerWidth.current = event.nativeEvent.layout.width;
        }}
        onScroll={(event) => {
          scrollX.current = event.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.items}>
          {items.map((item) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => press(item.value)}
                onLayout={(event) => rememberFrame(item.value, event)}
                style={styles.tab}
              >
                <View
                  testID={`tab-label-${item.value}`}
                  style={[styles.label, { opacity: isSelected ? 1 : INACTIVE_OPACITY }]}
                >
                  <Text
                    size="md"
                    weight="semibold"
                    leading="snug"
                    tone="high"
                    numberOfLines={1}
                    onLayout={(event) => rememberTextWidth(item.value, event)}
                  >
                    {item.label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          <Animated.View
            testID="tab-bar-indicator"
            pointerEvents="none"
            style={[styles.indicator, indicatorStyle]}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.borderLow,
  },
  content: { flexGrow: 1, paddingHorizontal: CONTENT_PADDING },
  // Tabs share the width when they fit; past the screen width they keep their own size and scroll.
  items: { flexDirection: 'row', flexGrow: 1 },
  tab: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: TAB_MIN_HEIGHT,
    paddingHorizontal: ITEM_PADDING,
    paddingTop: ITEM_PADDING,
    paddingBottom: ITEM_PADDING,
    justifyContent: 'center',
  },
  label: { alignItems: 'center' },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: INDICATOR_HEIGHT,
    backgroundColor: colors.primary,
  },
});
