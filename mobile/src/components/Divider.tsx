import { View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hairline } from '@/theme/tokens';

export type DividerProps = {
  /** Horizontal inset on both sides, in dp. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Divider({ inset = 0, style, testID }: DividerProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
      style={[{ borderTopWidth: hairline, borderTopColor: colors.borderLow, marginHorizontal: inset }, style]}
    />
  );
}
