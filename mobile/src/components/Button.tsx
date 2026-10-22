import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableStateCallbackType } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { colors, contrast, negative400, negative500, primary, radii } from '@/theme/tokens';
import { Text } from './Text';

export type ButtonSize = 'tiny' | 'small' | 'large';
export type ButtonColor = 'primary' | 'secondary' | 'negative';
export type ButtonShape = 'default' | 'round';
/** `primary`, `secondary` and `text` are the pre-design-system variants, kept until the call sites move to `color` + `variant`. */
export type ButtonVariant = 'solid' | 'ghost' | 'primary' | 'secondary' | 'text';

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

type Look = { color: ButtonColor; ghost: boolean };

function resolveLook(color: ButtonColor | undefined, variant: ButtonVariant | undefined): Look {
  switch (variant) {
    case 'secondary':
      return { color: color ?? 'secondary', ghost: false };
    case 'text':
    case 'ghost':
      return { color: color ?? 'primary', ghost: true };
    default:
      return { color: color ?? 'primary', ghost: false };
  }
}

const solid = {
  primary: { background: primary[500], pressed: primary[400], text: colors.onPrimary },
  secondary: { background: colors.bgContrast50, pressed: contrast[100], text: colors.text },
  negative: { background: negative500, pressed: negative400, text: '#ffffff' },
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
  color,
  variant,
  shape = 'default',
  loading = false,
  disabled = false,
  accessibilityLabel,
  haptic: withHaptic = true,
}: ButtonProps) {
  const look = resolveLook(color, variant);
  const round = shape === 'round';
  const inactive = disabled || loading;
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
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  largeRadius: { borderRadius: radii.md },
  fullRadius: { borderRadius: radii.full },
  inactive: { opacity: 0.5 },
});

const sizeStyles = StyleSheet.create({
  large: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 24 },
  small: { paddingVertical: 8, paddingHorizontal: 14 },
  tiny: { paddingVertical: 5, paddingHorizontal: 10 },
});

/** Icon-only circles: padding plus the icon gives 48 / 33 / 24 dp. */
const roundStyles = StyleSheet.create({
  large: { minWidth: 48, padding: 14 },
  small: { padding: 8 },
  tiny: { padding: 5 },
});
