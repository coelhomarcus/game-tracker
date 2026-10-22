import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type TabsProps<T extends string> = {
  items: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
};

export function Tabs<T extends string>({ items, selected, onSelect }: TabsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {items.map((item) => {
        const isSelected = item.value === selected;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(item.value)}
            style={[styles.tab, isSelected ? styles.tabSelected : styles.tabIdle]}
          >
            <Text size="sm" weight={isSelected ? 'bold' : 'normal'} tone={isSelected ? 'high' : 'medium'}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg },
  tab: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelected: { backgroundColor: colors.selected },
  tabIdle: { backgroundColor: colors.bgContrast50 },
});
