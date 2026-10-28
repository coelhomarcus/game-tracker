import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Button, GameCover, Skeleton, Text } from '@/components';
import { useTrendingGames } from '@/features/games/queries';
import type { TrendingGame } from '@/features/games/types';
import { space } from '@/theme/tokens';

import { ExploreSection } from './ExploreSection';

const COVER_WIDTH = 100;
const COVER_HEIGHT = 133;
const SKELETON_ITEMS = ['a', 'b', 'c', 'd'];

export function entryCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'registro' : 'registros'}`;
}

function TrendingItem({ item, onPress }: { item: TrendingGame; onPress: () => void }) {
  const count = entryCountLabel(item.entryCount);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.game.name}, ${count}`}
      onPress={onPress}
      style={styles.item}
    >
      <GameCover decorative name={item.game.name} url={item.game.coverUrl} width={COVER_WIDTH} />
      <Text size="sm" tone="high" numberOfLines={2}>
        {item.game.name}
      </Text>
      <Text size="xs" tone="medium" numberOfLines={1}>
        {count}
      </Text>
    </Pressable>
  );
}

function TrendingSkeleton() {
  return (
    <View testID="trending-skeleton" style={styles.row}>
      {SKELETON_ITEMS.map((id) => (
        <View key={id} style={styles.item}>
          <Skeleton width={COVER_WIDTH} height={COVER_HEIGHT} />
          <Skeleton.Text size="sm" width="90%" />
          <Skeleton.Text size="xs" width="60%" />
        </View>
      ))}
    </View>
  );
}

/**
 * "Em alta": the games with the most entries this week, as a row of covers. Without any (a quiet
 * week, a new server) the module is left out.
 */
export function TrendingGames({ onOpenGame }: { onOpenGame: (igdbId: number) => void }) {
  const trending = useTrendingGames();

  let body;
  if (trending.isPending) {
    body = <TrendingSkeleton />;
  } else if (trending.isError) {
    body = (
      <View style={styles.error}>
        <Text size="sm" tone="medium">
          Não foi possível carregar os jogos em alta.
        </Text>
        <Button
          label="Tentar de novo"
          color="secondary"
          size="small"
          onPress={() => void trending.refetch()}
        />
      </View>
    );
  } else if (trending.data.length === 0) {
    return null;
  } else {
    body = (
      <FlatList
        horizontal
        testID="trending-games"
        data={trending.data}
        keyExtractor={(item) => item.game.id}
        renderItem={({ item }) => (
          <TrendingItem item={item} onPress={() => onOpenGame(item.game.igdbId)} />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      />
    );
  }

  return <ExploreSection title="Em alta">{body}</ExploreSection>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg },
  item: { width: COVER_WIDTH, gap: space.xs },
  error: { alignItems: 'flex-start', gap: space.sm, paddingHorizontal: space.lg },
});
