import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { IoniconName } from '@/features/library/status';
import { colors, space } from '@/theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

export type EmptyStateProps = {
  title: string;
  message?: string;
  icon?: IoniconName;
  action?: { label: string; onPress: () => void };
  /** Pushes the content down (20% of the parent) for a full-screen empty state. */
  fill?: boolean;
};

export function EmptyState({ title, message, icon, action, fill }: EmptyStateProps) {
  return (
    <View style={[styles.container, fill ? styles.fill : null]}>
      {icon ? (
        <Ionicons
          name={icon}
          size={48}
          color={colors.textLow}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text accessibilityRole="header" size="lg" weight="semibold" tone="high" style={styles.centered}>
        {title}
      </Text>
      {message ? (
        <Text tone="medium" style={[styles.centered, styles.message]}>
          {message}
        </Text>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} size="small" color="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.md, padding: space._2xl },
  fill: { paddingTop: '20%' },
  centered: { textAlign: 'center' },
  message: { maxWidth: 360 },
});
