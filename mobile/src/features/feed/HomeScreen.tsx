import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

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
            <Skeleton width="40%" height={14} radius={radii.cover} />
            <Skeleton height={14} radius={radii.cover} />
          </View>
        </View>
      ))}
    </View>
  );
}

type FeedProps = HeaderProps;

/**
 * Keyed by scope in `HomeScreen`: each scope gets its own list, so it starts at its own top,
 * while TanStack keeps both queries cached and re-selecting one does not refetch fresh data.
 */
function Feed({ scope, onSelect }: FeedProps) {
  const router = useRouter();
  const query = useFeed(scope);
  const listRef = useRef<FlatList<Post>>(null);
  useScrollToTopOnTabPress(listRef);

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
        action={{ label: 'Encontrar pessoas', onPress: () => router.push('/explore') }}
      />
    );
  }

  return (
    <PostList
      ref={listRef}
      query={query}
      ListHeaderComponent={<FeedHeader scope={scope} onSelect={onSelect} />}
      ListEmptyComponent={empty}
    />
  );
}

export function HomeScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<FeedScope>('general');

  return (
    <Screen>
      <View style={styles.page}>
        <Feed key={scope} scope={scope} onSelect={setScope} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Publicar"
          onPress={() => router.push(COMPOSER)}
          style={styles.fab}
        >
          <Ionicons name="create-outline" size={24} color={colors.onAccent} />
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
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
