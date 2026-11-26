import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IoniconName } from '@/features/library/status';
import { colors, hairline, radii, space } from '@/theme/tokens';
import { SheetModal } from './SheetModal';
import { Text } from './Text';

export type OptionSheetOption<T> = {
  value: T;
  label: string;
  description?: string;
  icon?: IoniconName;
  /** Removes or throws something away: the label and icon are red. */
  destructive?: boolean;
  /** Dimmed and not pressable, e.g. an action with nothing to act on right now. */
  disabled?: boolean;
};

/** A titled group of options with its own selected one, for a sheet that sets several things. */
export type OptionSheetSection<T> = {
  title: string;
  options: OptionSheetOption<T>[];
  selected?: T;
};

export type OptionSheetProps<T> = {
  visible: boolean;
  title: string;
  /** Options without a heading, shown before any `sections`. */
  options?: OptionSheetOption<T>[];
  selected?: T;
  sections?: OptionSheetSection<T>[];
  scrollable?: boolean;
  onSelect: (value: T) => void;
  onClose: () => void;
};


export function OptionSheet<T>({
  visible,
  title,
  options = [],
  selected,
  sections = [],
  scrollable = false,
  onSelect,
  onClose,
}: OptionSheetProps<T>) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const renderOption = (option: OptionSheetOption<T>, current: T | undefined) => {
    const isSelected = option.value === current;
    return (
      <Pressable
        key={`${typeof option.value}:${String(option.value)}`}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityHint={option.description}
        accessibilityState={{ selected: isSelected, disabled: option.disabled === true }}
        disabled={option.disabled}
        onPress={() => {
          onSelect(option.value);
          onClose();
        }}
        style={[styles.row, option.disabled && styles.disabled]}
      >
        {option.icon ? (
          <Ionicons
            name={option.icon}
            size={22}
            color={option.destructive ? colors.danger : colors.text}
          />
        ) : null}
        <View style={styles.label}>
          <Text
            weight={isSelected ? 'bold' : 'normal'}
            tone={option.destructive ? 'danger' : isSelected ? 'high' : 'default'}
          >
            {option.label}
          </Text>
          {option.description ? (
            <Text size="sm" tone="medium">{option.description}</Text>
          ) : null}
        </View>
        {isSelected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
      </Pressable>
    );
  };

  const choices = (
    <>
      {options.map((option) => renderOption(option, selected))}
      {sections.map((section, index) => (
        <View
          key={section.title}
          testID="sheet-section"
          style={(index > 0 || options.length > 0) && styles.sectionDivider}
        >
          <Text accessibilityRole="header" size="sm" weight="semibold" tone="medium" style={styles.sectionTitle}>
            {section.title}
          </Text>
          {section.options.map((option) => renderOption(option, section.selected))}
        </View>
      ))}
    </>
  );

  return (
    <SheetModal visible={visible} onRequestClose={onClose} backdropTestID="sheet-backdrop">
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { paddingBottom: space.sm + insets.bottom }, scrollable && { maxHeight: height * 0.85 }]}
      >
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high" style={styles.title}>
          {title}
        </Text>
        {scrollable ? <ScrollView style={styles.scroll}>{choices}</ScrollView> : choices}
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bgContrast50,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.borderMedium,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  title: { marginBottom: space.sm },
  scroll: { flexGrow: 0, flexShrink: 1 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  label: { flex: 1, paddingVertical: space.xs, gap: space._2xs },
  disabled: { opacity: 0.5 },
  sectionDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
    marginTop: space.xs,
    paddingTop: space.xs,
  },
  sectionTitle: { paddingVertical: space.xs },
});
