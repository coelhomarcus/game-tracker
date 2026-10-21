import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Button,
  CoverGrid,
  EmptyState,
  OptionSheet,
  Screen,
  Skeleton,
  Tabs,
  TextField,
} from '@/components';
import { useMyFavorites } from '@/features/games/queries';
import { colors, fontSize, radii, space, type GameStatus } from '@/theme/tokens';

import { buildLibraryOverview, type LibraryGroup, type LibraryOverview } from './groups';
import { useLibraryFilter } from './filterStore';
import { LibraryCard } from './LibraryCard';
import { useLibraryPrefs, type LibrarySort } from './prefsStore';
import { useLibrary } from './queries';
import { STATUSES, statusLabel } from './status';

const SKELETON_COUNT = 8;
const SKELETON_ITEMS = Array.from({ length: SKELETON_COUNT }, (_, index) => String(index));
/** Covers are 3:4. */
const COVER_RATIO = 4 / 3;

const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Adicionados recentemente' },
  { value: 'oldest', label: 'Adicionados há mais tempo' },
  { value: 'mostPlayed', label: 'Mais horas registradas' },
  { value: 'rating', label: 'Minha nota' },
  { value: 'name', label: 'Nome A–Z' },
];

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
  summary: string;
  tabItems: { value: TabValue; label: string }[];
  status: GameStatus | null;
  query: string;
  platformLabel: string;
  filterActive: boolean;
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
  return (
    <View style={styles.header}>
      <Text style={styles.summary}>{props.summary}</Text>
      <View style={styles.tabs}>
        <Tabs items={props.tabItems} selected={props.status ?? 'all'} onSelect={props.onSelectTab} />
      </View>
      <TextField label="Buscar na biblioteca" value={props.query} onChangeText={props.onChangeQuery} />
      <View style={styles.controls}>
        <View style={styles.control}>
          <Button label={props.platformLabel} variant="secondary" onPress={props.onOpenPlatform} />
        </View>
        <View style={styles.control}>
          <Button label="Ordenar" variant="secondary" onPress={props.onOpenSort} />
        </View>
        {props.filterActive ? <Button label="Limpar" variant="text" onPress={props.onClear} /> : null}
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.count}>
        {plural(props.resultCount, 'jogo encontrado', 'jogos encontrados')}
      </Text>
    </View>
  );
}

export function LibraryScreen() {
  const router = useRouter();
  const library = useLibrary();
  const favorites = useMyFavorites();
  const { query, status, platformKey } = useLibraryFilter();
  const sort = useLibraryPrefs((state) => state.sort);
  const [sheet, setSheet] = useState<'platform' | 'sort' | null>(null);

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
    // The game route is added by a later task, so it is not in the typed routes yet.
    (igdbId: number) => router.push(`/games/${igdbId}?tab=progress` as Href),
    [router],
  );
  const clear = useCallback(() => useLibraryFilter.getState().clear(), []);

  if (library.isPending) return <LibrarySkeleton />;

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
      summary={summaryLine(overview.summary)}
      tabItems={tabItems}
      status={status}
      query={query}
      platformLabel={activePlatform?.label ?? 'Plataforma'}
      filterActive={filterActive}
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
      title="Nenhum jogo com esses filtros"
      message="Tente outra busca ou limpe os filtros."
      action={{ label: 'Limpar filtros', onPress: clear }}
    />
  ) : (
    <EmptyState
      title="Sua biblioteca começa com um jogo"
      message="Adicione os jogos que você joga, quer jogar ou já zerou."
      action={{ label: 'Encontrar jogo', onPress: () => router.push('/explore') }}
    />
  );

  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<LibraryGroup>
          data={overview.groups}
          keyExtractor={(group) => group.game.id}
          renderItem={(group, width) => (
            <LibraryCard
              group={group}
              width={width}
              sort={sort}
              favorite={favoriteIds.has(group.game.id)}
              showStatus={status === null}
              onPress={openGame}
            />
          )}
          onRefresh={() => void library.refetch()}
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

function LibrarySkeleton() {
  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<string>
          data={SKELETON_ITEMS}
          keyExtractor={(id) => id}
          renderItem={(_, width) => (
            <Skeleton testID="library-skeleton" width={width} height={width * COVER_RATIO} radius={radii.cover} />
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg },
  header: { gap: space.md, paddingBottom: space.md },
  summary: { color: colors.textMuted, fontSize: fontSize.sm },
  // Tabs pad their own edges; pull them out to the screen edge so they scroll edge to edge.
  tabs: { marginHorizontal: -space.lg },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  control: { flex: 1 },
  count: { color: colors.textMuted, fontSize: fontSize.sm },
});
