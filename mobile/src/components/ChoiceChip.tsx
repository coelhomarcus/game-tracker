import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { colors, fontSize, radii, space } from '@/theme/tokens';

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
        <Ionicons name={icon} size={18} color={selected ? colors.textStrong : colors.text} />
      ) : null}
      <Text style={[styles.label, selected ? styles.labelSelected : styles.labelIdle]}>{label}</Text>
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
    borderRadius: radii.control,
  },
  chipSelected: { backgroundColor: colors.active },
  chipIdle: { backgroundColor: colors.raised },
  label: { fontSize: fontSize.sm, textAlign: 'center' },
  labelSelected: { color: colors.textStrong, fontWeight: 'bold' },
  labelIdle: { color: colors.text },
});
