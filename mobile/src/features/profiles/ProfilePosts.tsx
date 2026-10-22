import { useCallback, useRef, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components';
import { PostList } from '@/features/feed/PostList';
import type { Post } from '@/features/feed/types';
import { colors, space } from '@/theme/tokens';

import { refreshAll, ScrollToTopOnTabPress, type Refetch } from './profileList';
import { useUserPosts } from './queries';

const COPY = {
  activity: { empty: 'Ainda não há atividades', error: 'Não foi possível carregar a atividade' },
  post: { empty: 'Ainda não há posts', error: 'Não foi possível carregar os posts' },
} as const;

export type ProfilePostsProps = {
  userId: string;
  /** The activity tab or the written posts tab. */
  type: 'activity' | 'post';
  /** Profile header and tabs, shown above the list. */
  top: ReactElement;
  /** Whether this is the Perfil tab itself, so pressing its button scrolls back to the top. */
  tabRoot: boolean;
  refetchProfile: Refetch;
};

/** The activity or the posts of a user, as the list under the profile header. */
export function ProfilePosts({ userId, type, top, tabRoot, refetchProfile }: ProfilePostsProps) {
  const query = useUserPosts(userId, type);
  const listRef = useRef<FlatList<Post>>(null);
  const { refetch } = query;

  const refresh = useCallback(
    () => refreshAll([refetchProfile, () => refetch()]),
    [refetchProfile, refetch],
  );

  let empty: ReactElement;
  if (query.data !== undefined) {
    empty = <EmptyState title={COPY[type].empty} />;
  } else if (query.isError) {
    empty = (
      <EmptyState
        title={COPY[type].error}
        action={{ label: 'Tentar de novo', onPress: () => void refetch() }}
      />
    );
  } else {
    empty = (
      <View style={styles.loading}>
        <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <PostList
        ref={listRef}
        query={query}
        ListHeaderComponent={top}
        ListEmptyComponent={empty}
        onRefresh={refresh}
      />
      {tabRoot ? <ScrollToTopOnTabPress listRef={listRef} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { padding: space._2xl, alignItems: 'center' },
});
