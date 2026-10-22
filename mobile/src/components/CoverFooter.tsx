import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, radii, space } from '@/theme/tokens';

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
          <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
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
    borderRadius: radii.cover,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  shrink: { flexShrink: 1 },
  text: { flexShrink: 1, color: colors.text, fontSize: fontSize.xs, fontWeight: 'bold' },
});
