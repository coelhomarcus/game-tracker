import { useRouter, type Href } from 'expo-router';
import { useCallback, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState, FAB_BOTTOM, FAB_SIZE, type PagerScrollProps } from '@/components';
import { PostList } from '@/features/feed/PostList';
import { colors, space } from '@/theme/tokens';

import { refreshAll, type Refetch } from './profileList';
import { useUserPosts } from './queries';

const COMPOSER = '/posts/new' as Href;
/** Keeps the last row clear of the compose button. */
export const PROFILE_LIST_BOTTOM_INSET = FAB_SIZE + 2 * FAB_BOTTOM;

export type ProfilePostFeedProps = {
  query: ReturnType<typeof useUserPosts>;
  /** From the profile's pager: the list floats under its shared header. */
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
  copy: { empty: string; error: string };
  emptyAction?: { label: string; onPress: () => void };
};

/** A post list page of the profile (Posts, Mídia, Curtidas), with its loading and empty states. */
export function ProfilePostFeed({ query, scroll, refetchProfile, copy, emptyAction }: ProfilePostFeedProps) {
  const { refetch } = query;
  const { attachList, onScroll, topInset, minContentHeight, initialOffset } = scroll;

  const refresh = useCallback(
    () => refreshAll([refetchProfile, () => refetch()]),
    [refetchProfile, refetch],
  );

  let empty: ReactElement;
  if (query.data !== undefined) {
    empty = <EmptyState title={copy.empty} action={emptyAction} />;
  } else if (query.isError) {
    empty = (
      <EmptyState
        title={copy.error}
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
    <PostList
      ref={attachList}
      query={query}
      ListEmptyComponent={empty}
      onRefresh={refresh}
      onScroll={onScroll}
      topInset={topInset}
      minContentHeight={minContentHeight}
      initialOffset={initialOffset}
      bottomInset={PROFILE_LIST_BOTTOM_INSET}
    />
  );
}

export type ProfilePostsProps = {
  userId: string;
  own: boolean;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/** The Posts tab: the user's posts and reposts. */
export function ProfilePosts({ userId, own, scroll, refetchProfile }: ProfilePostsProps) {
  const router = useRouter();
  const query = useUserPosts(userId, 'posts');
  return (
    <ProfilePostFeed
      query={query}
      scroll={scroll}
      refetchProfile={refetchProfile}
      copy={{ empty: 'Nenhum post ainda', error: 'Não foi possível carregar os posts' }}
      emptyAction={own ? { label: 'Escrever um post', onPress: () => router.push(COMPOSER) } : undefined}
    />
  );
}

const styles = StyleSheet.create({
  loading: { padding: space._2xl, alignItems: 'center' },
});
