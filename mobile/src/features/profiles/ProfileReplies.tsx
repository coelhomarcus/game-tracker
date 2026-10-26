import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type FlatList } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar, Button, EmptyState, Text, type PagerScrollProps } from '@/components';
import { PostMeta } from '@/features/feed/PostMeta';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { refreshAll, type Refetch } from './profileList';
import { PROFILE_LIST_BOTTOM_INSET } from './ProfilePosts';
import { useUserReplies } from './queries';
import type { UserReply } from './types';

const AVATAR_SIZE = 42;
const EXCERPT_LINES = 3;

type ReplyRowProps = {
  reply: UserReply;
  author: UserSummary;
  hideTopBorder: boolean;
  onPress: (reply: UserReply) => void;
};

/**
 * A comment as a thread row (avatar, name, time, text) that says which post it answers and
 * quotes the start of that post. The whole row opens the post.
 */
const ReplyRow = memo(function ReplyRow({ reply, author, hideTopBorder, onPress }: ReplyRowProps) {
  const name = displayName(author);
  const postAuthor = `@${reply.post.author.username}`;
  const label = `Resposta de ${name}, ${formatRelativeTime(reply.createdAt)}: ${reply.content}. Respondendo ao post de ${postAuthor}`;

  return (
    <Pressable
      testID="profile-reply"
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => onPress(reply)}
      style={({ pressed }) => [
        styles.row,
        !hideTopBorder && styles.topBorder,
        pressed && styles.pressed,
      ]}
    >
      <Avatar uri={resolveImageUrl(author.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.content}>
        <PostMeta author={author} createdAt={reply.createdAt} linked={false} />
        <Text numberOfLines={1} size="xs" tone="medium" style={styles.replyingTo}>
          {`Respondendo ao post de ${postAuthor}`}
        </Text>
        <Text testID="profile-reply-text">{reply.content}</Text>
        {reply.post.content ? (
          <View testID="profile-reply-post" style={styles.excerpt}>
            <Text numberOfLines={EXCERPT_LINES} size="sm" tone="medium">
              {reply.post.content}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
});

export type ProfileRepliesProps = {
  /** The profile's owner, who wrote every comment listed. */
  author: UserSummary;
  scroll: PagerScrollProps;
  refetchProfile: Refetch;
};

/** The Respostas tab: the comments the user wrote, newest first, each opening its post. */
export function ProfileReplies({ author, scroll, refetchProfile }: ProfileRepliesProps) {
  const { attachList, onScroll, topInset, minContentHeight, initialOffset } = scroll;
  const router = useRouter();
  const query = useUserReplies(author.id);
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = query;
  const replies = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const open = useCallback(
    (reply: UserReply) => router.push(`/posts/${reply.postId}` as Href),
    [router],
  );
  const renderItem = useCallback(
    ({ item, index }: { item: UserReply; index: number }) => (
      <ReplyRow reply={item} author={author} hideTopBorder={index === 0} onPress={open} />
    ),
    [author, open],
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
  row: {
    flexDirection: 'row',
    gap: space.sm,
    paddingLeft: space.md,
    paddingRight: space.lg,
    paddingVertical: space.md,
  },
  topBorder: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  pressed: { backgroundColor: colors.bgContrast25 },
  content: { flex: 1, gap: space.xs },
  replyingTo: { marginTop: -space.xs },
  excerpt: {
    marginTop: space.xs,
    padding: space.sm,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
  loading: { padding: space._2xl, alignItems: 'center' },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
