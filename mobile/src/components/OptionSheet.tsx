import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IoniconName } from '@/features/library/status';
import { colors, hairline, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type OptionSheetOption<T> = {
  value: T;
  label: string;
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
  onSelect: (value: T) => void;
  onClose: () => void;
};

/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';

export function OptionSheet<T>({
  visible,
  title,
  options = [],
  selected,
  sections = [],
  onSelect,
  onClose,
}: OptionSheetProps<T>) {
  const insets = useSafeAreaInsets();

  const renderOption = (option: OptionSheetOption<T>, current: T | undefined) => {
    const isSelected = option.value === current;
    return (
      <Pressable
        key={String(option.value)}
        accessibilityRole="button"
        accessibilityLabel={option.label}
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
        <Text
          weight={isSelected ? 'bold' : 'normal'}
          tone={option.destructive ? 'danger' : isSelected ? 'high' : 'default'}
          style={styles.label}
        >
          {option.label}
        </Text>
        {isSelected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
      </Pressable>
    );
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          testID="sheet-backdrop"
          accessible={false}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: space.sm + insets.bottom }]}
        >
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high" style={styles.title}>
            {title}
          </Text>
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: `${colors.bg}${ALPHA_60}` },
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
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  label: { flex: 1 },
  disabled: { opacity: 0.5 },
  sectionDivider: {
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
    marginTop: space.xs,
    paddingTop: space.xs,
  },
  sectionTitle: { paddingVertical: space.xs },
});
