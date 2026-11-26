import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { GameCover, Text } from '@/components';
import type { Game } from '@/features/games/types';
import { useGameBackdrop } from '@/features/games/useGameBackdrop';
import { colors, hairline, radii, space } from '@/theme/tokens';

const COVER_WIDTH = 50;

export type GameEmbedProps = {
  game: Game;
  /** The platform of the playthrough the post is linked to, shown before the game's own. */
  platform?: string | null;
};

/** The game a post is about, as a card that opens its page. */
export function GameEmbed({ game, platform }: GameEmbedProps) {
  const router = useRouter();
  const detail = platform || game.platforms[0] || null;
  const { uri, isScreenshot, onError } = useGameBackdrop(game);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir jogo ${game.name}`}
      accessibilityHint={detail ?? undefined}
      onPress={() => router.push(`/games/${game.igdbId}` as Href)}
      style={[styles.card, uri !== null && styles.withArt]}
    >
      {({ pressed }) => (
        <>
          {uri !== null ? (
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
          <GameCover name={game.name} url={game.coverUrl} width={COVER_WIDTH} decorative />
          <View style={styles.text}>
            <Text numberOfLines={2} size="lg" leading="tight" weight="bold" tone="high">
              {game.name}
            </Text>
            {detail ? (
              <Text numberOfLines={1} size="sm" tone="medium">
                {detail}
              </Text>
            ) : null}
          </View>
          <View style={styles.arrow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="chevron-forward" size={15} color={colors.textEmphasis} />
          </View>
          {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pressed]} /> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 560,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radii.lg,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
    overflow: 'hidden',
  },
  withArt: { minHeight: 104 },
  art: { width: '100%', height: '100%' },
  blurredCover: { opacity: 0.68 },
  scrim: {
    backgroundColor: '#080A0F4D',
    backgroundImage: 'linear-gradient(to right, #080A0FF5 2%, #080A0FC4 48%, #080A0F16 100%)',
  },
  pressed: { backgroundColor: '#FFFFFF12' },
  text: { flex: 1, minWidth: 0, gap: space.xs },
  arrow: {
    width: 30, height: 30, borderRadius: radii.full, borderWidth: hairline, borderColor: '#FFFFFF33',
    backgroundColor: '#101217BD', alignItems: 'center', justifyContent: 'center',
  },
});
