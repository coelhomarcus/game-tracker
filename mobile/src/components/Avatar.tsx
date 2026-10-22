import { Image, StyleSheet, View } from 'react-native';

import { colors, lineHeight } from '@/theme/tokens';
import { Text } from './Text';

export type AvatarProps = {
  uri?: string | null;
  name: string;
  size?: number;
};

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image accessibilityLabel={name} source={{ uri }} style={[styles.image, circle]} />;
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const initialSize = size * 0.4;
  return (
    <View style={[styles.fallback, circle]}>
      <Text weight="bold" tone="high" style={{ fontSize: initialSize, lineHeight: lineHeight(initialSize, 'snug') }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.bgContrast50 },
  fallback: { backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
});
