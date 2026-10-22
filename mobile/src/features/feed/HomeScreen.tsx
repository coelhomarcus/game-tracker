import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { EmptyState, Screen, Skeleton, Tabs } from '@/components';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { colors, radii, space } from '@/theme/tokens';

import { PostList } from './PostList';
import { useFeed } from './queries';
import type { FeedScope, Post } from './types';

const SCOPES: { value: FeedScope; label: string }[] = [
  { value: 'general', label: 'Para você' },
  { value: 'following', label: 'Seguindo' },
];
const SKELETON_ROWS = ['0', '1', '2'];
const FAB_SIZE = 56;
const AVATAR_SIZE = 40;

const COMPOSER = '/posts/new' as Href;
const EXPLORE_PEOPLE = '/explore?tab=people' as Href;

type HeaderProps = { scope: FeedScope; onSelect: (scope: FeedScope) => void };

/** Module scope: the list receives it as an element, so its identity never changes. */
function FeedHeader({ scope, onSelect }: HeaderProps) {
  return (
    <View style={styles.header}>
      <Tabs items={SCOPES} selected={scope} onSelect={onSelect} />
    </View>
  );
}

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

type FeedProps = HeaderProps & {
  /** The screen remembers each scope's scroll offset across the remounts of its list. */
  getOffset: (scope: FeedScope) => number;
  setOffset: (scope: FeedScope, offset: number) => void;
};

/**
 * Keyed by scope in `HomeScreen`: only the selected scope's query is active. Re-selecting a
 * loaded scope shows its cached posts instantly and refetches in the background, and the list
 * returns to the offset the user left it at.
 */
function Feed({ scope, onSelect, getOffset, setOffset }: FeedProps) {
  const router = useRouter();
  const query = useFeed(scope);
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTopOnTabPress(listRef);
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
  const rememberOffset = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (restored.current) setOffset(scope, event.nativeEvent.contentOffset.y);
  };

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
      ListHeaderComponent={<FeedHeader scope={scope} onSelect={onSelect} />}
      ListEmptyComponent={empty}
      bottomInset={FAB_SIZE + 2 * space.lg}
      onScroll={rememberOffset}
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

  return (
    <Screen>
      <View style={styles.page}>
        <Feed key={scope} scope={scope} onSelect={setScope} getOffset={getOffset} setOffset={setOffset} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Publicar"
          onPress={() => router.push(COMPOSER)}
          style={styles.fab}
        >
          <Ionicons name="create-outline" size={24} color={colors.onPrimary} />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  // Tabs pad their own edges; pull them out to the screen edge so they scroll edge to edge.
  header: { marginHorizontal: -space.lg, paddingBottom: space.md },
  skeleton: { gap: space.lg },
  skeletonRow: { flexDirection: 'row', gap: space.md },
  skeletonText: { flex: 1, gap: space.sm },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
