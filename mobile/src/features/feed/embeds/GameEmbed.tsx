import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GameCover, Text } from '@/components';
import type { Game } from '@/features/games/types';
import { colors, hairline, radii, space } from '@/theme/tokens';

const COVER_WIDTH = 48;

export type GameEmbedProps = {
  game: Game;
  /** The platform of the playthrough the post is linked to, shown before the game's own. */
  platform?: string | null;
};

/** The game a post is about, as a card that opens its page. */
export function GameEmbed({ game, platform }: GameEmbedProps) {
  const router = useRouter();
  const detail = platform || game.platforms[0] || null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir jogo ${game.name}`}
      onPress={() => router.push(`/games/${game.igdbId}` as Href)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <GameCover name={game.name} url={game.coverUrl} width={COVER_WIDTH} decorative />
      <View style={styles.text}>
        <Text numberOfLines={2} weight="semibold" tone="high">
          {game.name}
        </Text>
        {detail ? (
          <Text numberOfLines={1} size="sm" tone="medium">
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.sm,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
  pressed: { backgroundColor: colors.bgContrast50 },
  text: { flex: 1, gap: space._2xs },
});
