import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from './Button';
import { Text } from './Text';
import { colors, hairline, radii, space } from '@/theme/tokens';

export type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};


export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable
          testID="confirm-backdrop"
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
        >
          <View style={styles.backdrop} />
        </Pressable>
        <View accessibilityViewIsModal style={styles.dialog}>
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
            {title}
          </Text>
          {message ? <Text>{message}</Text> : null}
          <View style={styles.actions}>
            <Button color="secondary" label={cancelLabel} onPress={onCancel} />
            {destructive ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                onPress={onConfirm}
                style={styles.destructive}
              >
                <Text weight="semibold" tone="danger">
                  {confirmLabel}
                </Text>
              </Pressable>
            ) : (
              <Button label={confirmLabel} onPress={onConfirm} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: space._2xl },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  dialog: {
    backgroundColor: colors.bgContrast50,
    borderWidth: hairline,
    borderColor: colors.borderMedium,
    borderRadius: radii.md,
    padding: space._2xl,
    gap: space.md,
  },
  actions: { gap: space.sm, marginTop: space.sm },
  destructive: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
