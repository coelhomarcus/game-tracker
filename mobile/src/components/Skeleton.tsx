import { View, type DimensionValue } from 'react-native';

import { colors, lineHeight, radii, type } from '@/theme/tokens';

const GOLDEN_RATIO = 1.618;

export type SkeletonBlockProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  testID?: string;
};

function Block({ width = '100%', height, radius = radii.card, testID }: SkeletonBlockProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={{ width, height, borderRadius: radius, backgroundColor: colors.bgContrast50 }}
    />
  );
}

export type SkeletonTextProps = {
  size?: keyof typeof type.size;
  width?: DimensionValue;
  testID?: string;
};

/** A placeholder line sized like a line of `Text` at the same size, so the layout does not jump on load. */
function SkeletonText({ size = 'md', width = '100%', testID }: SkeletonTextProps) {
  const line = lineHeight(type.size[size], 'snug');
  return (
    <View style={{ width, paddingVertical: line * 0.15 }}>
      <Block height={line * 0.7} radius={radii.md} testID={testID} />
    </View>
  );
}

export type SkeletonCircleProps = { size: number; testID?: string };

function Circle({ size, testID }: SkeletonCircleProps) {
  return <Block width={size} height={size} radius={size / 2} testID={testID} />;
}

export type SkeletonPillProps = { size: number; testID?: string };

/** A pill whose width is `size` times the golden ratio. */
function Pill({ size, testID }: SkeletonPillProps) {
  return <Block width={size * GOLDEN_RATIO} height={size} radius={size / 2} testID={testID} />;
}

/** `<Skeleton height={n} />` is a block; the namespace members cover text, circle and pill shapes. */
export const Skeleton = Object.assign(Block, { Block, Text: SkeletonText, Circle, Pill });

export type SkeletonProps = SkeletonBlockProps;
