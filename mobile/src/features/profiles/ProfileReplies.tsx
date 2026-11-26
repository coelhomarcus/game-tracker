import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View, type FlatList } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, EmptyState, Text, type PagerScrollProps } from '@/components';
import { PostReplyRow } from '@/features/feed/PostReplyRow';
import type { UserSummary } from '@/features/games/types';
import { colors, space } from '@/theme/tokens';

import { refreshAll, type Refetch } from './profileList';
import { PROFILE_LIST_BOTTOM_INSET } from './ProfilePosts';
import { useUserReplies } from './queries';
import type { UserReply } from './types';

export type ProfileRepliesProps = {
  /** The profile's owner, who wrote every comment listed. */
  author: UserSummary;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/** The Respostas tab: the comments the user wrote, newest first, each opening its post. */
export function ProfileReplies({ author, scroll, refetchProfile }: ProfileRepliesProps) {
  const { attachList, onScroll, onContentSizeChange, topInset, minContentHeight, initialOffset } = scroll;
  const query = useUserReplies(author.id);
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = query;
  const replies = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const renderItem = useCallback(
    ({ item, index }: { item: UserReply; index: number }) => (
      <PostReplyRow author={author} content={item.content} createdAt={item.createdAt} post={item.post}
        hideTopBorder={index === 0} testID="profile-reply" />
    ),
    [author],
  );

  const loadMore = useCallback(() => {
    // After a failed page only the retry button fetches again, never the scroll position.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  // Only a pull shows the spinner: background refetches stay silent.
  const [pulling, setPulling] = useState(false);
  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      await refreshAll([refetchProfile, () => refetch()]);
    } finally {
      setPulling(false);
    }
  }, [refetchProfile, refetch]);

  let empty: ReactElement;
  if (data !== undefined) {
    empty = <EmptyState title="Nenhuma resposta ainda" />;
  } else if (query.isError) {
    empty = (
      <EmptyState
        title="Não foi possível carregar as respostas"
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

  let footer: ReactElement | undefined;
  if (isFetchingNextPage) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator testID="replies-loading-more" color={colors.textMedium} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <View style={styles.footer}>
        <Text size="sm" tone="medium" style={styles.footerText}>
          Não foi possível carregar mais respostas.
        </Text>
        <Button label="Tentar de novo" color="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  }

  const contentStyle = useMemo(
    () => [
      styles.list,
      {
        paddingTop: topInset,
        paddingBottom: PROFILE_LIST_BOTTOM_INSET,
        minHeight: minContentHeight,
      },
    ],
    [minContentHeight, topInset],
  );

  return (
    <Animated.FlatList
      ref={attachList as (list: FlatList<UserReply> | null) => void}
      testID="profile-replies"
      data={replies}
      keyExtractor={(reply) => reply.id}
      renderItem={renderItem}
      contentContainerStyle={contentStyle}
      contentOffset={initialOffset ? { x: 0, y: initialOffset } : undefined}
      onScroll={onScroll}
      onContentSizeChange={onContentSizeChange}
      scrollEventThrottle={16}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      onRefresh={() => void refresh()}
      refreshing={pulling}
      progressViewOffset={topInset}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  loading: { padding: space._2xl, alignItems: 'center' },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
