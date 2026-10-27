import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radii, space } from '@/theme/tokens';

import type { ComposerImage } from './ImagePicking';

const GAP = space.sm;
/** Real touch boxes; the pressables are this big, since Android ignores hitSlop past the parent. */
const TOUCH_BOX = 48;
const REMOVE_DOT = 24;
const ALT_PILL_HEIGHT = 24;
const SINGLE_MAX_HEIGHT = 300;
/** Up to three squares fit in a row; four wrap into two rows. */
const MAX_IN_ROW = 3;
/** Without usable dimensions a lone image gets a landscape box. */
const UNKNOWN_ASPECT = 16 / 9;

export type ComposerGalleryProps = {
  images: ComposerImage[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** A restored image failed to load (its file is gone): it can only be removed. */
  onBroken: (id: string) => void;
  /** Opens the sheet where the description of an uploaded image is written. */
  onEditAlt: (id: string) => void;
};

/** Width over height of a lone image, from the picked asset when it is known. */
function singleAspect({ width, height }: ComposerImage): number {
  return width > 0 && height > 0 ? width / height : UNKNOWN_ASPECT;
}

function Thumb({
  image,
  index,
  single,
  onRemove,
  onRetry,
  onBroken,
  onEditAlt,
}: {
  image: ComposerImage;
  index: number;
  single: boolean;
  onRemove: () => void;
  onRetry: () => void;
  onBroken: () => void;
  onEditAlt: () => void;
}) {
  const number = index + 1;
  // A restored image has no file to upload again.
  const retryable = image.source !== null;
  const alt = image.image?.alt;
  return (
    <View
      testID={`composer-image-${number}`}
      style={[
        styles.thumb,
        single
          ? {
              width: '100%',
              aspectRatio: singleAspect(image),
              maxHeight: SINGLE_MAX_HEIGHT,
            }
          : styles.square,
      ]}
    >
      <Image
        accessibilityLabel={`Imagem ${number}`}
        source={{ uri: image.uri }}
        resizeMode="cover"
        onError={onBroken}
        style={styles.fill}
      />

      {image.status === 'uploading' ? (
        <View testID={`composer-image-${number}-uploading`} style={styles.overlay}>
          <View style={[styles.fill, styles.scrim]} />
          <ActivityIndicator accessibilityLabel={`Enviando imagem ${number}`} color={colors.text} />
        </View>
      ) : null}

      {image.status === 'failed' ? (
        <View testID={`composer-image-${number}-failed`} pointerEvents="box-none" style={styles.overlay}>
          <View pointerEvents="none" style={[styles.fill, styles.scrim]} />
          {!retryable ? (
            <>
              <Ionicons name="alert-circle-outline" size={22} color={colors.danger} />
              <Text size="sm" weight="semibold" tone="danger" style={styles.retryLabel}>
                Imagem indisponível
              </Text>
            </>
          ) : single ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Tentar de novo enviar a imagem ${number}`}
              onPress={onRetry}
              style={styles.retryCentered}
            >
              <Ionicons name="refresh" size={22} color={colors.danger} />
              <Text size="sm" weight="semibold" tone="danger" style={styles.retryLabel}>
                Tentar de novo
              </Text>
            </Pressable>
          ) : (
            // Icon only, in the bottom-left corner: the remove box owns the top-right one, and the
            // two real 48 dp boxes never overlap.
            <Pressable
              testID={`composer-image-${number}-retry`}
              accessibilityRole="button"
              accessibilityLabel="Tentar de novo"
              accessibilityHint={`Imagem ${number}`}
              onPress={onRetry}
              style={styles.retryCorner}
            >
              <Ionicons name="refresh" size={22} color={colors.danger} />
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Only an uploaded image can be described. The pill is the visible part of a real 48 dp box. */}
      {image.status === 'done' && image.image ? (
        <Pressable
          testID={`composer-image-${number}-alt`}
          accessibilityRole="button"
          accessibilityLabel={
            alt ? `Editar descrição da imagem ${number}` : `Adicionar descrição à imagem ${number}`
          }
          onPress={onEditAlt}
          style={styles.altBox}
        >
          <View style={styles.altPill}>
            {alt ? <Ionicons
                testID={`composer-image-${number}-alt-set`}
                name="checkmark"
                size={12}
                color={colors.textEmphasis}
              /> : null}
            <Text size="xs" weight="bold" tone="high" maxFontSizeMultiplier={1.2}>
              ALT
            </Text>
          </View>
        </Pressable>
      ) : null}

      {/* A real 48 dp box in the corner of the thumbnail, with the 24 dp round "x" inside. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover imagem ${number}`}
        onPress={onRemove}
        style={styles.removeBox}
      >
        <View style={styles.removeDot}>
          <Ionicons name="close" size={16} color={colors.text} />
        </View>
      </Pressable>
    </View>
  );
}

/** The images of the post under the editor: one wide, or two to four squares in a row. */
export function ComposerGallery({
  images,
  onRemove,
  onRetry,
  onBroken,
  onEditAlt,
}: ComposerGalleryProps) {
  if (images.length === 0) return null;
  const single = images.length === 1;
  const thumbs = images.map((image, index) => (
    <Thumb
      key={image.id}
      image={image}
      index={index}
      single={single}
      onRemove={() => onRemove(image.id)}
      onRetry={() => onRetry(image.id)}
      onBroken={() => onBroken(image.id)}
      onEditAlt={() => onEditAlt(image.id)}
    />
  ));
  // Four squares in one row would be about 80 dp wide: too small to hold the remove box and the
  // retry button without overlapping. Four go two by two.
  if (images.length === MAX_IN_ROW + 1) {
    return (
      <View testID="composer-gallery" style={styles.grid}>
        <View style={styles.row}>{thumbs.slice(0, 2)}</View>
        <View style={styles.row}>{thumbs.slice(2)}</View>
      </View>
    );
  }
  return (
    <View testID="composer-gallery" style={styles.row}>
      {thumbs}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  grid: { gap: GAP },
  thumb: {
    overflow: 'hidden',
    borderRadius: radii.md,
    backgroundColor: colors.bgContrast25,
  },
  square: { flex: 1, aspectRatio: 1 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    padding: space.xs,
  },
  scrim: { backgroundColor: colors.bg, opacity: 0.7 },
  retryLabel: { textAlign: 'center' },
  retryCentered: {
    minWidth: TOUCH_BOX,
    minHeight: TOUCH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  retryCorner: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: TOUCH_BOX,
    height: TOUCH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  altBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    // Stops where the remove box starts, so the two real boxes never overlap, however narrow.
    right: TOUCH_BOX,
    height: TOUCH_BOX,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: space.xs,
  },
  altPill: {
    minHeight: ALT_PILL_HEIGHT,
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.xs,
    borderRadius: radii.full,
    backgroundColor: colors.scrim,
  },
  removeBox: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: TOUCH_BOX,
    height: TOUCH_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeDot: {
    width: REMOVE_DOT,
    height: REMOVE_DOT,
    borderRadius: REMOVE_DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgContrast50,
  },
});
