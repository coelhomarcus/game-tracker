import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { EmptyState, Screen } from '@/components';
import { ApiError } from '@/lib/http/errors';
import { useHeaderHeight } from '@/lib/useHeaderHeight';
import { colors, space } from '@/theme/tokens';

import { CommentComposer, type ReplyTarget } from './CommentComposer';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useDeletedPostCheck,
  usePost,
  useToggleCommentLike,
} from './queries';
import { buildThread, type ThreadRow } from './thread/buildThread';
import { ThreadAnchor } from './thread/ThreadAnchor';
import { ThreadItemLinear } from './thread/ThreadItemLinear';
import { ThreadReadMore } from './thread/ThreadReadMore';
import { isPostId, type Comment, type CommentSort, type Post } from './types';

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

/** Until the thread menu lets the user choose, replies come oldest first, as the server sends. */
const COMMENT_SORT: CommentSort = 'oldest';

const keyExtractor = (row: ThreadRow) => row.key;

/** Whether `id` is the comment or one of the replies below it. */
function holds(comment: Comment, id: string): boolean {
  return comment.id === id || comment.replies.some((reply) => holds(reply, id));
}

/**
 * The thread: the post as its anchor, then the comments in the linear view, with the composer
 * pinned under them above the keyboard.
 */
function PostBody({ post }: { post: Post }) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const comments = useComments(post.id, COMMENT_SORT);
  const addComment = useAddComment(post.id);
  const toggleLike = useToggleCommentLike(post.id);
  const deleteComment = useDeleteComment(post.id);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const rows = useMemo(
    () => buildThread(comments.data ?? [], { mode: 'linear', expanded }),
    [comments.data, expanded],
  );

  const { mutate: like } = toggleLike;
  const { mutate: remove } = deleteComment;
  const onReply = useCallback(
    (comment: Comment) => setReplyTo({ commentId: comment.id, username: comment.author.username }),
    [],
  );
  const onToggleLike = useCallback((comment: Comment) => like(comment), [like]);
  const onDelete = useCallback(
    (comment: Comment) =>
      remove(comment, {
        // A reply to the deleted comment, or to one of its replies, has nothing left to answer.
        onSuccess: () =>
          setReplyTo((target) => (target && holds(comment, target.commentId) ? null : target)),
      }),
    [remove],
  );
  const onExpand = useCallback(
    (branchId: string) => setExpanded((current) => new Set(current).add(branchId)),
    [],
  );

  const renderItem = ({ item }: { item: ThreadRow }) =>
    item.type === 'comment' ? (
      <ThreadItemLinear
        row={item}
        onReply={onReply}
        onToggleLike={onToggleLike}
        onDelete={onDelete}
      />
    ) : (
      <ThreadReadMore row={item} onExpand={onExpand} />
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
      <EmptyState title="Nenhum comentário ainda" message="Seja a primeira pessoa a comentar." />
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
        style={styles.loading}
      />
    );
  }

  const header = (
    <ThreadAnchor
      post={post}
      onDeleted={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: post.type === 'activity' ? 'Atividade' : 'Post' }} />
      <KeyboardAvoidingView
        testID="post-keyboard-avoider"
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.fill}
      >
        <FlatList
          testID="comment-list"
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
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
  content: { flexGrow: 1, paddingBottom: space.lg },
  loading: { padding: space._2xl },
});
