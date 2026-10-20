import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, fontSize, radii, space } from '@/theme/tokens';

export type GameCoverProps = {
  name: string;
  url: string | null;
  /** Box width; omitted, the cover fills its parent. */
  width?: number;
};

const ICON_ONLY_BELOW = 80;

export function GameCover({ name, url, width }: GameCoverProps) {
  const uri = resolveImageUrl(url);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = uri !== null && failedUri !== uri;
  const iconOnly = width !== undefined && width < ICON_ONLY_BELOW;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Capa de ${name}`}
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
          color={colors.textMuted}
        />
      ) : (
        <Text style={styles.name} numberOfLines={4}>
          {name}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    aspectRatio: 3 / 4,
    borderRadius: radii.cover,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  name: {
    color: colors.text,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingHorizontal: space.xs,
  },
});
