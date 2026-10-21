import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useMemo,
  type ComponentType,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Button } from '@/components';
import { colors, fontSize, space } from '@/theme/tokens';

import { ActivityCard } from './ActivityCard';
import { PostCard } from './PostCard';
import type { Post, PostPage } from './types';

type Slot = ReactElement | ComponentType;

export type PostListProps = {
  query: UseInfiniteQueryResult<InfiniteData<PostPage>>;
  ListHeaderComponent?: Slot;
  ListEmptyComponent?: Slot;
  /** Defaults to refetching the query. */
  onRefresh?: () => void;
  /** Defaults to opening the post's page. */
  onPressPost?: (post: Post) => void;
  /** Bottom padding of the content, e.g. to keep the last card clear of a floating button. */
  bottomInset?: number;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange?: (width: number, height: number) => void;
};

const keyExtractor = (post: Post) => post.id;

export const PostList = forwardRef<FlatList<Post>, PostListProps>(function PostList(
  {
    query,
    ListHeaderComponent,
    ListEmptyComponent,
    onRefresh,
    onPressPost,
    bottomInset,
    onScroll,
    onContentSizeChange,
  },
  ref,
) {
  const router = useRouter();
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, isRefetching } = query;
  const { fetchNextPage, refetch } = query;

  const posts = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const open = useCallback(
    (post: Post) => {
      if (onPressPost) onPressPost(post);
      else router.push(`/posts/${post.id}` as Href);
    },
    [onPressPost, router],
  );

  const renderItem = useCallback(
    ({ item }: { item: Post }) =>
      item.type === 'activity' ? (
        <ActivityCard post={item} onPress={() => open(item)} />
      ) : (
        <PostCard post={item} onPress={() => open(item)} />
      ),
    [open],
  );

  const loadMore = useCallback(() => {
    // After a failed page only the retry button fetches again, never the scroll position.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const refresh = useCallback(() => {
    if (onRefresh) onRefresh();
    else void refetch();
  }, [onRefresh, refetch]);

  const contentStyle = useMemo(
    () => (bottomInset === undefined ? styles.content : [styles.content, { paddingBottom: bottomInset }]),
    [bottomInset],
  );

  let footer: ReactElement | undefined;
  if (isFetchingNextPage) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator testID="post-list-loading-more" color={colors.textMuted} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <View style={styles.footer}>
        <Text style={styles.footerText}>Não foi possível carregar mais posts.</Text>
        <Button label="Tentar de novo" variant="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  } else if (posts.length > 0 && !hasNextPage) {
    footer = (
      <View style={styles.footer}>
        <Text style={styles.footerText}>Você chegou ao fim.</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={ref}
      testID="post-list"
      data={posts}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ItemSeparatorComponent={Separator}
      contentContainerStyle={contentStyle}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
      onContentSizeChange={onContentSizeChange}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onRefresh={refresh}
      refreshing={isRefetching && !isFetchingNextPage}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={footer}
    />
  );
});

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, flexGrow: 1 },
  separator: { height: space.md },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  footerText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
});
