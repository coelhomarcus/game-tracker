import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type CoverFooterProps = {
  children: ReactNode;
};

const HEIGHT = 22;

/** The pill under a cover. Text shrinks to fit; other children (such as stars) share the row. */
export function CoverFooter({ children }: CoverFooterProps) {
  return (
    <View style={styles.pill}>
      {Children.map(children, (child) => {
        if (isValidElement(child)) return <View style={styles.shrink}>{child}</View>;
        if (typeof child !== 'string' && typeof child !== 'number') return null;
        return (
          <Text
            size="xs"
            weight="bold"
            style={styles.shrink}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {child}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast50,
    overflow: 'hidden',
  },
  shrink: { flexShrink: 1 },
});
