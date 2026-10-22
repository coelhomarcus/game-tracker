import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, radii, space } from '@/theme/tokens';
import { Text } from './Text';

export type GameCoverProps = {
  name: string;
  url: string | null;
  /** Box width; omitted, the cover fills its parent. */
  width?: number;
  /**
   * Set when the cover sits inside a control that already names the game, so screen readers
   * do not stop on it a second time.
   */
  decorative?: boolean;
};

const ICON_ONLY_BELOW = 80;

export function GameCover({ name, url, width, decorative = false }: GameCoverProps) {
  const uri = resolveImageUrl(url);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = uri !== null && failedUri !== uri;
  const iconOnly = width !== undefined && width < ICON_ONLY_BELOW;

  return (
    <View
      {...(decorative
        ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const }
        : {
            accessible: true,
            accessibilityRole: 'image' as const,
            accessibilityLabel: `Capa de ${name}`,
          })}
      style={[styles.box, { width: width ?? '100%' }]}
    >
      {showImage ? (
        <Image
          testID="game-cover-image"
          source={{ uri }}
          resizeMode="cover"
          style={styles.image}
          onError={() => setFailedUri(uri)}
        />
      ) : iconOnly ? (
        <Ionicons
          name="game-controller-outline"
          size={Math.max(16, (width ?? 0) * 0.4)}
          color={colors.textMedium}
        />
      ) : (
        <Text size="xs" style={styles.name} numberOfLines={4}>
          {name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    aspectRatio: 3 / 4,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast50,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  name: {
    textAlign: 'center',
    paddingHorizontal: space.xs,
  },
});
