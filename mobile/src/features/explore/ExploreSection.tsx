import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { space } from '@/theme/tokens';

/** One discovery module of Explorar: a large semibold heading over its content. */
export function ExploreSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" size="lg" weight="semibold" tone="high" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingTop: space.lg, paddingBottom: space.sm, gap: space.md },
  title: { paddingHorizontal: space.lg },
});
