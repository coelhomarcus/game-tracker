import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

export type RatingStarsProps = {
  /** 0 to 10; shown as five stars with half-star resolution. */
  rating: number;
  size?: number;
};

const STARS = 5;

export function RatingStars({ rating, size = 12 }: RatingStarsProps) {
  const halves = Math.min(STARS * 2, Math.max(0, Math.round(rating)));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Nota ${rating} de 10`}
      style={styles.row}
    >
      {Array.from({ length: STARS }, (_, index) => {
        const filled = halves - index * 2;
        const name = filled >= 2 ? 'star' : filled === 1 ? 'star-half' : 'star-outline';
        return <Ionicons key={index} name={name} size={size} color={colors.primary} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
