import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components';
import { colors, hairline, radii, space } from '@/theme/tokens';

/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';

export type DiscardDraftPromptProps = {
  visible: boolean;
  /** Keeps the draft for the next time this composer opens, and leaves. */
  onSave: () => void;
  /** Throws the draft away and leaves. */
  onDiscard: () => void;
  /** Stays in the composer. */
  onKeepEditing: () => void;
};

/** The sheet shown when leaving the composer with something written in it. */
export function DiscardDraftPrompt({ visible, onSave, onDiscard, onKeepEditing }: DiscardDraftPromptProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onKeepEditing}>
      <View style={styles.root}>
        <Pressable
          testID="discard-backdrop"
          accessible={false}
          style={styles.backdrop}
          onPress={onKeepEditing}
        />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
            Descartar rascunho?
          </Text>
          <Text tone="medium">Você pode salvar o rascunho e continuar depois.</Text>
          <View style={styles.actions}>
            <Button label="Salvar rascunho" onPress={onSave} />
            <Button label="Continuar editando" color="secondary" onPress={onKeepEditing} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Descartar"
              onPress={onDiscard}
              style={({ pressed }) => [styles.discard, pressed && styles.pressed]}
            >
              <Text weight="semibold" tone="danger">
                Descartar
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: `${colors.bg}${ALPHA_60}` },
  sheet: {
    backgroundColor: colors.bgContrast50,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.borderMedium,
    paddingTop: space._2xl,
    paddingHorizontal: space._2xl,
    gap: space.md,
  },
  actions: { gap: space.sm, marginTop: space.sm },
  discard: {
    minHeight: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
});
