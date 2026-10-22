import type { FlashListRef } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { CoverGrid, EmptyState, GameCover, Tabs, Text } from '@/components';
import type { Game } from '@/features/games/types';
import { buildLibraryOverview, type LibraryGroup } from '@/features/library/groups';
import { LibraryCard } from '@/features/library/LibraryCard';
import { STATUSES, statusLabel } from '@/features/library/status';
import { colors, space, type GameStatus } from '@/theme/tokens';

import { refreshAll, ScrollToTopOnTabPress, type Refetch } from './profileList';
import { useUserEntries, useUserFavorites } from './queries';

const FAVORITE_COVER_WIDTH = 80;

type StatusTab = GameStatus | 'all';

export type ProfileGamesProps = {
  userId: string;
  own: boolean;
  /** Profile header and tabs, shown above the collection. */
  top: ReactElement;
  /** Whether this is the Perfil tab itself, so pressing its button scrolls back to the top. */
  tabRoot: boolean;
  refetchProfile: Refetch;
};

type FavoritesProps = { games: Game[]; onPress: (igdbId: number) => void };

function Favorites({ games, onPress }: FavoritesProps) {
  if (games.length === 0) return null;
  return (
    <View style={styles.favorites}>
      <Text accessibilityRole="header" size="xl" weight="bold" tone="high" style={styles.sectionTitle}>
        Favoritos
      </Text>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={games}
        keyExtractor={(game) => game.id}
        contentContainerStyle={styles.favoritesRow}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.name}
            onPress={() => onPress(item.igdbId)}
          >
            <GameCover decorative name={item.name} url={item.coverUrl} width={FAVORITE_COVER_WIDTH} />
          </Pressable>
        )}
      />
    </View>
  );
}

/** The collection of a user: favorites, a tab per status and a grid of covers. */
export function ProfileGames({ userId, own, top, tabRoot, refetchProfile }: ProfileGamesProps) {
  const router = useRouter();
  const entries = useUserEntries(userId);
  const favorites = useUserFavorites(userId);
  const [status, setStatus] = useState<GameStatus | null>(null);
  const [pulling, setPulling] = useState(false);
  const listRef = useRef<FlashListRef<LibraryGroup>>(null);
  const { data, refetch: refetchEntries } = entries;
  const { refetch: refetchFavorites } = favorites;

  const overview = useMemo(
    () => buildLibraryOverview(data ?? [], { query: '', status, platformKey: null }, 'recent'),
    [data, status],
  );

  const openGame = useCallback((igdbId: number) => router.push(`/games/${igdbId}`), [router]);
  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      await refreshAll([refetchProfile, () => refetchEntries(), () => refetchFavorites()]);
    } finally {
      setPulling(false);
    }
  }, [refetchProfile, refetchEntries, refetchFavorites]);

  const hasEntries = (data?.length ?? 0) > 0;
  const tabItems: { value: StatusTab; label: string }[] = [
    { value: 'all', label: `Todos (${overview.totalGames})` },
    ...STATUSES.map((value) => ({
      value,
      label: `${statusLabel[value]} (${overview.statusCounts[value]})`,
    })),
  ];

  const header = (
    <View style={styles.header}>
      {top}
      <Favorites games={favorites.data ?? []} onPress={openGame} />
      {hasEntries ? (
        <View style={styles.statusTabs}>
          <Tabs<StatusTab>
            items={tabItems}
            selected={status ?? 'all'}
            onSelect={(value) => setStatus(value === 'all' ? null : value)}
          />
        </View>
      ) : null}
    </View>
  );

  let empty: ReactElement;
  if (data === undefined) {
    empty = entries.isError ? (
      <EmptyState
        title="Não foi possível carregar os jogos"
        action={{ label: 'Tentar de novo', onPress: () => void refetchEntries() }}
      />
    ) : (
      <View style={styles.loading}>
        <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
      </View>
    );
  } else if (!hasEntries) {
    empty = own ? (
      <EmptyState title="Sua coleção está vazia" message="Adicione jogos na Biblioteca." />
    ) : (
      <EmptyState title="Coleção vazia" message="Esta pessoa ainda não registrou jogos." />
    );
  } else {
    empty = <EmptyState title="Nenhum jogo neste status." />;
  }

  return (
    <>
      <CoverGrid<LibraryGroup>
        data={overview.groups}
        keyExtractor={(group) => group.game.id}
        renderItem={(group, width) => (
          <LibraryCard
            group={group}
            width={width}
            sort="recent"
            favorite={false}
            showStatus={status === null}
            onPress={openGame}
          />
        )}
        inset={space.lg}
        listRef={listRef}
        onRefresh={() => void refresh()}
        refreshing={pulling}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
      />
      {tabRoot ? <ScrollToTopOnTabPress listRef={listRef} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  // The grid pads its content by `space.lg`; the profile header reaches the screen edges.
  header: { marginHorizontal: -space.lg, gap: space.md, paddingBottom: space.md },
  favorites: { gap: space.sm },
  sectionTitle: { paddingHorizontal: space.lg },
  favoritesRow: { gap: space.sm, paddingHorizontal: space.lg },
  statusTabs: { paddingTop: space.xs },
  loading: { padding: space._2xl, alignItems: 'center' },
});
