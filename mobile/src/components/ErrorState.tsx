import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors, space } from '@/theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

export type ErrorStateProps = {
  title?: string;
  message?: string;
  /** Shows the "Tentar de novo" button. */
  onRetry?: () => void;
  /** Pushes the content down (20% of the parent) for a full-screen error state. */
  fill?: boolean;
};

export function ErrorState({ title = 'Algo deu errado', message, onRetry, fill }: ErrorStateProps) {
  return (
    <View style={[styles.container, fill ? styles.fill : null]}>
      <Ionicons
        name="information-circle-outline"
        size={48}
        color={colors.textLow}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text accessibilityRole="header" size="_2xl" weight="semibold" style={styles.centered}>
        {title}
      </Text>
      {message ? (
        <Text tone="medium" style={[styles.centered, styles.message]}>
          {message}
        </Text>
      ) : null}
      {onRetry ? <Button label="Tentar de novo" onPress={onRetry} size="small" color="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: space.md, padding: space._2xl },
  fill: { paddingTop: '20%' },
  centered: { textAlign: 'center' },
  message: { maxWidth: 360 },
});
