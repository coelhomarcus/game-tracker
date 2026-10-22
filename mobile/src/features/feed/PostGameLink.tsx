import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { GameCover } from '@/components';
import type { Game } from '@/features/games/types';
import { colors, fontSize, space } from '@/theme/tokens';

const COVER_WIDTH = 36;

export type PostGameLinkProps = {
  game: Game;
};

/** The game a post is about; opens its page. */
export function PostGameLink({ game }: PostGameLinkProps) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir jogo ${game.name}`}
      onPress={() => router.push(`/games/${game.igdbId}` as Href)}
      style={styles.row}
    >
      <GameCover name={game.name} url={game.coverUrl} width={COVER_WIDTH} decorative />
      <Text numberOfLines={2} style={styles.name}>
        {game.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  name: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
});
