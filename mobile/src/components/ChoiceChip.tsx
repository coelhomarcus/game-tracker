import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { colors, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IoniconName;
  accessibilityLabel?: string;
};

export function ChoiceChip({ label, selected, onPress, icon, accessibilityLabel }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
    >
      {icon ? (
        <Ionicons name={icon} size={18} color={selected ? colors.textEmphasis : colors.text} />
      ) : null}
      <Text
        size="sm"
        weight={selected ? 'bold' : 'normal'}
        tone={selected ? 'high' : 'default'}
        style={styles.label}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderLow,
  },
  chipSelected: { backgroundColor: colors.selected },
  chipIdle: { backgroundColor: colors.bgContrast50 },
  label: { textAlign: 'center' },
});
