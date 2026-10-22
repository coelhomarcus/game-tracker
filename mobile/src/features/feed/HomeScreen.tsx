import { useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState, type RefObject } from 'react';
import { StyleSheet, View, type FlatList, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedScrollHandler, useComposedEventHandler } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EmptyState, Fab, FAB_BOTTOM, FAB_SIZE, Screen, Skeleton } from '@/components';
import { useHideOnScroll } from '@/lib/useHideOnScroll';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { radii, space } from '@/theme/tokens';

import { HomeHeader } from './HomeHeader';
import { PostList } from './PostList';
import { useFeed } from './queries';
import type { FeedScope, Post } from './types';

const SKELETON_ROWS = ['0', '1', '2'];
const AVATAR_SIZE = 40;

const COMPOSER = '/posts/new' as Href;
const EXPLORE_PEOPLE = '/explore?tab=people' as Href;

function FeedSkeleton() {
  return (
    <View style={styles.skeleton}>
      {SKELETON_ROWS.map((id) => (
        <View key={id} testID="feed-skeleton-row" style={styles.skeletonRow}>
          <Skeleton width={AVATAR_SIZE} height={AVATAR_SIZE} radius={AVATAR_SIZE / 2} />
          <View style={styles.skeletonText}>
            <Skeleton width="40%" height={14} radius={radii.xs} />
            <Skeleton height={14} radius={radii.xs} />
          </View>
        </View>
      ))}
    </View>
  );
}

type HideOnScroll = ReturnType<typeof useHideOnScroll>;

type FeedProps = {
  scope: FeedScope;
  /** The screen's handle on the list of the scope showing now (title and tab presses scroll it). */
  listRef: RefObject<FlatList<Post> | null>;
  /** Drives the header that floats over the list. */
  hideOnScroll: HideOnScroll['scrollHandler'];
  /** Height of that header: the list starts below it. */
  headerHeight: number;
  /** The screen remembers each scope's scroll offset across the remounts of its list. */
  getOffset: (scope: FeedScope) => number;
  setOffset: (scope: FeedScope, offset: number) => void;
};

/**
 * Keyed by scope in `HomeScreen`: only the selected scope's query is active. Re-selecting a
 * loaded scope shows its cached posts instantly and refetches in the background, and the list
 * returns to the offset the user left it at.
 */
function Feed({ scope, listRef, hideOnScroll, headerHeight, getOffset, setOffset }: FeedProps) {
  const router = useRouter();
  const query = useFeed(scope);
  const restored = useRef(false);

  // Cached posts are laid out in one pass: put the list back where this scope was left.
  const restoreOffset = (_width: number, height: number) => {
    if (restored.current) return;
    const offset = getOffset(scope);
    // Items render in batches: wait until the content reaches the saved offset.
    if (offset > 0 && height <= offset) return;
    restored.current = true;
    if (offset > 0) listRef.current?.scrollToOffset({ offset, animated: false });
  };
  // Scroll events before the restore would overwrite the saved offset with the initial 0.
  const rememberOffset = useCallback(
    (offset: number) => {
      if (restored.current) setOffset(scope, offset);
    },
    [scope, setOffset],
  );
  // Scroll events arrive on the UI thread for the header; the offset is kept on the JS side.
  const offsetHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scheduleOnRN(rememberOffset, event.contentOffset.y);
    },
  });
  const onScroll = useComposedEventHandler([hideOnScroll, offsetHandler]);

  let empty;
  if (query.isPending) {
    empty = <FeedSkeleton />;
  } else if (query.isError && query.data === undefined) {
    empty = (
      <EmptyState
        title="Não foi possível carregar o feed"
        action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
      />
    );
  } else if (scope === 'general') {
    empty = (
      <EmptyState
        title="Ainda não há publicações"
        message="Seja a primeira pessoa a publicar."
        action={{ label: 'Publicar', onPress: () => router.push(COMPOSER) }}
      />
    );
  } else {
    empty = (
      <EmptyState
        title="Acompanhe quem joga com você"
        message="Quando quem você segue publicar ou jogar algo, aparece aqui."
        action={{ label: 'Encontrar pessoas', onPress: () => router.push(EXPLORE_PEOPLE) }}
      />
    );
  }

  return (
    <PostList
      ref={listRef}
      query={query}
      ListEmptyComponent={empty}
      topInset={headerHeight}
      bottomInset={FAB_SIZE + 2 * FAB_BOTTOM}
      onScroll={onScroll}
      onContentSizeChange={restoreOffset}
    />
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<FeedScope>('general');
  const offsets = useRef<Record<FeedScope, number>>({ general: 0, following: 0 });
  const getOffset = useCallback((key: FeedScope) => offsets.current[key], []);
  const setOffset = useCallback((key: FeedScope, offset: number) => {
    offsets.current[key] = offset;
  }, []);

  const listRef = useRef<FlatList<Post>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const { scrollHandler, headerStyle, reveal } = useHideOnScroll(headerHeight);
  const measureHeader = useCallback((event: LayoutChangeEvent) => {
    setHeaderHeight(Math.round(event.nativeEvent.layout.height));
  }, []);

  useScrollToTopOnTabPress(listRef, reveal);
  const scrollToTop = useCallback(() => {
    reveal();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [reveal]);

  return (
    <Screen>
      <View style={styles.page}>
        <Feed
          key={scope}
          scope={scope}
          listRef={listRef}
          hideOnScroll={scrollHandler}
          headerHeight={headerHeight}
          getOffset={getOffset}
          setOffset={setOffset}
        />
        <Animated.View testID="home-header-float" onLayout={measureHeader} style={[styles.header, headerStyle]}>
          <HomeHeader scope={scope} onSelectScope={setScope} onScrollToTop={scrollToTop} />
        </Animated.View>
        <Fab accessibilityLabel="Publicar" onPress={() => router.push(COMPOSER)} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  // Floats over the list, which pads its content by the header's measured height.
  header: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 },
  skeleton: { gap: space.lg },
  skeletonRow: { flexDirection: 'row', gap: space.md },
  skeletonText: { flex: 1, gap: space.sm },
});
