import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, space } from '@/theme/tokens';

export type PillProps = {
  children: ReactNode;
  tone?: 'default' | 'accent';
};

export function Pill({ children, tone = 'default' }: PillProps) {
  const accent = tone === 'accent';
  return (
    <View style={[styles.base, accent ? styles.accent : styles.default]}>
      <Text style={[styles.label, accent ? styles.accentLabel : styles.defaultLabel]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 999,
  },
  default: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  accent: { backgroundColor: colors.accent },
  label: { fontSize: fontSize.xs },
  defaultLabel: { color: colors.text },
  accentLabel: { color: colors.onAccent, fontWeight: 'bold' },
});
