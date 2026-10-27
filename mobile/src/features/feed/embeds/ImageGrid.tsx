import { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { ImageViewer, imageLabel } from '../ImageViewer';
import type { PostImage } from '../types';

const RADIUS = radii.md;
const GAP = space.xs;
/** Without stored dimensions a single image gets a landscape box. */
const UNKNOWN_ASPECT = 16 / 9;
/** On a phone a tall image is cropped to a 9:16 box at most. */
const TALLEST_ASPECT = 9 / 16;
/** Cells of the 2×2 grid, as in the design reference. */
const QUAD_ASPECT = 1.5;

/** Width over height of a lone image, from its stored dimensions when they are known. */
export function singleImageAspect(image: PostImage): number {
  const { width, height } = image;
  if (!width || !height || width <= 0 || height <= 0) return UNKNOWN_ASPECT;
  return Math.max(width / height, TALLEST_ASPECT);
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Only the corners on the outside of the grid are rounded. */
function corners(...rounded: Corner[]): ViewStyle {
  const radius = (corner: Corner) => (rounded.includes(corner) ? RADIUS : 0);
  return {
    borderTopLeftRadius: radius('tl'),
    borderTopRightRadius: radius('tr'),
    borderBottomLeftRadius: radius('bl'),
    borderBottomRightRadius: radius('br'),
  };
}

const ALL = corners('tl', 'tr', 'bl', 'br');

export type ImageGridProps = {
  images: PostImage[];
  /**
   * Whether a tap opens the fullscreen viewer. Off inside a card that opens something else as a
   * whole (a quoted post).
   */
  interactive?: boolean;
  /** Fixed width over height for a lone image, instead of its own shape. */
  aspect?: number;
};

/** 1 to 4 images of a post, laid out as in the design reference; a tap opens the viewer there. */
export function ImageGrid({ images, interactive = true, aspect }: ImageGridProps) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const shown = images.slice(0, 4);
  const count = shown.length;
  if (count === 0) return null;

  const cell = (index: number, shape: ViewStyle, round: ViewStyle) => (
    <Cell
      key={index}
      image={shown[index]}
      label={imageLabel(shown[index], index, count)}
      shape={shape}
      round={round}
      onPress={interactive ? () => setViewerIndex(index) : undefined}
    />
  );

  let grid;
  if (count === 1) {
    grid = cell(0, { width: '100%', aspectRatio: aspect ?? singleImageAspect(shown[0]) }, ALL);
  } else if (count === 2) {
    grid = (
      <View style={styles.row}>
        {cell(0, styles.square, corners('tl', 'bl'))}
        {cell(1, styles.square, corners('tr', 'br'))}
      </View>
    );
  } else if (count === 3) {
    grid = (
      <View style={styles.row}>
        {cell(0, styles.square, corners('tl', 'bl'))}
        <View testID="image-grid-stack" style={[styles.square, styles.stack]}>
          {cell(1, styles.fill, corners('tr'))}
          {cell(2, styles.fill, corners('br'))}
        </View>
      </View>
    );
  } else {
    grid = (
      <View style={styles.stack}>
        <View style={styles.row}>
          {cell(0, styles.quad, corners('tl'))}
          {cell(1, styles.quad, corners('tr'))}
        </View>
        <View style={styles.row}>
          {cell(2, styles.quad, corners('bl'))}
          {cell(3, styles.quad, corners('br'))}
        </View>
      </View>
    );
  }

  return (
    <View testID={`image-grid-${count}`}>
      {grid}
      {viewerIndex !== null ? (
        <ImageViewer
          images={shown}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}

type CellProps = {
  image: PostImage;
  label: string;
  /** Size of the cell in its layout. */
  shape: ViewStyle;
  round: ViewStyle;
  onPress?: () => void;
};

function Cell({ image, label, shape, round, onPress }: CellProps) {
  const uri = resolveImageUrl(image.url);
  const content = (
    <>
      {uri ? <Image source={{ uri }} resizeMode="cover" style={styles.image} /> : null}
      {/* A hairline drawn over the image keeps light pictures from bleeding into the page. */}
      <View pointerEvents="none" style={[styles.border, round]} />
      {/* The label above already speaks the description; the badge is only for sighted users. */}
      {image.alt ? (
        <View
          testID="post-image-alt"
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.altBadge}
        >
          <Text size="xs" weight="bold" tone="high">
            ALT
          </Text>
        </View>
      ) : null}
    </>
  );
  // A preview takes no touch, so the card around it gets the tap; its label carries the post.
  if (!onPress) {
    return (
      <View
        testID="post-image"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={[styles.cell, shape, round]}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      testID="post-image"
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.cell, shape, round]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  stack: { gap: GAP },
  square: { flex: 1, aspectRatio: 1 },
  quad: { flex: 1, aspectRatio: QUAD_ASPECT },
  fill: { flex: 1 },
  cell: { overflow: 'hidden', backgroundColor: colors.bgContrast25 },
  image: { width: '100%', height: '100%' },
  altBadge: {
    position: 'absolute',
    left: space.xs,
    bottom: space.xs,
    paddingHorizontal: space.xs,
    borderRadius: radii.full,
    backgroundColor: colors.scrim,
  },
  border: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
});
