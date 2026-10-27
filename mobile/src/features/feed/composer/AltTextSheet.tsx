import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView, KeyboardProvider } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text, TextField } from '@/components';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { ALT_MAX_LENGTH } from './composerDraft';

/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';
const PREVIEW_MAX_HEIGHT = 240;

export type AltTextSheetProps = {
  visible: boolean;
  /** What the preview shows. */
  imageUri: string;
  /** The description the image has now ('' when none). */
  initialAlt: string;
  /** The trimmed description; '' removes it. */
  onSave: (alt: string) => void;
  onCancel: () => void;
};

/** The sheet where the description (alt text) of one image of the post is written. */
export function AltTextSheet({ visible, imageUri, initialAlt, onSave, onCancel }: AltTextSheetProps) {
  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="slide"
      visible={visible}
      onRequestClose={onCancel}
    >
      {/* The sheet lives in its own window, which the app's keyboard provider does not reach. */}
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <AltForm imageUri={imageUri} initialAlt={initialAlt} onSave={onSave} onCancel={onCancel} />
      </KeyboardProvider>
    </Modal>
  );
}

function AltForm({
  imageUri,
  initialAlt,
  onSave,
  onCancel,
}: Omit<AltTextSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  // Mounted only while the sheet is open, so every opening starts from the saved description.
  const [text, setText] = useState(initialAlt);

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.root}>
      <Pressable
        testID="alt-backdrop"
        accessible={false}
        style={styles.backdrop}
        onPress={onCancel}
      />
      <View testID="alt-sheet" accessibilityViewIsModal style={[styles.sheet, { paddingBottom: space.lg + insets.bottom }]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
            Descrição da imagem
          </Text>
          <Image
            accessibilityIgnoresInvertColors
            accessibilityLabel="Imagem sendo descrita"
            source={{ uri: imageUri }}
            resizeMode="contain"
            style={styles.preview}
          />
          <TextField
            label="Descrição"
            placeholder="Descreva a imagem para quem não consegue vê-la"
            value={text}
            onChangeText={setText}
            maxLength={ALT_MAX_LENGTH}
            showCounter
            multiline
            minHeight={96}
          />
          <View style={styles.actions}>
            <Button label="Salvar" onPress={() => onSave(text.trim())} />
            <Button label="Cancelar" color="secondary" onPress={onCancel} />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: `${colors.bg}${ALPHA_60}` },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.bgContrast50,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderWidth: hairline,
    borderBottomWidth: 0,
    borderColor: colors.borderMedium,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  content: { gap: space.md },
  preview: {
    width: '100%',
    height: PREVIEW_MAX_HEIGHT,
    borderRadius: radii.md,
    backgroundColor: colors.bgContrast25,
  },
  actions: { gap: space.sm },
});
