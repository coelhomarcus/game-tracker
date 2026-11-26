import type { FlashListRef } from '@shopify/flash-list';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  Button,
  CoverGrid,
  EmptyState,
  OptionSheet,
  Screen,
  Skeleton,
  TabBar,
  Text,
  TextField,
} from '@/components';
import { useMyFavorites } from '@/features/games/queries';
import { showToast } from '@/lib/toast';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { colors, hairline, radii, space, type GameStatus } from '@/theme/tokens';

import { buildLibraryOverview, type LibraryGroup, type LibraryOverview } from './groups';
import { useLibraryFilter } from './filterStore';
import { LibraryCard } from './LibraryCard';
import { SORT_OPTIONS, useLibraryPrefs, type LibrarySort } from './prefsStore';
import { useLibrary } from './queries';
import { STATUSES, statusLabel } from './status';

const EXPLORE_GAMES = '/explore?tab=games' as Href;

const SKELETON_COUNT = 8;
const SKELETON_ITEMS = Array.from({ length: SKELETON_COUNT }, (_, index) => String(index));
/** Covers are 3:4. */
const COVER_RATIO = 4 / 3;
const LIBRARY_MAX_WIDTH = 760;

type TabValue = GameStatus | 'all';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function summaryLine({ games, records, playingGames }: LibraryOverview['summary']): string {
  const parts = [plural(games, 'jogo', 'jogos'), plural(records, 'registro', 'registros')];
  if (playingGames > 0) parts.push(`${plural(playingGames, 'jogo', 'jogos')} em andamento`);
  return parts.join(' · ');
}

type HeaderProps = {
  summary: LibraryOverview['summary'];
  tabItems: { value: TabValue; label: string }[];
  status: GameStatus | null;
  query: string;
  platformLabel: string;
  filterActive: boolean;
  sortChanged: boolean;
  resultCount: number;
  onSelectTab: (value: TabValue) => void;
  onChangeQuery: (text: string) => void;
  onOpenPlatform: () => void;
  onOpenSort: () => void;
  onClear: () => void;
};

/**
 * Defined at module scope and rendered as an element: a component created inside the screen
 * would get a new identity on every keystroke, remounting the field and closing the keyboard.
 */
function LibraryHeader(props: HeaderProps) {
  const { games, records, playingGames } = props.summary;
  return (
    <View style={styles.header}>
      <View accessible accessibilityLabel={summaryLine(props.summary)} style={styles.summary}>
        <View style={styles.stat}>
          <Text size="_2xl" weight="bold" tone="high">{games}</Text>
          <Text size="sm" tone="medium">Jogos</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text size="_2xl" weight="bold" tone="high">{records}</Text>
          <Text size="sm" tone="medium">Registros</Text>
        </View>
        <View style={[styles.stat, styles.statDivider]}>
          <Text size="_2xl" weight="bold" style={styles.playingCount}>{playingGames}</Text>
          <Text size="sm" tone="medium">Jogando</Text>
        </View>
      </View>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <TextField
            label="Buscar na biblioteca"
            hideLabel
            placeholder="Buscar na biblioteca"
            leadingIcon="search-outline"
            returnKeyType="search"
            autoCapitalize="none"
            value={props.query}
            onChangeText={props.onChangeQuery}
          />
        </View>
        <Button
          accessibilityLabel="Ordenar"
          icon="swap-vertical-outline"
          shape="round"
          color={props.sortChanged ? 'primary' : 'secondary'}
          onPress={props.onOpenSort}
        />
      </View>
      <View style={styles.tabs}>
        <TabBar items={props.tabItems} selected={props.status ?? 'all'} onSelect={props.onSelectTab} />
      </View>
      <View style={styles.controls}>
        <Text accessibilityLiveRegion="polite" size="sm" tone="medium" weight="medium" style={styles.resultCount}>
          {plural(props.resultCount, 'jogo encontrado', 'jogos encontrados')}
        </Text>
        {props.filterActive ? <Button label="Limpar" size="tiny" variant="ghost" onPress={props.onClear} /> : null}
        <View style={styles.platform}>
          <Button label={props.platformLabel} icon="hardware-chip-outline" color="secondary" size="tiny" onPress={props.onOpenPlatform} />
        </View>
      </View>
    </View>
  );
}

export function LibraryScreen() {
  const { width } = useWindowDimensions();
  const minItemWidth = width >= 560 ? 138 : 104;
  const router = useRouter();
  const library = useLibrary();
  const favorites = useMyFavorites();
  const { query, status, platformKey } = useLibraryFilter();
  const sort = useLibraryPrefs((state) => state.sort);
  const [sheet, setSheet] = useState<'platform' | 'sort' | null>(null);
  const listRef = useRef<FlashListRef<LibraryGroup>>(null);
  useScrollToTopOnTabPress(listRef);

  const { data } = library;
  const overview = useMemo(
    () => buildLibraryOverview(data ?? [], { query, status, platformKey }, sort),
    [data, query, status, platformKey, sort],
  );

  const favoriteIds = useMemo(
    () => new Set((favorites.data ?? []).map((game) => game.id)),
    [favorites.data],
  );

  const openGame = useCallback(
    (igdbId: number) => router.push(`/games/${igdbId}?tab=progress`),
    [router],
  );
  // `refetch` resolves with the error instead of throwing, so both outcomes are handled.
  const refresh = useCallback(async () => {
    const failed = await library.refetch().then(
      (result) => result.isError,
      () => true,
    );
    if (failed) showToast('Não foi possível atualizar a biblioteca');
  }, [library]);
  const clear = useCallback(() => useLibraryFilter.getState().clear(), []);

  if (library.isPending) return <LibrarySkeleton minItemWidth={minItemWidth} />;

  if (library.isError && data === undefined) {
    return (
      <Screen>
        <EmptyState
          title="Não foi possível carregar a biblioteca"
          action={{ label: 'Tentar de novo', onPress: () => void library.refetch() }}
        />
      </Screen>
    );
  }

  const hasRecords = overview.summary.records > 0;
  const filterActive = query.trim() !== '' || status !== null || platformKey !== null;
  const activePlatform = overview.platforms.find((platform) => platform.key === platformKey);

  const tabItems: HeaderProps['tabItems'] = [
    { value: 'all', label: `Todos (${overview.totalGames})` },
    ...STATUSES.map((value) => ({
      value,
      label: `${statusLabel[value]} (${overview.statusCounts[value]})`,
    })),
  ];

  const header = hasRecords ? (
    <LibraryHeader
      summary={overview.summary}
      tabItems={tabItems}
      status={status}
      query={query}
      platformLabel={activePlatform?.label ?? 'Plataforma'}
      filterActive={filterActive}
      sortChanged={sort !== 'recent'}
      resultCount={overview.groups.length}
      onSelectTab={(value) => useLibraryFilter.getState().setStatus(value === 'all' ? null : value)}
      onChangeQuery={(text) => useLibraryFilter.getState().setQuery(text)}
      onOpenPlatform={() => setSheet('platform')}
      onOpenSort={() => setSheet('sort')}
      onClear={clear}
    />
  ) : null;

  const empty = hasRecords ? (
    <EmptyState
      icon="search-outline"
      title="Nenhum jogo com esses filtros"
      message="Tente outra busca ou limpe os filtros."
      action={{ label: 'Limpar filtros', onPress: clear }}
    />
  ) : (
    <EmptyState
      icon="library-outline"
      title="Sua biblioteca começa com um jogo"
      message="Adicione os jogos que você joga, quer jogar ou já zerou."
      action={{ label: 'Encontrar jogo', onPress: () => router.push(EXPLORE_GAMES) }}
    />
  );

  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<LibraryGroup>
          data={overview.groups}
          minItemWidth={minItemWidth}
          bottomInset={space.lg}
          keyExtractor={(group) => group.game.id}
          renderItem={(group, width) => (
            <LibraryCard
              detailed
              group={group}
              width={width}
              sort={sort}
              favorite={favoriteIds.has(group.game.id)}
              showStatus={status === null}
              onPress={openGame}
            />
          )}
          listRef={listRef}
          onRefresh={() => void refresh()}
          refreshing={library.isRefetching}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
        />
      </View>
      <OptionSheet<string | null>
        visible={sheet === 'platform'}
        title="Plataforma"
        options={[
          { value: null, label: 'Todas as plataformas' },
          ...overview.platforms.map((platform) => ({ value: platform.key, label: platform.label })),
        ]}
        selected={platformKey}
        onSelect={(value) => useLibraryFilter.getState().setPlatform(value)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet<LibrarySort>
        visible={sheet === 'sort'}
        title="Ordenar por"
        options={SORT_OPTIONS}
        selected={sort}
        onSelect={(value) => useLibraryPrefs.getState().setSort(value)}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

function LibrarySkeleton({ minItemWidth }: { minItemWidth: number }) {
  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<string>
          data={SKELETON_ITEMS}
          minItemWidth={minItemWidth}
          keyExtractor={(id) => id}
          ListHeaderComponent={(
            <View style={styles.skeletonHeader}>
              <Skeleton height={72} radius={radii.lg} />
              <Skeleton height={48} radius={radii.md} />
            </View>
          )}
          renderItem={(_, width) => (
            <Skeleton testID="library-skeleton" width={width} height={width * COVER_RATIO} radius={radii.sm} />
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, width: '100%', maxWidth: LIBRARY_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg },
  header: { paddingTop: space.lg, paddingBottom: space.sm },
  summary: {
    flexDirection: 'row',
    paddingVertical: space.md,
    borderRadius: radii.lg,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
  stat: { flex: 1, alignItems: 'center', gap: space._2xs, paddingHorizontal: space.xs },
  statDivider: { borderStartWidth: hairline, borderColor: colors.borderLow },
  playingCount: { color: colors.status.playing },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  search: { flex: 1, minWidth: 0 },
  // Tabs pad their own edges; pull them out to the screen edge so they scroll edge to edge.
  tabs: { marginHorizontal: -space.lg, marginTop: space.xs },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 48 },
  resultCount: { flex: 1 },
  platform: { maxWidth: '45%' },
  skeletonHeader: { gap: space.md, paddingTop: space.lg, paddingBottom: space._2xl },
});
