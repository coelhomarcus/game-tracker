import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IoniconName } from '@/features/library/status';
import { colors, hairline, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type OptionSheetProps<T> = {
  visible: boolean;
  title: string;
  options: { value: T; label: string; icon?: IoniconName }[];
  selected?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
};

/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';

export function OptionSheet<T>({ visible, title, options, selected, onSelect, onClose }: OptionSheetProps<T>) {
  const insets = useSafeAreaInsets();
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
          {options.map((option) => {
            const isSelected = option.value === selected;
            return (
              <Pressable
                key={String(option.value)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={styles.row}
              >
                {option.icon ? <Ionicons name={option.icon} size={22} color={colors.text} /> : null}
                <Text weight={isSelected ? 'bold' : 'normal'} tone={isSelected ? 'high' : 'default'} style={styles.label}>
                  {option.label}
                </Text>
                {isSelected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
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
});
