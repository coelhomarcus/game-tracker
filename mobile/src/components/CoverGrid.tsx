import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import {
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefAttributes,
} from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { type ScrollHandlerProcessed } from 'react-native-reanimated';

const GAP = 8;
const DEFAULT_MIN_ITEM_WIDTH = 76;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 8;

/** Column count and item width for a container `width` wide. */
export function gridColumns(
  width: number,
  minItemWidth: number = DEFAULT_MIN_ITEM_WIDTH,
): { columns: number; itemWidth: number } {
  const fit = Math.floor((width + GAP) / (minItemWidth + GAP));
  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, fit));
  return { columns, itemWidth: (width - GAP * (columns - 1)) / columns };
}

type Slot = ReactElement | ComponentType | null;

// FlashList hands Reanimated its scroll view (`getScrollableNode`), so a worklet scroll handler
// runs on the UI thread as with `Animated.FlatList`. The cast restores the generic props.
const AnimatedFlashList = Animated.createAnimatedComponent(FlashList) as unknown as <T>(
  props: FlashListProps<T> & RefAttributes<FlashListRef<T>> & {
    onScroll?: ScrollHandlerProcessed<Record<string, unknown>>;
  },
) => ReactElement;

export type CoverGridProps<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, width: number) => ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  ListHeaderComponent?: Slot;
  ListEmptyComponent?: Slot;
  minItemWidth?: number;
  /**
   * Horizontal padding of the scrolling content, header and empty slots included. A header that
   * must reach the screen edges pulls itself out with a negative margin of the same size.
   */
  inset?: number;
  /** Handle to the underlying list, e.g. to scroll it to the top. */
  listRef?: Ref<FlashListRef<T>>;
  /** A Reanimated scroll handler (`useAnimatedScrollHandler`), e.g. for a header over the grid. */
  onScroll?: ScrollHandlerProcessed<Record<string, unknown>>;
  /** Room above the content for a header floating over the grid; the refresh spinner starts below it. */
  topInset?: number;
  /** Room below the content, e.g. to keep the last row clear of a floating button. */
  bottomInset?: number;
  /** The content is at least this tall (a pager's lists, so their shared header can collapse). */
  minContentHeight?: number;
  /** Where the grid starts when it mounts. */
  initialOffset?: number;
};

export function CoverGrid<T>({
  data,
  keyExtractor,
  renderItem,
  onRefresh,
  refreshing,
  ListHeaderComponent,
  ListEmptyComponent,
  minItemWidth,
  inset = 0,
  listRef,
  onScroll,
  topInset = 0,
  bottomInset,
  minContentHeight,
  initialOffset,
}: CoverGridProps<T>) {
  const [width, setWidth] = useState<number | null>(null);

  function onLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  }

  const grid = width === null ? null : gridColumns(width - inset * 2, minItemWidth);
  const contentStyle = {
    ...(inset > 0 && { paddingHorizontal: inset }),
    ...(topInset > 0 && { paddingTop: topInset }),
    ...(bottomInset !== undefined && { paddingBottom: bottomInset }),
    ...(minContentHeight !== undefined && { minHeight: minContentHeight }),
  };
  // Only a grid under a scroll-driven header needs the animated list.
  const List = onScroll ? AnimatedFlashList : FlashList;

  return (
    <View testID="cover-grid" style={styles.container} onLayout={onLayout}>
      {grid ? (
        // The list is GAP wider than the container and each cell pads GAP / 2 per side, so the
        // gutters sit between columns and the covers line up with the page edges.
        <View testID="cover-grid-list" style={styles.list}>
          <List<T>
            ref={listRef}
            key={grid.columns}
            data={data}
            numColumns={grid.columns}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => (
              <View testID="cover-grid-cell" style={styles.cell}>
                {renderItem(item, grid.itemWidth)}
              </View>
            )}
            contentContainerStyle={Object.keys(contentStyle).length > 0 ? contentStyle : undefined}
            contentOffset={initialOffset ? { x: 0, y: initialOffset } : undefined}
            keyboardShouldPersistTaps="handled"
            onRefresh={onRefresh}
            refreshing={refreshing}
            progressViewOffset={topInset > 0 ? topInset : undefined}
            {...(onScroll ? { onScroll, scrollEventThrottle: 16 } : null)}
            ListHeaderComponent={ListHeaderComponent}
            ListHeaderComponentStyle={styles.slot}
            ListEmptyComponent={ListEmptyComponent}
            ListEmptyComponentStyle={styles.slot}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1, marginHorizontal: -GAP / 2 },
  // The header and empty slots live inside the widened list; undo the overhang.
  slot: { marginHorizontal: GAP / 2 },
  cell: { paddingHorizontal: GAP / 2, paddingBottom: GAP },
});
