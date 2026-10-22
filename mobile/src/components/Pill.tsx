import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type PillProps = {
  children: ReactNode;
  tone?: 'default' | 'accent';
};

export function Pill({ children, tone = 'default' }: PillProps) {
  const accent = tone === 'accent';
  return (
    <View style={[styles.base, accent ? styles.accent : styles.default]}>
      <Text size="xs" weight={accent ? 'bold' : 'normal'} tone={accent ? 'high' : 'default'}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.full,
  },
  default: { backgroundColor: colors.bgContrast50, borderWidth: 1, borderColor: colors.borderMedium },
  accent: { backgroundColor: colors.selected, borderWidth: 1, borderColor: colors.primary },
});
