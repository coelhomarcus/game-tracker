import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, hairline, space } from '@/theme/tokens';

const BAR_MIN_HEIGHT = 48;

export type EditProfileTopBarProps = {
  canSave: boolean;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  /** Shown under the bar, e.g. why the last save stopped. */
  children?: ReactNode;
};

/**
 * Cancelar, the centred title and Salvar. The small buttons are 36 dp tall and centred in the
 * 48 dp bar, so their hit slop gives a 48 dp touch box that stays within the bar.
 */
export function EditProfileTopBar({
  canSave,
  saving,
  onCancel,
  onSave,
  children,
}: EditProfileTopBarProps) {
  return (
    <View testID="edit-profile-top-bar" style={styles.container}>
      <View style={styles.row}>
        <View pointerEvents="none" style={styles.titleBox}>
          <Text accessibilityRole="header" size="lg" weight="semibold" tone="high">
            Editar perfil
          </Text>
        </View>
        <Button
          label="Cancelar"
          variant="ghost"
          color="primary"
          size="small"
          disabled={saving}
          onPress={onCancel}
        />
        <View style={styles.spacer} />
        <Button
          label="Salvar"
          variant="ghost"
          color="primary"
          size="small"
          loading={saving}
          disabled={!canSave}
          onPress={onSave}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bg,
    borderBottomWidth: hairline,
    borderBottomColor: colors.borderLow,
  },
  row: {
    minHeight: BAR_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  titleBox: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { flex: 1 },
});
