import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { EmptyState, Screen, Text } from '@/components';
import { ApiError } from '@/lib/http/errors';
import { useHeaderHeight } from '@/lib/useHeaderHeight';
import { colors, space } from '@/theme/tokens';

import { CommentComposer, type ReplyTarget } from './CommentComposer';
import { CommentItem } from './CommentItem';
import { flattenComments, type FlatComment } from './flattenComments';
import { PostFeedItem } from './PostFeedItem';
import {
  useAddComment,
  useComments,
  useDeletedPostCheck,
  usePost,
  useToggleCommentLike,
} from './queries';
import { isPostId, type Post } from './types';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Route entry: validates the address, then waits for the post. */
export function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = firstParam(params.postId)?.trim() ?? '';
  if (!isPostId(postId)) return <PostNotFound />;
  return <PostLoader postId={postId} />;
}

function PostNotFound() {
  const router = useRouter();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Post' }} />
      <View style={styles.center}>
        <EmptyState
          title="Post não encontrado"
          message="Ele pode ter sido removido."
          action={{ label: 'Voltar ao feed', onPress: () => router.replace('/') }}
        />
      </View>
    </Screen>
  );
}

function PostLoader({ postId }: { postId: string }) {
  const wasDeleted = useDeletedPostCheck();
  const post = usePost(postId);
  // A page left open lower in the stack for a post the user then deleted elsewhere says so when
  // it is shown again. The page the user deletes from goes back with its post still drawn.
  const [deleted, setDeleted] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (wasDeleted(postId)) setDeleted(true);
    }, [wasDeleted, postId]),
  );

  // The server no longer has it, even if a cached copy is still there.
  const gone = post.error instanceof ApiError && post.error.status === 404;
  if (deleted || gone) return <PostNotFound />;

  // A failed background refetch keeps the previous data, so the loaded post stays.
  if (post.data) return <PostBody post={post.data} />;

  if (post.isError) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Post' }} />
        <View style={styles.center}>
          <EmptyState
            title="Não foi possível carregar o post"
            action={{ label: 'Tentar de novo', onPress: () => void post.refetch() }}
          />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Post' }} />
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.primary} />
      </View>
    </Screen>
  );
}

const keyExtractor = (item: FlatComment) => item.comment.id;

function Separator() {
  return <View style={styles.separator} />;
}

function PostBody({ post }: { post: Post }) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const comments = useComments(post.id);
  const addComment = useAddComment(post.id);
  const toggleLike = useToggleCommentLike(post.id);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);

  const rows = useMemo(() => flattenComments(comments.data ?? []), [comments.data]);

  const renderItem = ({ item }: { item: FlatComment }) => (
    <CommentItem
      item={item}
      onToggleLike={(comment) => toggleLike.mutate(comment)}
      onReply={(comment) => setReplyTo({ commentId: comment.id, username: comment.author.username })}
    />
  );

  async function submit(content: string) {
    await addComment.mutateAsync({
      content,
      ...(replyTo ? { parentCommentId: replyTo.commentId } : {}),
    });
    setReplyTo(null);
  }

  let empty: ReactElement;
  if (comments.data) {
    empty = (
      <Text tone="medium" style={styles.empty}>
        Ainda não há comentários. Seja o primeiro.
      </Text>
    );
  } else if (comments.isError) {
    empty = (
      <EmptyState
        title="Não foi possível carregar os comentários"
        action={{ label: 'Tentar de novo', onPress: () => void comments.refetch() }}
      />
    );
  } else {
    empty = (
      <ActivityIndicator
        testID="comments-loading"
        accessibilityLabel="Carregando comentários"
        color={colors.textMedium}
      />
    );
  }

  const header = (
    <View style={styles.header}>
      {/* Full width, past the list's padding, until the thread gets its own anchor post. */}
      <View style={styles.post}>
        <PostFeedItem
          post={post}
          hideTopBorder
          onDeleted={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </View>
      <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
        {`Comentários (${post.commentCount})`}
      </Text>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: post.type === 'activity' ? 'Atividade' : 'Post' }} />
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.fill}
      >
        <FlatList
          testID="comment-list"
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          style={styles.fill}
        />
        <CommentComposer
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSubmit={submit}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { padding: space.lg, flexGrow: 1 },
  header: { gap: space.lg, paddingBottom: space.lg },
  post: { marginHorizontal: -space.lg, marginTop: -space.lg },
  separator: { height: space.md },
  empty: { textAlign: 'center', padding: space._2xl },
});
