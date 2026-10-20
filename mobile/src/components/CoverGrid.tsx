import { FlashList } from '@shopify/flash-list';
import { useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

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

export type CoverGridProps<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, width: number) => ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  ListHeaderComponent?: Slot;
  ListEmptyComponent?: Slot;
  minItemWidth?: number;
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
}: CoverGridProps<T>) {
  const [width, setWidth] = useState<number | null>(null);

  function onLayout(event: LayoutChangeEvent) {
    const next = event.nativeEvent.layout.width;
    setWidth((current) => (current === next ? current : next));
  }

  const grid = width === null ? null : gridColumns(width, minItemWidth);

  return (
    <View testID="cover-grid" style={styles.container} onLayout={onLayout}>
      {grid ? (
        // The list is GAP wider than the container and each cell pads GAP / 2 per side, so the
        // gutters sit between columns and the covers line up with the page edges.
        <View testID="cover-grid-list" style={styles.list}>
          <FlashList
            key={grid.columns}
            data={data}
            numColumns={grid.columns}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => (
              <View testID="cover-grid-cell" style={styles.cell}>
                {renderItem(item, grid.itemWidth)}
              </View>
            )}
            keyboardShouldPersistTaps="handled"
            onRefresh={onRefresh}
            refreshing={refreshing}
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
