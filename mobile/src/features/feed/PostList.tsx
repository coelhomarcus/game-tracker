import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
} from 'react';
import { ActivityIndicator, StyleSheet, View, type FlatList } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Text } from '@/components';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

import { PostFeedItem } from './PostFeedItem';
import { postKey, type Post, type PostPage } from './types';

type Slot = ReactElement | ComponentType;

export type PostListProps = {
  query: UseInfiniteQueryResult<InfiniteData<PostPage>>;
  ListHeaderComponent?: Slot;
  ListEmptyComponent?: Slot;
  /** Defaults to refetching the query and reporting a failure. */
  onRefresh?: () => void | Promise<unknown>;
  /** Defaults to opening the post's page. */
  onPressPost?: (post: Post) => void;
  /** Bottom padding of the content, e.g. to keep the last row clear of a floating button. */
  bottomInset?: number;
  /**
   * Room above the content for a header floating over the list; the pull-to-refresh spinner
   * starts below it too.
   */
  topInset?: number;
  /** The content is at least this tall (a pager's lists, so their shared header can collapse). */
  minContentHeight?: number;
  /** Where the list starts when it mounts. */
  initialOffset?: number;
  /** A plain callback or a Reanimated scroll handler (`useAnimatedScrollHandler`). */
  onScroll?: AnimatedListProps['onScroll'];
  onContentSizeChange?: (width: number, height: number) => void;
};

type AnimatedListProps = ComponentProps<typeof Animated.FlatList<Post>>;

// The same post can be listed as the original and once per reposter.
const keyExtractor = postKey;

export const PostList = forwardRef<FlatList<Post>, PostListProps>(function PostList(
  {
    query,
    ListHeaderComponent,
    ListEmptyComponent,
    onRefresh,
    onPressPost,
    bottomInset,
    topInset = 0,
    minContentHeight,
    initialOffset,
    onScroll,
    onContentSizeChange,
  },
  ref,
) {
  const router = useRouter();
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
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
    // Rows draw their own top line; the first one sits under the list's header.
    ({ item, index }: { item: Post; index: number }) => (
      <PostFeedItem post={item} hideTopBorder={index === 0} onPress={() => open(item)} />
    ),
    [open],
  );

  const loadMore = useCallback(() => {
    // After a failed page only the retry button fetches again, never the scroll position.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // Only a pull shows the spinner: background refetches (scope switch, focus) stay silent.
  const [pulling, setPulling] = useState(false);
  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      if (onRefresh) {
        await onRefresh();
        return;
      }
      // `refetch` resolves with the error instead of throwing, so both outcomes are handled.
      const failed = await refetch().then(
        (result) => result.isError,
        () => true,
      );
      if (failed) showToast('Não foi possível atualizar o feed');
    } finally {
      setPulling(false);
    }
  }, [onRefresh, refetch]);

  const contentStyle = useMemo(
    () => [
      styles.content,
      topInset > 0 && { paddingTop: topInset },
      bottomInset !== undefined && { paddingBottom: bottomInset },
      minContentHeight !== undefined && { minHeight: minContentHeight },
    ],
    [bottomInset, minContentHeight, topInset],
  );

  let footer: ReactElement | undefined;
  if (isFetchingNextPage) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator testID="post-list-loading-more" color={colors.textMedium} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <View style={styles.footer}>
        <Text size="sm" tone="medium" style={styles.footerText}>
          Não foi possível carregar mais posts.
        </Text>
        <Button label="Tentar de novo" color="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  } else if (posts.length > 0 && !hasNextPage) {
    footer = (
      <View style={styles.footer}>
        <Text size="sm" tone="medium" style={styles.footerText}>
          Você chegou ao fim.
        </Text>
      </View>
    );
  }

  return (
    <Animated.FlatList
      ref={ref}
      testID="post-list"
      data={posts}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={contentStyle}
      contentOffset={initialOffset ? { x: 0, y: initialOffset } : undefined}
      onScroll={onScroll}
      scrollEventThrottle={onScroll ? 16 : undefined}
      onContentSizeChange={onContentSizeChange}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onRefresh={() => void refresh()}
      refreshing={pulling}
      progressViewOffset={topInset > 0 ? topInset : undefined}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={footer}
    />
  );
});

const styles = StyleSheet.create({
  // Rows are full width; they pad themselves.
  content: { flexGrow: 1 },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
