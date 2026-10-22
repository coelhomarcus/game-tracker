import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { colors, lineHeight, type } from '@/theme/tokens';

export type TextTone = 'default' | 'high' | 'medium' | 'low' | 'primary' | 'danger' | 'onPrimary';

export type TextProps = RNTextProps & {
  size?: keyof typeof type.size;
  weight?: keyof typeof type.weight;
  tone?: TextTone;
  leading?: keyof typeof type.leading;
};

/** Inter family per weight; Android ignores `fontWeight` for custom fonts, so each weight is its own family. */
export const fontFamily = {
  normal: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const satisfies Record<keyof typeof type.weight, string>;

const toneColor = {
  default: colors.text,
  high: colors.textEmphasis,
  medium: colors.textMedium,
  low: colors.textLow,
  primary: colors.primary,
  danger: colors.danger,
  onPrimary: colors.onPrimary,
} as const satisfies Record<TextTone, string>;

export function Text({
  size = 'md',
  weight = 'normal',
  tone = 'default',
  leading = 'snug',
  style,
  ...rest
}: TextProps) {
  const fontSize = type.size[size];
  return (
    <RNText
      {...rest}
      style={[
        { fontFamily: fontFamily[weight], fontSize, lineHeight: lineHeight(fontSize, leading), color: toneColor[tone] },
        style,
      ]}
    />
  );
}
