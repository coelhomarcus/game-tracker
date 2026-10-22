import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { colors, fontSize, radii, space } from '@/theme/tokens';

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

/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';

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
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Button variant="secondary" label={cancelLabel} onPress={onCancel} />
            {destructive ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
                onPress={onConfirm}
                style={styles.destructive}
              >
                <Text style={styles.destructiveLabel}>{confirmLabel}</Text>
              </Pressable>
            ) : (
              <Button variant="primary" label={confirmLabel} onPress={onConfirm} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: space.xl },
  backdrop: { flex: 1, backgroundColor: `${colors.bg}${ALPHA_60}` },
  dialog: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.card,
    padding: space.xl,
    gap: space.md,
  },
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  message: { color: colors.text, fontSize: fontSize.md },
  actions: { gap: space.sm, marginTop: space.sm },
  destructive: {
    minHeight: 48,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destructiveLabel: { color: colors.danger, fontSize: fontSize.md, fontWeight: '600' },
});
