import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, space } from '@/theme/tokens';
import { Button } from './Button';

export type EmptyStateProps = {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.md, padding: space.xl },
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold', textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center' },
});
