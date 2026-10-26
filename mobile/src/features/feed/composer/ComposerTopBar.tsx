import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components';
import { colors, hairline, space } from '@/theme/tokens';

export type ComposerTopBarProps = {
  canPublish: boolean;
  publishing: boolean;
  /** The editor is scrolled away from the top: a hairline separates it from the bar. */
  scrolled: boolean;
  onCancel: () => void;
  onPublish: () => void;
  /** Shown under the bar, e.g. why the last attempt to publish failed. */
  children?: ReactNode;
};

/**
 * The composer's top bar: Cancelar on the left, Publicar on the right. The small buttons pad out
 * to 48 dp of touch inside the bar's 8 dp padding, so the touch area stays within the bar.
 */
export function ComposerTopBar({
  canPublish,
  publishing,
  scrolled,
  onCancel,
  onPublish,
  children,
}: ComposerTopBarProps) {
  return (
    <View
      testID="composer-top-bar"
      style={[styles.container, { borderBottomColor: scrolled ? colors.borderMedium : 'transparent' }]}
    >
      <View style={styles.row}>
        <Button
          label="Cancelar"
          variant="ghost"
          color="primary"
          size="small"
          disabled={publishing}
          onPress={onCancel}
        />
        <View style={styles.spacer} />
        <Button
          label="Publicar"
          size="small"
          loading={publishing}
          disabled={!canPublish}
          onPress={onPublish}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, borderBottomWidth: hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.sm },
  spacer: { flex: 1 },
});
