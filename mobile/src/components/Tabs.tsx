import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, fontSize, radii, space } from '@/theme/tokens';

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
            <Text style={[styles.label, isSelected ? styles.labelSelected : styles.labelIdle]}>{item.label}</Text>
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
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSelected: { backgroundColor: colors.active },
  tabIdle: { backgroundColor: colors.raised },
  label: { fontSize: fontSize.sm },
  labelSelected: { color: colors.textStrong, fontWeight: 'bold' },
  labelIdle: { color: colors.textMuted },
});
