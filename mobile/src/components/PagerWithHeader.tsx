import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type Ref,
} from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type ScrollHandlerProcessed,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from '@/theme/tokens';
import { TabBar } from './TabBar';

/** How far the focused list scrolls before the compact header fades in. */
export const COMPACT_HEADER_AFTER = 100;
const COMPACT_HEADER_FADE_MS = 75;
/** A tab press cuts to the page and fades it in from this opacity over `PAGE_FADE_MS`. */
const PAGE_FADE_FROM = 0.35;
const PAGE_FADE_MS = 160;
/** Until they are measured: a profile header and the 48 dp tab bar. */
const HEADER_ESTIMATE = 320;
const TAB_BAR_ESTIMATE = 48;
/** `Layout.Header`'s bar under the status bar, the compact header's height until measured. */
const COMPACT_BAR_ESTIMATE = 48;

/**
 * How far the header (the part above the tab bar) moves up for the focused list's scroll
 * offset: with the list, until only `compactHeight` of it is left and the tab bar sticks below.
 */
export function headerTranslate(scrollY: number, headerHeight: number, compactHeight: number): number {
  'worklet';
  const collapse = Math.max(headerHeight - compactHeight, 0);
  const moved = Math.min(Math.max(scrollY, 0), collapse);
  return moved === 0 ? 0 : -moved;
}

/**
 * The offset a list that is not focused takes before it shows, so the shared header stays where
 * it is. With the header collapsed every list keeps its own position, but no list is above the
 * collapsed offset (its first rows would hide under the header); with the header partly open,
 * the lists follow the focused one, which is the header's position.
 */
export function syncedOffset(
  focusedScroll: number,
  ownOffset: number,
  headerHeight: number,
  compactHeight: number,
): number {
  'worklet';
  const collapse = Math.max(headerHeight - compactHeight, 0);
  const current = Math.max(focusedScroll, 0);
  return current >= collapse ? Math.max(ownOffset, collapse) : current;
}

/** Whether the compact header shows for the focused list's scroll offset. */
export function compactHeaderShown(scrollY: number): boolean {
  'worklet';
  return scrollY > COMPACT_HEADER_AFTER;
}

export type PagerList = { scrollToOffset(params: { offset: number; animated?: boolean }): void };

/** What each page passes to its list (an `Animated` list, so the scroll handler runs natively). */
export type PagerScrollProps = {
  /** Callback ref for the list: the pager scrolls it to keep the header in place. */
  attachList: (list: PagerList | null) => void;
  onScroll: ScrollHandlerProcessed<Record<string, unknown>>;
  /** Space above the content (header and tab bar) and the pull-to-refresh spinner's offset. */
  topInset: number;
  /** The content is at least this tall, so the header can always collapse. */
  minContentHeight: number;
  /** Where the list starts when it mounts (`contentOffset.y`). */
  initialOffset: number;
  isFocused: boolean;
};

export type PagerTab = {
  key: string;
  label: string;
  render: (scroll: PagerScrollProps) => ReactElement;
};

/** Scrolls the focused page's list, for example back to the top on a tab press. */
export type PagerWithHeaderHandle = PagerList;

export type PagerWithHeaderProps = {
  header: ReactElement;
  tabs: PagerTab[];
  initialTab?: string;
  /** Drawn over the top once the focused list scrolls past 100; the header collapses to its height. */
  compactHeader?: ReactElement;
  /** The status bar strip, kept solid (`colors.bg`) once the content scrolls under it. */
  statusBarHeight?: number;
  /** Told when the compact header shows or hides, e.g. to hide what it covers from screen readers. */
  onCompactHeaderChange?: (shown: boolean) => void;
  ref?: Ref<PagerWithHeaderHandle>;
};

type PageEntry = { offset: SharedValue<number>; list: PagerList | null };

type PageProps = {
  tab: PagerTab;
  index: number;
  width: number;
  focused: boolean;
  focusedIndex: SharedValue<number>;
  scrollY: SharedValue<number>;
  topInset: number;
  minContentHeight: number;
  initialOffset: number;
  register: (key: string, entry: PageEntry | null) => void;
};

/**
 * Memoized: the pager re-renders on a tab change and when its header is measured, and a page
 * (a whole list) must only re-render when its own props change.
 */
const PagerPage = memo(function PagerPage({
  tab,
  index,
  width,
  focused,
  focusedIndex,
  scrollY,
  topInset,
  minContentHeight,
  initialOffset,
  register,
}: PageProps) {
  // The first offset is the one the page mounted at; later ones come from its own scrolling.
  const [startOffset] = useState(initialOffset);
  const offset = useSharedValue(startOffset);
  const entry = useRef<PageEntry>({ offset, list: null });

  useEffect(() => {
    const current = entry.current;
    register(tab.key, current);
    return () => register(tab.key, null);
  }, [register, tab.key]);

  const attachList = useCallback((list: PagerList | null) => {
    entry.current.list = list;
  }, []);

  // The worklets plugin tracks what the handler captures; no dependency list on native.
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      offset.set(event.contentOffset.y);
      if (focusedIndex.get() === index) scrollY.set(event.contentOffset.y);
    },
  });

  const scroll = useMemo<PagerScrollProps>(
    () => ({
      attachList,
      onScroll,
      topInset,
      minContentHeight,
      initialOffset: startOffset,
      isFocused: focused,
    }),
    [attachList, onScroll, topInset, minContentHeight, startOffset, focused],
  );

  return (
    <View
      testID={`pager-page-${tab.key}`}
      style={{ width }}
      // Only the page on screen is read; the others are off to the side.
      accessibilityElementsHidden={!focused}
      importantForAccessibility={focused ? 'auto' : 'no-hide-descendants'}
    >
      <PageContent render={tab.render} scroll={scroll} />
    </View>
  );
});

type CompactHeaderProps = {
  scrollY: SharedValue<number>;
  onLayout: (event: LayoutChangeEvent) => void;
  onShownChange?: (shown: boolean) => void;
  children: ReactElement;
};

/**
 * The compact header's fade and touch/screen-reader state. Its own component, so crossing the
 * threshold re-renders only this bar, never the pages.
 */
function CompactHeader({ scrollY, onLayout, onShownChange, children }: CompactHeaderProps) {
  const [shown, setShown] = useState(false);
  const opacity = useSharedValue(0);

  const changed = useCallback(
    (next: boolean) => {
      setShown(next);
      onShownChange?.(next);
    },
    [onShownChange],
  );

  useAnimatedReaction(
    () => compactHeaderShown(scrollY.get()),
    (next, previous) => {
      if (next === previous || (previous === null && !next)) return;
      opacity.set(withTiming(next ? 1 : 0, { duration: COMPACT_HEADER_FADE_MS }));
      scheduleOnRN(changed, next);
    },
  );
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      testID="pager-compact-header"
      onLayout={onLayout}
      pointerEvents={shown ? 'auto' : 'none'}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
      style={[styles.compact, style]}
    >
      {children}
    </Animated.View>
  );
}

function PageContent({ render, scroll }: { render: PagerTab['render']; scroll: PagerScrollProps }) {
  return render(scroll);
}

/**
 * Pages of lists side by side under one header, after the design reference's pager: the header
 * and the `TabBar` float over the lists, move up with the focused list until only the compact
 * header is left (the tab bar then sticks below it), and switching pages keeps the header where
 * it is. A page mounts the first time it is shown (or swiped towards) and then stays mounted, so
 * each list keeps its own scroll position.
 */
export function PagerWithHeader({
  header,
  tabs,
  initialTab,
  compactHeader,
  statusBarHeight = 0,
  onCompactHeaderChange,
  ref,
}: PagerWithHeaderProps) {
  const window = useWindowDimensions();
  const initialIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === initialTab),
  );
  const [selected, setSelected] = useState(initialIndex);
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [headerHeight, setHeaderHeight] = useState(HEADER_ESTIMATE);
  const [tabBarHeight, setTabBarHeight] = useState(TAB_BAR_ESTIMATE);
  const [compactHeight, setCompactHeight] = useState(
    compactHeader ? statusBarHeight + COMPACT_BAR_ESTIMATE : 0,
  );
  // Until the header is measured the lists' top inset is a guess: the pages stay invisible, so
  // rows never show under the header for a frame and then jump.
  const [headerMeasured, setHeaderMeasured] = useState(false);
  // Keys of the pages that mounted, with the offset each one starts at.
  const [mounted, setMounted] = useState<Record<string, number>>(() => ({
    [tabs[initialIndex]!.key]: 0,
  }));

  const pagerRef = useRef<ScrollViewInstance>(null);
  const pages = useRef(new Map<string, PageEntry>());
  const scrollY = useSharedValue(0);
  const focusedIndex = useSharedValue(initialIndex);
  const headerShared = useSharedValue(HEADER_ESTIMATE);
  const compactShared = useSharedValue(compactHeight);
  const pageOpacity = useSharedValue(1);
  const pageStyle = useAnimatedStyle(() => ({ opacity: pageOpacity.get() }));

  useEffect(() => {
    headerShared.set(headerHeight);
    compactShared.set(compactHeight);
  }, [headerShared, compactShared, headerHeight, compactHeight]);

  const register = useCallback((key: string, entry: PageEntry | null) => {
    if (entry) pages.current.set(key, entry);
    else pages.current.delete(key);
  }, []);

  const focusedList = useCallback(
    () => pages.current.get(tabs[selected]?.key ?? '')?.list ?? null,
    [selected, tabs],
  );
  useImperativeHandle(
    ref,
    () => ({
      scrollToOffset: (params) => focusedList()?.scrollToOffset(params),
    }),
    [focusedList],
  );

  /** Puts every page but the focused one where the header says it must be. */
  const syncOtherPages = useCallback(() => {
    const current = scrollY.get();
    const focusedKey = tabs[selected]?.key;
    for (const [key, entry] of pages.current) {
      if (key === focusedKey) continue;
      const own = entry.offset.get();
      const target = syncedOffset(current, own, headerHeight, compactHeight);
      if (target === own) continue;
      entry.offset.set(target);
      entry.list?.scrollToOffset({ offset: target, animated: false });
    }
  }, [compactHeight, headerHeight, scrollY, selected, tabs]);

  /** Mounts the pages at `indexes` that have not mounted yet, each at the synced offset. */
  const mountPages = useCallback(
    (indexes: number[]) => {
      const start = syncedOffset(scrollY.get(), 0, headerHeight, compactHeight);
      setMounted((current) => {
        let next = current;
        for (const index of indexes) {
          const key = tabs[index]?.key;
          if (key === undefined || key in next) continue;
          next = { ...next, [key]: start };
        }
        return next;
      });
    },
    [compactHeight, headerHeight, scrollY, tabs],
  );

  const focus = useCallback(
    (index: number) => {
      const key = tabs[index]?.key;
      if (key === undefined || index === selected) return;
      const offset =
        pages.current.get(key)?.offset.get() ??
        syncedOffset(scrollY.get(), 0, headerHeight, compactHeight);
      focusedIndex.set(index);
      scrollY.set(offset);
      setSelected(index);
    },
    [compactHeight, focusedIndex, headerHeight, scrollY, selected, tabs],
  );

  const selectTab = useCallback(
    (key: string) => {
      const index = tabs.findIndex((tab) => tab.key === key);
      if (index < 0) return;
      syncOtherPages();
      mountPages([index]);
      focus(index);
      // Sliding across the pages in between shows their lists passing by; jump and fade in.
      pageOpacity.set(PAGE_FADE_FROM);
      pagerRef.current?.scrollTo({ x: index * size.width, animated: false });
      pageOpacity.set(withTiming(1, { duration: PAGE_FADE_MS }));
    },
    [focus, mountPages, pageOpacity, size.width, syncOtherPages, tabs],
  );

  const scrollFocusedToTop = useCallback(() => {
    focusedList()?.scrollToOffset({ offset: 0, animated: true });
  }, [focusedList]);

  // A swipe shows the neighbours: they must be mounted and in place before they come into view.
  const onBeginDrag = useCallback(() => {
    syncOtherPages();
    mountPages([selected - 1, selected + 1]);
  }, [mountPages, selected, syncOtherPages]);

  const onPageSettled = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (size.width <= 0) return;
      focus(Math.round(event.nativeEvent.contentOffset.x / size.width));
    },
    [focus, size.width],
  );

  const onPagerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
      if (width !== size.width) {
        pagerRef.current?.scrollTo({ x: selected * width, animated: false });
      }
    },
    [selected, size.width],
  );

  const measure = (set: (height: number) => void) => (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (height > 0) set(height);
  };
  const measureHeader = (event: LayoutChangeEvent) => {
    measure(setHeaderHeight)(event);
    // Any layout event counts, even at height 0: the pager must not stay hidden for a header
    // that really is empty. Only a positive height replaces the estimate.
    setHeaderMeasured(true);
  };

  const translateY = useDerivedValue(() =>
    headerTranslate(scrollY.get(), headerShared.get(), compactShared.get()),
  );
  const headerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.get() }],
  }));

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: statusBarHeight > 0 ? Math.min(Math.max(scrollY.get() / statusBarHeight, 0), 1) : 0,
  }));

  const topInset = headerHeight + tabBarHeight;
  const minContentHeight = size.height + Math.max(headerHeight - compactHeight, 0);
  const items = tabs.map((tab) => ({ value: tab.key, label: tab.label }));

  return (
    <View testID="pager-root" style={styles.container} onLayout={onPagerLayout}>
      <Animated.ScrollView
        ref={pagerRef}
        testID="pager"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: initialIndex * size.width, y: 0 }}
        onScrollBeginDrag={onBeginDrag}
        onMomentumScrollEnd={onPageSettled}
        style={[styles.pager, headerMeasured ? pageStyle : styles.hidden]}
      >
        {tabs.map((tab, index) =>
          tab.key in mounted ? (
            <PagerPage
              key={tab.key}
              tab={tab}
              index={index}
              width={size.width}
              focused={index === selected}
              focusedIndex={focusedIndex}
              scrollY={scrollY}
              topInset={topInset}
              minContentHeight={minContentHeight}
              initialOffset={mounted[tab.key]!}
              register={register}
            />
          ) : (
            <View key={tab.key} style={{ width: size.width }} />
          ),
        )}
      </Animated.ScrollView>
      {/* Touches on the header's empty parts reach the list below, so dragging there scrolls it. */}
      <Animated.View
        testID="pager-header"
        pointerEvents="box-none"
        style={[styles.header, headerStyle]}
      >
        <View testID="pager-header-content" pointerEvents="box-none" onLayout={measureHeader}>
          {header}
        </View>
        <View testID="pager-tab-bar" onLayout={measure(setTabBarHeight)}>
          <TabBar
            items={items}
            selected={tabs[selected]?.key ?? ''}
            onSelect={selectTab}
            onReselect={scrollFocusedToTop}
          />
        </View>
      </Animated.View>
      {compactHeader ? (
        <CompactHeader
          scrollY={scrollY}
          onLayout={measure(setCompactHeight)}
          onShownChange={onCompactHeaderChange}
        >
          {compactHeader}
        </CompactHeader>
      ) : null}
      {statusBarHeight > 0 ? (
        <Animated.View
          testID="pager-status-bar"
          pointerEvents="none"
          style={[styles.statusBar, { height: statusBarHeight }, scrimStyle]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  pager: { flex: 1 },
  hidden: { opacity: 0 },
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  compact: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2 },
  // Over the compact header too; the header slides out beneath it.
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 3,
    backgroundColor: colors.bg,
  },
});
