import type { FlashListRef } from '@shopify/flash-list';
import { useMemo, useRef, type ReactElement, type RefObject } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import {
  CoverFooter,
  CoverGrid,
  EmptyState,
  ErrorState,
  GameCover,
  TabBar,
  Text,
} from '@/components';
import { PostFeedItemSkeleton } from '@/features/feed/PostFeedItem';
import { PostList } from '@/features/feed/PostList';
import { usePostSearch } from '@/features/feed/queries';
import type { Post } from '@/features/feed/types';
import { useGameSearch } from '@/features/games/queries';
import type { GameSummary } from '@/features/games/types';
import { useLibrary } from '@/features/library/queries';
import { PersonRow } from '@/features/profiles/PersonRow';
import { usePeopleSearch } from '@/features/profiles/queries';
import type { PersonResult } from '@/features/profiles/types';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { colors, space } from '@/theme/tokens';

export type ResultTab = 'games' | 'people' | 'posts';

export const RESULT_TABS: { value: ResultTab; label: string }[] = [
  { value: 'games', label: 'Jogos' },
  { value: 'people', label: 'Pessoas' },
  { value: 'posts', label: 'Posts' },
];

/** The people search takes at most this many characters. */
const PEOPLE_MAX_LENGTH = 50;
const MIN_ITEM_WIDTH = 110;
const POST_SKELETON_ROWS = ['a', 'b', 'c'];

export function noResults(term: string): string {
  return `Nenhum resultado para '${term.trim()}'`;
}

type Scrollable = { scrollToOffset(params: { offset: number; animated?: boolean }): void };

type SearchState = {
  isError: boolean;
  isPending: boolean;
  isPlaceholderData: boolean;
  refetch: () => unknown;
};

/** What a results list shows when it has no rows: the failure, nothing while loading, or the empty line. */
function emptyFor(search: SearchState, term: string, loading: ReactElement | null = null) {
  if (search.isError) {
    return (
      <ErrorState
        title="Não foi possível buscar agora"
        onRetry={() => void search.refetch()}
      />
    );
  }
  // Still waiting on the debounce or on the first response: the spinner says it.
  if (search.isPending || search.isPlaceholderData) return loading;
  return <EmptyState title={noResults(term)} />;
}

function Busy({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.busy}>
      <ActivityIndicator accessibilityLabel="Buscando" color={colors.textMedium} />
    </View>
  );
}

type CardProps = {
  game: GameSummary;
  width: number;
  inLibrary: boolean;
  onPress: (game: GameSummary) => void;
};

function GameCard({ game, width, inLibrary, onPress }: CardProps) {
  const footer = inLibrary ? 'Na biblioteca' : (game.platforms[0] ?? 'Plataformas não informadas');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game.name}, ${footer}`}
      onPress={() => onPress(game)}
      style={[styles.card, { width }]}
    >
      <GameCover decorative name={game.name} url={game.coverUrl} width={width} />
      <Text size="sm" numberOfLines={2}>
        {game.name}
      </Text>
      <CoverFooter>{footer}</CoverFooter>
    </Pressable>
  );
}

type PanelProps<T, R> = {
  term: string;
  onOpen: (item: T) => void;
  listRef: RefObject<R | null>;
};

function GameResults({ term, onOpen, listRef }: PanelProps<GameSummary, FlashListRef<GameSummary>>) {
  useScrollToTopOnTabPress(listRef);
  const search = useGameSearch(term);
  const library = useLibrary();
  const libraryIds = useMemo(
    () => new Set((library.data ?? []).map((entry) => entry.game.igdbId)),
    [library.data],
  );

  return (
    <View style={styles.page}>
      <CoverGrid<GameSummary>
        data={search.data ?? []}
        keyExtractor={(game) => String(game.igdbId)}
        minItemWidth={MIN_ITEM_WIDTH}
        listRef={listRef}
        renderItem={(game, width) => (
          <GameCard
            game={game}
            width={width}
            inLibrary={libraryIds.has(game.igdbId)}
            onPress={onOpen}
          />
        )}
        ListHeaderComponent={<Busy visible={search.isFetching} />}
        ListEmptyComponent={emptyFor(search, term) ?? undefined}
      />
    </View>
  );
}

function PeopleResults({ term, onOpen, listRef }: PanelProps<PersonResult, FlatList<PersonResult>>) {
  useScrollToTopOnTabPress(listRef);
  const search = usePeopleSearch(term.trim().slice(0, PEOPLE_MAX_LENGTH));

  return (
    <FlatList
      ref={listRef}
      testID="people-results"
      data={search.data ?? []}
      keyExtractor={(person) => person.id}
      renderItem={({ item }) => <PersonRow person={item} onPress={() => onOpen(item)} />}
      ListHeaderComponent={<Busy visible={search.isFetching} />}
      ListEmptyComponent={emptyFor(search, term) ?? undefined}
      keyboardShouldPersistTaps="handled"
    />
  );
}

function PostResults({ term, onOpen, listRef }: PanelProps<Post, FlatList<Post>>) {
  useScrollToTopOnTabPress(listRef);
  const search = usePostSearch(term);

  const loading = (
    <View>
      {POST_SKELETON_ROWS.map((id, index) => (
        <PostFeedItemSkeleton key={id} testID="post-search-skeleton" hideTopBorder={index === 0} />
      ))}
    </View>
  );

  return (
    <PostList
      ref={listRef}
      query={search}
      onPressPost={onOpen}
      ListHeaderComponent={<Busy visible={search.isFetching && !search.isFetchingNextPage} />}
      ListEmptyComponent={emptyFor(search, term, search.isPending ? loading : null) ?? undefined}
    />
  );
}

export type ExploreResultsProps = {
  /** The typed term, at least 2 characters once trimmed. */
  term: string;
  tab: ResultTab;
  onChangeTab: (tab: ResultTab) => void;
  onOpenGame: (game: GameSummary) => void;
  onOpenPerson: (person: PersonResult) => void;
  onOpenPost: (post: Post) => void;
};

/**
 * The results of the term in three tabs. Each tab asks only for its own results, under a key per
 * term, so coming back to a tab shows what it found without asking again.
 */
export function ExploreResults({
  term,
  tab,
  onChangeTab,
  onOpenGame,
  onOpenPerson,
  onOpenPost,
}: ExploreResultsProps) {
  const gamesRef = useRef<FlashListRef<GameSummary>>(null);
  const peopleRef = useRef<FlatList<PersonResult>>(null);
  const postsRef = useRef<FlatList<Post>>(null);
  const lists: Record<ResultTab, RefObject<Scrollable | null>> = {
    games: gamesRef,
    people: peopleRef,
    posts: postsRef,
  };
  return (
    <View style={styles.fill}>
      <TabBar
        items={RESULT_TABS}
        selected={tab}
        onSelect={onChangeTab}
        onReselect={() => lists[tab].current?.scrollToOffset({ offset: 0, animated: true })}
      />
      {tab === 'people' ? (
        <PeopleResults term={term} onOpen={onOpenPerson} listRef={peopleRef} />
      ) : tab === 'posts' ? (
        <PostResults term={term} onOpen={onOpenPost} listRef={postsRef} />
      ) : (
        <GameResults term={term} onOpen={onOpenGame} listRef={gamesRef} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flex: 1, paddingHorizontal: space.lg },
  card: { gap: space.xs },
  busy: { alignItems: 'center', paddingVertical: space.sm },
});
