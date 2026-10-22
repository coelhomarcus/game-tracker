import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, radii, space } from '@/theme/tokens';

import type { PostImage } from './types';

export type ImageViewerProps = {
  images: PostImage[];
  /** The image shown first: the one that was tapped. */
  initialIndex: number;
  onClose: () => void;
};

export function imageLabel(image: PostImage, index: number, count: number): string {
  const position = count > 1 ? `Imagem ${index + 1} de ${count}` : 'Imagem do post';
  return image.alt ? `${position}: ${image.alt}` : position;
}

/** Fullscreen images of a post, swiped sideways; Android back and the close button leave it. */
export function ImageViewer({ images, initialIndex, onClose }: ImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(initialIndex);

  const getItemLayout = useCallback(
    (_: ArrayLike<PostImage> | null | undefined, at: number) => ({
      length: width,
      offset: width * at,
      index: at,
    }),
    [width],
  );
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    setIndex(Math.min(images.length - 1, Math.max(0, page)));
  };

  return (
    <Modal
      visible
      animationType={reduceMotion ? 'none' : 'fade'}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View testID="image-viewer" accessibilityViewIsModal style={styles.page}>
        <FlatList
          testID="image-viewer-list"
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={getItemLayout}
          keyExtractor={(image, at) => `${at}:${image.url}`}
          onMomentumScrollEnd={settle}
          renderItem={({ item, index: at }) => (
            <Image
              accessibilityLabel={imageLabel(item, at, images.length)}
              source={{ uri: resolveImageUrl(item.url) ?? undefined }}
              resizeMode="contain"
              style={{ width, height }}
            />
          )}
        />
        <View style={[styles.bar, { paddingTop: insets.top }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            onPress={onClose}
            style={styles.close}
          >
            <Ionicons name="close" size={28} color={colors.textEmphasis} />
          </Pressable>
          {images.length > 1 ? (
            <Text weight="semibold" tone="high" style={styles.counter}>
              {`${index + 1} de ${images.length}`}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xs,
  },
  // A filled circle so the icon stays readable over a light image.
  close: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgContrast25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: {
    marginLeft: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radii.full,
    backgroundColor: colors.bgContrast25,
    overflow: 'hidden',
  },
});
