import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableStateCallbackType } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { colors, contrast, negative400, negative500, primary, radii } from '@/theme/tokens';
import { Text } from './Text';

export type ButtonSize = 'tiny' | 'small' | 'large';
export type ButtonColor = 'primary' | 'secondary' | 'negative';
export type ButtonShape = 'default' | 'round';
export type ButtonVariant = 'solid' | 'ghost';

export type ButtonProps = {
  label?: string;
  icon?: IoniconName;
  onPress: () => void;
  size?: ButtonSize;
  color?: ButtonColor;
  variant?: ButtonVariant;
  /** `round` renders an icon-only circle. */
  shape?: ButtonShape;
  loading?: boolean;
  disabled?: boolean;
  /** Spoken name when it must differ from the visible label (required for icon-only buttons). */
  accessibilityLabel?: string;
  /** Short vibration on press; on by default. */
  haptic?: boolean;
};

const solid = {
  primary: { background: primary[500], pressed: primary[400], text: colors.onPrimary },
  secondary: { background: colors.bgContrast50, pressed: contrast[100], text: colors.text },
  negative: { background: negative500, pressed: negative400, text: colors.onPrimary },
} as const;

const ghostText = {
  primary: primary[500],
  secondary: colors.text,
  negative: colors.danger,
} as const;

const iconSize = { large: 20, small: 17, tiny: 14 } as const;

/** Visual heights below 48 dp are padded out with hitSlop (per side, in dp). */
const hitSlopBySize = { large: 0, small: 8, tiny: 11 } as const;
const hitSlopRound = { large: 0, small: 8, tiny: 12 } as const;

export function Button({
  label,
  icon,
  onPress,
  size = 'large',
  color = 'primary',
  variant = 'solid',
  shape = 'default',
  loading = false,
  disabled = false,
  accessibilityLabel,
  haptic: withHaptic = true,
}: ButtonProps) {
  const look = { color, ghost: variant === 'ghost' };
  const round = shape === 'round';
  const inactive = disabled || loading;
  const solidSecondary = !look.ghost && look.color === 'secondary';
  const textColor = look.ghost ? ghostText[look.color] : solid[look.color].text;

  function containerStyle({ pressed }: PressableStateCallbackType) {
    const background = look.ghost
      ? pressed
        ? colors.bgContrast25
        : 'transparent'
      : pressed
        ? solid[look.color].pressed
        : solid[look.color].background;
    return [
      styles.base,
      sizeStyles[size],
      round ? roundStyles[size] : null,
      size === 'large' && !round ? styles.largeRadius : styles.fullRadius,
      { backgroundColor: background },
      solidSecondary && styles.outlined,
      inactive && styles.inactive,
    ];
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={(round ? hitSlopRound : hitSlopBySize)[size]}
      onPress={() => {
        if (withHaptic) haptic('tap');
        onPress();
      }}
      style={containerStyle}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={iconSize[size]} color={textColor} /> : null}
          {label && !round ? (
            <Text size={size === 'tiny' ? 'sm' : 'md'} weight="medium" style={{ color: textColor }}>
              {label}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  largeRadius: { borderRadius: radii.md },
  fullRadius: { borderRadius: radii.full },
  /** Secondary buttons share the card and sheet fill, so they keep a hairline edge. */
  outlined: { borderColor: colors.borderLow },
  inactive: { opacity: 0.5 },
});

/** Paddings are 1 dp short of the nominal values: the 1 dp border (transparent unless outlined) makes up the rest. */
const sizeStyles = StyleSheet.create({
  large: { minHeight: 48, paddingVertical: 11, paddingHorizontal: 23 },
  small: { paddingVertical: 7, paddingHorizontal: 13 },
  tiny: { paddingVertical: 4, paddingHorizontal: 9 },
});

/** Icon-only circles with equal paddings on both axes (they override sizeStyles): 48 / 33 / 24 dp squares. */
const roundStyles = StyleSheet.create({
  large: { minWidth: 48, minHeight: 48, paddingVertical: 13, paddingHorizontal: 13 },
  small: { paddingVertical: 7, paddingHorizontal: 7 },
  tiny: { paddingVertical: 4, paddingHorizontal: 4 },
});
