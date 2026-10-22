import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, fontSize, radii, space } from '@/theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'text';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** Spoken name when it must differ from the visible label. */
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.base, containerStyles[variant], inactive && styles.inactive]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColors[variant]} />
      ) : (
        <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    borderRadius: radii.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactive: { opacity: 0.5 },
  label: { fontSize: fontSize.md },
});

const containerStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.borderStrong },
  text: { backgroundColor: 'transparent' },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onAccent, fontWeight: 'bold' },
  secondary: { color: colors.text, fontWeight: '600' },
  text: { color: colors.accent, fontWeight: '600' },
});

const spinnerColors: Record<ButtonVariant, string> = {
  primary: colors.onAccent,
  secondary: colors.text,
  text: colors.accent,
};
