import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { space } from '@/theme/tokens';

/** "Hoje às 15:41" and the like, centred above the first message after a pause of over an hour. */
export const DateDivider = memo(function DateDivider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <Text size="xs" tone="medium" style={styles.label}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  divider: { paddingTop: space.md, paddingHorizontal: space.md },
  label: { textAlign: 'center' },
});
