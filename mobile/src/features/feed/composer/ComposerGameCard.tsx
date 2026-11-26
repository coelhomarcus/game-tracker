import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { GameCover, Text } from '@/components';
import type { Game } from '@/features/games/types';
import { useGameBackdrop } from '@/features/games/useGameBackdrop';
import { colors, hairline, radii, space } from '@/theme/tokens';

const COVER_WIDTH = 46;

type ComposerGameCardProps = {
  game: Game;
  platform?: string;
  onRemove: () => void;
  children?: ReactNode;
};

export function ComposerGameCard({ game, platform, onRemove, children }: ComposerGameCardProps) {
  const { uri, isScreenshot, onError } = useGameBackdrop(game);
  return (
    <View testID="composer-game-card" style={styles.card}>
      <View style={styles.banner}>
        {uri ? (
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
            <Image
              key={uri}
              source={{ uri }}
              resizeMode="cover"
              blurRadius={isScreenshot ? 0 : 14}
              onError={onError}
              style={[StyleSheet.absoluteFill, styles.art, !isScreenshot && styles.blurredCover]}
            />
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          </View>
        ) : null}
        <GameCover decorative name={game.name} url={game.coverUrl} width={COVER_WIDTH} />
        <View style={styles.gameText}>
          <View style={styles.label}>
            <Ionicons name="checkmark-circle" size={13} color={colors.status.completed} accessibilityElementsHidden importantForAccessibility="no" />
            <Text size="xs" tone="medium" weight="medium">Jogo vinculado</Text>
          </View>
          <Text numberOfLines={2} size="lg" weight="bold" tone="high">{game.name}</Text>
          {platform ? <Text numberOfLines={1} size="sm" tone="medium">{platform}</Text> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Remover vínculo com o jogo"
          onPress={onRemove}
          style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
        >
          <View style={styles.removeIcon}><Ionicons name="close" size={20} color={colors.text} /></View>
        </Pressable>
      </View>
      {children ? <View style={styles.records}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.lg, borderWidth: hairline, borderColor: colors.borderLow, backgroundColor: colors.bgContrast25, overflow: 'hidden' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 96, paddingStart: space.md, paddingVertical: space.md, paddingEnd: space.xs },
  art: { width: '100%', height: '100%' },
  blurredCover: { opacity: 0.7 },
  scrim: { backgroundColor: '#080A0F8C', backgroundImage: 'linear-gradient(to right, #080A0FE5 10%, #080A0F66 100%)' },
  gameText: { flex: 1, minWidth: 0, gap: space._2xs },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  remove: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  removeIcon: { width: 32, height: 32, borderRadius: radii.full, backgroundColor: colors.bgContrast50, alignItems: 'center', justifyContent: 'center' },
  removePressed: { opacity: 0.68 },
  records: { padding: space.md, gap: space.sm, borderTopWidth: hairline, borderTopColor: colors.borderLow },
});
