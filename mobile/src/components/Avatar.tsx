import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/tokens';

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
  return (
    <View style={[styles.fallback, circle]}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.raised },
  fallback: { backgroundColor: colors.active, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.textStrong, fontWeight: 'bold' },
});
