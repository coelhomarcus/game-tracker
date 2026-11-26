import { useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState, type ReactElement, type RefObject } from 'react';
import { ActivityIndicator, StyleSheet, View, type FlatList, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useComposedEventHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { EmptyState, Fab, FAB_BOTTOM, FAB_SIZE, Screen, Tabs } from '@/components';
import { useHideOnScroll } from '@/lib/useHideOnScroll';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { colors, space } from '@/theme/tokens';

import { HomeHeader, type HomeTab } from './HomeHeader';
import { PostFeedItemSkeleton } from './PostFeedItem';
import { PostList } from './PostList';
import { useActivities, useFeed } from './queries';
import type { FeedScope, Post } from './types';

const SKELETON_ROWS = ['0', '1', '2'];
/** The header's bar below the status bar, and the scope tabs under it (both 48 dp). */
const HEADER_BAR_HEIGHT = 48;
const TAB_BAR_HEIGHT = 48;

const COMPOSER = '/posts/new' as Href;
const EXPLORE_PEOPLE = '/explore?tab=people' as Href;

function FeedSkeleton() {
  return (
    <View>
      {SKELETON_ROWS.map((id, index) => (
        <PostFeedItemSkeleton key={id} testID="feed-skeleton-row" hideTopBorder={index === 0} />
      ))}
    </View>
  );
}

type HideOnScroll = ReturnType<typeof useHideOnScroll>;
type TimelineKey = FeedScope | `activities-${FeedScope}`;

const ACTIVITY_SCOPES = [
  { value: 'following', label: 'Seguindo', accessibilityLabel: 'Atividades de quem sigo' },
  { value: 'general', label: 'Todos' },
] satisfies { value: FeedScope; label: string; accessibilityLabel?: string }[];

type FeedProps = {
  /** The screen's handle on the list of the scope showing now (title and tab presses scroll it). */
  listRef: RefObject<FlatList<Post> | null>;
  /** Drives the header that floats over the list. */
  hideOnScroll: HideOnScroll['scrollHandler'];
  /** Height of that header: the list starts below it. */
  headerHeight: number;
  /** The screen remembers each scope's scroll offset across the remounts of its list. */
  getOffset: (scope: TimelineKey) => number;
  setOffset: (scope: TimelineKey, offset: number) => void;
};

/**
 * Keyed by scope in `HomeScreen`: only the selected scope's query is active. Re-selecting a
 * loaded scope shows its cached posts instantly and refetches in the background, and the list
 * returns to the offset the user left it at.
 */
function Timeline({ channel, query, empty, header, listRef, hideOnScroll, headerHeight, getOffset, setOffset }: FeedProps & {
  channel: TimelineKey;
  query: ReturnType<typeof useFeed>;
  empty: ReactElement;
  header?: ReactElement;
}) {
  const activity = header !== undefined;
  const restored = useRef(false);

  // Cached posts are laid out in one pass: put the list back where this scope was left.
  const restoreOffset = (_width: number, height: number) => {
    if (restored.current) return;
    const offset = getOffset(channel);
    // Items render in batches: wait until the content reaches the saved offset.
    if (offset > 0 && height <= offset) return;
    restored.current = true;
    if (offset > 0) listRef.current?.scrollToOffset({ offset, animated: false });
  };
  // Scroll events before the restore would overwrite the saved offset with the initial 0.
  const rememberOffset = useCallback(
    (offset: number) => {
      if (restored.current) setOffset(channel, offset);
    },
    [channel, setOffset],
  );
  // Scroll events arrive on the UI thread for the header; the offset is kept on the JS side.
  const offsetHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scheduleOnRN(rememberOffset, event.contentOffset.y);
    },
  });
  const onScroll = useComposedEventHandler([hideOnScroll, offsetHandler]);

  let state = empty;
  if (query.isPending) {
    state = activity ? (
      <ActivityIndicator accessibilityLabel="Carregando atividades" style={styles.loading} color={colors.primary} />
    ) : <FeedSkeleton />;
  } else if (query.isError && query.data === undefined) {
    state = (
      <EmptyState
        title={activity ? 'Não foi possível carregar as atividades' : 'Não foi possível carregar o feed'}
        action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
      />
    );
  }

  return (
    <PostList
      ref={listRef}
      query={query}
      activityTimeline={activity}
      ListHeaderComponent={header}
      ListEmptyComponent={state}
      topInset={headerHeight}
      bottomInset={activity ? space._2xl : FAB_SIZE + 2 * FAB_BOTTOM}
      onScroll={onScroll}
      onContentSizeChange={restoreOffset}
    />
  );
}

function Feed({ scope, ...props }: FeedProps & { scope: FeedScope }) {
  const router = useRouter();
  const query = useFeed(scope);
  const empty = scope === 'general' ? (
      <EmptyState
        title="Ainda não há publicações"
        message="Seja a primeira pessoa a publicar."
        action={{ label: 'Publicar', onPress: () => router.push(COMPOSER) }}
      />
    ) : (
      <EmptyState
        title="Acompanhe quem joga com você"
        message="As publicações de quem você segue aparecem aqui."
        action={{ label: 'Encontrar pessoas', onPress: () => router.push(EXPLORE_PEOPLE) }}
      />
    );
  return <Timeline {...props} channel={scope} query={query} empty={empty} />;
}

function HomeActivities({ scope, onSelect, ...props }: FeedProps & { scope: FeedScope; onSelect: (scope: FeedScope) => void }) {
  const query = useActivities({ kind: 'home', scope });
  return (
    <Timeline
      {...props}
      channel={`activities-${scope}`}
      query={query}
      header={<View style={styles.activityFilters}><Tabs items={ACTIVITY_SCOPES} selected={scope} onSelect={onSelect} /></View>}
      empty={<EmptyState title="Nenhuma atividade ainda" message={scope === 'following' ? 'Os registros de quem você segue aparecem aqui.' : undefined} />}
    />
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<HomeTab>('general');
  const [activityScope, setActivityScope] = useState<FeedScope>('following');
  const offsets = useRef<Partial<Record<TimelineKey, number>>>({});
  const getOffset = useCallback((key: TimelineKey) => offsets.current[key] ?? 0, []);
  const setOffset = useCallback((key: TimelineKey, offset: number) => {
    offsets.current[key] = offset;
  }, []);

  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Post>>(null);
  // Until the header is measured, assume its bar and tab row so the first frame does not jump.
  const [headerHeight, setHeaderHeight] = useState(() => insets.top + HEADER_BAR_HEIGHT + TAB_BAR_HEIGHT);
  const { scrollHandler, headerStyle, reveal } = useHideOnScroll(headerHeight);
  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  useScrollToTopOnTabPress(listRef, reveal);
  const scrollToTop = useCallback(() => {
    reveal();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [reveal]);
  const feedProps = { listRef, hideOnScroll: scrollHandler, headerHeight, getOffset, setOffset };

  return (
    <Screen>
      <View style={styles.page}>
        {/* First in the tree so the screen reader reaches the header before the feed. */}
        <Animated.View testID="home-header-float" onLayout={measureHeader} style={[styles.header, headerStyle]}>
          <HomeHeader scope={scope} onSelectScope={setScope} onScrollToTop={scrollToTop} />
        </Animated.View>
        {/* The status bar strip stays solid while the header is hidden, as in the design reference. */}
        <View
          testID="status-bar-scrim"
          pointerEvents="none"
          style={[styles.statusBarScrim, { height: insets.top }]}
        />
        {scope === 'activities' ? (
          <HomeActivities key={`activities-${activityScope}`} {...feedProps} scope={activityScope} onSelect={setActivityScope} />
        ) : (
          <>
            <Feed key={scope} {...feedProps} scope={scope} />
            <Fab accessibilityLabel="Publicar" onPress={() => router.push(COMPOSER)} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  activityFilters: { flexDirection: 'row', paddingVertical: space.md },
  loading: { marginVertical: space._2xl },
  // Floats over the list, which pads its content by the header's measured height.
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  // Over the header too, so the header slides out beneath it.
  statusBarScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    backgroundColor: colors.bg,
  },
});
