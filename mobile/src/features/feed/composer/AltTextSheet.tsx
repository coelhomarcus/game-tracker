import { useEffect, useState } from 'react';
import { AccessibilityInfo, Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SheetModal, Text, TextField } from '@/components';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { ALT_MAX_LENGTH } from './composerDraft';

const PREVIEW_MAX_HEIGHT = 240;
/** The sheet never grows past this share of the screen; its content scrolls. */
const SHEET_MAX_HEIGHT = 0.9;

export type AltTextSheetProps = {
  visible: boolean;
  /** What the preview shows. */
  imageUri: string;
  /**
   * Why the sheet opened by itself (e.g. Publicar needs a description). A native Modal covers the
   * toast host, so the sheet shows it, and announces it, itself.
   */
  notice?: string;
  /** The description the image has now ('' when none). */
  initialAlt: string;
  /** The trimmed description; '' removes it. */
  onSave: (alt: string) => void;
  onCancel: () => void;
};

/** The sheet where the description (alt text) of one image of the post is written. */
export function AltTextSheet({
  visible,
  imageUri,
  initialAlt,
  notice,
  onSave,
  onCancel,
}: AltTextSheetProps) {
  return (
    <SheetModal
      testID="alt-modal"
      visible={visible}
      onRequestClose={onCancel}
      avoidKeyboard
      backdropTestID="alt-backdrop"
    >
      {/* The app's keyboard provider already follows the keyboard inside a Modal's window. */}
      <AltForm
        imageUri={imageUri}
        initialAlt={initialAlt}
        notice={notice}
        onSave={onSave}
        onCancel={onCancel}
      />
    </SheetModal>
  );
}

function AltForm({
  imageUri,
  initialAlt,
  notice,
  onSave,
  onCancel,
}: Omit<AltTextSheetProps, 'visible'>) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Mounted only while the sheet is open, so every opening starts from the saved description.
  const [text, setText] = useState(initialAlt);
  useEffect(() => {
    if (notice) AccessibilityInfo.announceForAccessibility(notice);
  }, [notice]);

  return (
    <View
      testID="alt-sheet"
      accessibilityViewIsModal
      style={[
        styles.sheet,
        { maxHeight: windowHeight * SHEET_MAX_HEIGHT, paddingBottom: space.lg + insets.bottom },
      ]}
    >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
            Descrição da imagem
          </Text>
          {notice ? (
            <Text testID="alt-notice" size="sm" tone="medium">
              {notice}
            </Text>
          ) : null}
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
  );
}

const styles = StyleSheet.create({
  sheet: {
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
