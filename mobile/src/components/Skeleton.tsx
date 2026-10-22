import { View, type DimensionValue } from 'react-native';

import { colors, radii } from '@/theme/tokens';

export type SkeletonProps = {
  width?: DimensionValue;
  height: number;
  radius?: number;
  testID?: string;
};

export function Skeleton({ width = '100%', height, radius = radii.card, testID }: SkeletonProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={{ width, height, borderRadius: radius, backgroundColor: colors.raised }}
    />
  );
}
