import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type ComponentType,
  type ReactElement,
} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type FlatList } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Text } from '@/components';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

import { PostFeedItem, postFeedRowLayout } from './PostFeedItem';
import { PostReplyRow } from './PostReplyRow';
import { ActivityRow } from './ActivityRow';
import { itemHref, postKey, toQuotedPost, type Post, type PostPage, type PostReason } from './types';

type Slot = ReactElement | ComponentType;

export type PostListProps = {
  query: UseInfiniteQueryResult<InfiniteData<PostPage>>;
  activityTimeline?: boolean;
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
  /** Set to `handled` under a search field, so the first tap on a row works with the keyboard open. */
  keyboardShouldPersistTaps?: AnimatedListProps['keyboardShouldPersistTaps'];
};

type AnimatedListProps = ComponentProps<typeof Animated.FlatList<Post>>;

const MAX_PREVIEW_REPLIES = 2;
type FeedReply = Extract<PostReason, { type: 'reply' }>;

// A conversation uses the original post's key even when a reply puts it in the feed.
const keyExtractor = (post: Post) => post.reason?.type === 'reply' ? `post:${post.id}` : postKey(post);

export const PostList = forwardRef<FlatList<Post>, PostListProps>(function PostList(
  {
    query,
    activityTimeline = false,
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
    keyboardShouldPersistTaps,
  },
  ref,
) {
  const router = useRouter();
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
  const { fetchNextPage, refetch } = query;

  const { posts, repliesByPost, groupedPosts } = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    const repliesByPost = new Map<string, FeedReply[]>();
    for (const { id, type, reason } of items) {
      if (type === 'activity' || reason?.type !== 'reply') continue;
      const replies = repliesByPost.get(id);
      if (!replies) repliesByPost.set(id, [reason]);
      else if (replies.length < MAX_PREVIEW_REPLIES && !replies.some((reply) => reply.id === reason.id)) {
        // The feed is newest first. Show the selected replies in conversation order.
        replies.unshift(reason);
      }
    }

    // Keep the conversation at its most recent feed event, including across loaded pages.
    const seenThreads = new Set<string>();
    const posts = items.filter((item) => {
      if (!repliesByPost.has(item.id) || item.reason?.type === 'repost') return true;
      if (seenThreads.has(item.id)) return false;
      seenThreads.add(item.id);
      return true;
    });
    return { posts, repliesByPost, groupedPosts: posts.length < items.length };
  }, [data]);

  const open = useCallback(
    (post: Post) => {
      if (onPressPost) onPressPost(post);
      else router.push(itemHref(post.id, post.type));
    },
    [onPressPost, router],
  );

  const renderItem = useCallback(
    // Rows draw their own top line; the first one sits under the list's header.
    ({ item, index }: { item: Post; index: number }) => {
      if (item.type === 'activity') return <ActivityRow activity={item} />;
      const replies = item.reason?.type === 'repost' ? undefined : repliesByPost.get(item.id);
      if (replies) {
        const openPost = () => open(item);
        const original = toQuotedPost(item);
        return (
          <View testID="feed-reply">
            <PostFeedItem post={item} hideTopBorder={index === 0} hasReplyBelow onPress={openPost} />
            {replies.map((reply, index) => (
              <PostReplyRow
                key={reply.id}
                author={reply.by}
                createdAt={reply.at}
                content={reply.content}
                post={original}
                inThread
                hasReplyBelow={index < replies.length - 1}
                onOpenPost={openPost}
                testID="feed-thread-response"
              />
            ))}
            <Pressable accessibilityRole="link" onPress={openPost} style={styles.conversationLink}>
              <Text size="sm" weight="semibold" tone="primary">Ver conversa</Text>
            </Pressable>
          </View>
        );
      }
      return <PostFeedItem post={item} hideTopBorder={index === 0} onPress={() => open(item)} />;
    },
    [open, repliesByPost],
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
      if (failed) showToast(activityTimeline ? 'Não foi possível atualizar as atividades' : 'Não foi possível atualizar o feed');
    } finally {
      setPulling(false);
    }
  }, [activityTimeline, onRefresh, refetch]);

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
          {activityTimeline ? 'Não foi possível carregar mais atividades.' : 'Não foi possível carregar mais posts.'}
        </Text>
        <Button label="Tentar de novo" color="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  } else if (hasNextPage && groupedPosts) {
    // A page of replies to existing conversations may not change the list's height.
    footer = (
      <View style={styles.footer}>
        <Button label="Carregar mais" color="secondary" onPress={loadMore} />
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
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
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
  conversationLink: {
    alignSelf: 'flex-start',
    marginLeft: postFeedRowLayout.paddingLeft + postFeedRowLayout.avatarSize + postFeedRowLayout.gap,
    minHeight: 48,
    justifyContent: 'center',
    paddingRight: space.lg,
  },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
