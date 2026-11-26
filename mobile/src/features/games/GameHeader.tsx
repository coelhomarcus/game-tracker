import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Button, GameCover, Text } from '@/components';
import { haptic } from '@/lib/haptics';
import { colors, hairline, radii, space } from '@/theme/tokens';

import type { Game } from './types';
import { useGameBackdrop } from './useGameBackdrop';

const COVER_WIDTH = 106;
const COVER_OVERLAP = 46;

type GameHeaderProps = {
  game: Game;
  recordLabel?: string;
  onCreateRecord: () => void;
  onToggleFavorite: () => void;
};

export function GameHeader({ game, recordLabel, onCreateRecord, onToggleFavorite }: GameHeaderProps) {
  const { uri, isScreenshot, onError } = useGameBackdrop(game);

  return (
    <View style={styles.header}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.banner, uri === null && styles.bannerEmpty]}
      >
        {uri !== null ? (
          <Image
            key={uri}
            source={{ uri }}
            resizeMode="cover"
            blurRadius={isScreenshot ? 0 : 16}
            style={[StyleSheet.absoluteFill, styles.bannerArt, !isScreenshot && styles.blurredCover]}
            onError={onError}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.bannerFade]} />
      </View>
      <View style={styles.body}>
        <View style={styles.identity}>
          <View style={styles.cover}>
            <GameCover name={game.name} url={game.coverUrl} width={COVER_WIDTH} />
          </View>
          <View style={styles.title}>
            <Text accessibilityRole="header" size="_4xl" weight="bold" tone="high" leading="tight">
              {game.name}
            </Text>
            {game.platforms.length > 0 ? (
              <Text size="sm" tone="medium" numberOfLines={2}>{game.platforms.join(' · ')}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actions}>
          {recordLabel ? (
            <View style={styles.recordAction}>
              <Button label={recordLabel} icon="add" onPress={onCreateRecord} />
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={game.isFavoritedByMe ? 'Remover dos favoritos' : 'Favoritar'}
            onPress={() => {
              haptic('tap');
              onToggleFavorite();
            }}
            style={({ pressed }) => [styles.favorite, game.isFavoritedByMe && styles.favoriteSelected, pressed && styles.favoritePressed]}
          >
            <Ionicons
              name={game.isFavoritedByMe ? 'heart' : 'heart-outline'}
              size={23}
              color={game.isFavoritedByMe ? colors.primary : colors.text}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: space.md },
  banner: {
    aspectRatio: 3,
    minHeight: 136,
    maxHeight: 216,
    overflow: 'hidden',
    backgroundColor: colors.bgContrast50,
  },
  bannerEmpty: { height: 72, minHeight: 0, aspectRatio: undefined },
  bannerArt: { width: '100%', height: '100%', opacity: 0.9 },
  blurredCover: { opacity: 0.42 },
  bannerFade: {
    backgroundImage: `linear-gradient(to bottom, ${colors.bgTransparent} 25%, ${colors.bg} 100%)`,
  },
  body: { paddingHorizontal: space.lg, gap: space.lg },
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginTop: -COVER_OVERLAP },
  cover: {
    padding: 2,
    borderRadius: radii.md,
    backgroundColor: colors.bg,
  },
  title: { flex: 1, minWidth: 0, gap: space.xs, paddingTop: COVER_OVERLAP + space.xs },
  actions: { flexDirection: 'row', gap: space.sm, maxWidth: 420 },
  recordAction: { flex: 1, minWidth: 0 },
  favorite: {
    width: 48,
    height: 48,
    borderRadius: radii.full,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteSelected: { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}18` },
  favoritePressed: { opacity: 0.72 },
});
