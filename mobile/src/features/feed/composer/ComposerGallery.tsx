import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radii, space } from '@/theme/tokens';

import type { ComposerImage } from './ImagePicking';

const GAP = space.sm;
const REMOVE_BOX = 48;
const REMOVE_DOT = 32;
const SINGLE_MAX_HEIGHT = 300;
/** Without usable dimensions a lone image gets a landscape box. */
const UNKNOWN_ASPECT = 16 / 9;

export type ComposerGalleryProps = {
  images: ComposerImage[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
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
}: {
  image: ComposerImage;
  index: number;
  single: boolean;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const number = index + 1;
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
        style={styles.fill}
      />

      {image.status === 'uploading' ? (
        <View testID={`composer-image-${number}-uploading`} style={styles.overlay}>
          <View style={[styles.fill, styles.scrim]} />
          <ActivityIndicator accessibilityLabel={`Enviando imagem ${number}`} color={colors.text} />
        </View>
      ) : null}

      {image.status === 'failed' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tentar de novo enviar a imagem ${number}`}
          onPress={onRetry}
          style={styles.overlay}
        >
          <View style={[styles.fill, styles.scrim]} />
          <Ionicons name="refresh" size={22} color={colors.danger} />
          <Text size="sm" weight="semibold" tone="danger" style={styles.retryLabel}>
            Tentar de novo
          </Text>
        </Pressable>
      ) : null}

      {/* A real 48 dp box in the corner of the thumbnail, with the 32 dp round "x" inside. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover imagem ${number}`}
        onPress={onRemove}
        style={styles.removeBox}
      >
        <View style={styles.removeDot}>
          <Ionicons name="close" size={18} color={colors.text} />
        </View>
      </Pressable>
    </View>
  );
}

/** The images of the post under the editor: one wide, or two to four squares in a row. */
export function ComposerGallery({ images, onRemove, onRetry }: ComposerGalleryProps) {
  if (images.length === 0) return null;
  const single = images.length === 1;
  return (
    <View testID="composer-gallery" style={styles.row}>
      {images.map((image, index) => (
        <Thumb
          key={image.id}
          image={image}
          index={index}
          single={single}
          onRemove={() => onRemove(image.id)}
          onRetry={() => onRetry(image.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
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
  removeBox: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: REMOVE_BOX,
    height: REMOVE_BOX,
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
