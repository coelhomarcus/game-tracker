import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Keyboard, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { EmptyState, Screen } from '@/components';
import { ApiError } from '@/lib/http/errors';
import { usePreferences } from '@/lib/preferences';
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
import { ThreadItemTree } from './thread/ThreadItemTree';
import { ThreadMenu } from './thread/ThreadMenu';
import { ThreadReadMore } from './thread/ThreadReadMore';
import { ThreadReplyPrompt } from './thread/ThreadReplyPrompt';
import { isPostId, type Comment, type Post } from './types';

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

/**
 * The page's list: the anchor post first, then the comment rows, or the state of the comments
 * (loading, failed, none) while there are none to show.
 */
type PageItem = { type: 'anchor'; key: string } | { type: 'status'; key: string } | ThreadRow;

const ANCHOR_ITEM: PageItem = { type: 'anchor', key: 'anchor' };
const STATUS_ITEM: PageItem = { type: 'status', key: 'comments-status' };

const keyExtractor = (item: PageItem) => item.key;

/**
 * The anchor post is the list's first item (an item, not a list header: the list counts its
 * header outside the indexes), so it keeps its place while the rows below it change.
 */
const MAINTAIN_ANCHOR = { minIndexForVisible: 0 };

/** Whether `id` is the comment or one of the replies below it. */
function holds(comment: Comment, id: string): boolean {
  return comment.id === id || comment.replies.some((reply) => holds(reply, id));
}

/**
 * The thread: the post as its anchor, then the comments in the view and order chosen in the
 * header's menu, with the composer pinned under them above the keyboard.
 */
function PostBody({ post }: { post: Post }) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const view = usePreferences((state) => state.threadView);
  const sort = usePreferences((state) => state.threadSort);
  const comments = useComments(post.id, sort);
  const addComment = useAddComment(post.id);
  const toggleLike = useToggleCommentLike(post.id);
  const deleteComment = useDeleteComment(post.id);
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  // The reply prompt stands in for the composer until the user asks to write; the composer then
  // stays while it holds a draft. `focusRequest` makes an open composer take focus again.
  const [composing, setComposing] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const listRef = useRef<FlatList<PageItem>>(null);

  const items = useMemo(() => {
    const rows = buildThread(comments.data ?? [], { mode: view, expanded });
    return [ANCHOR_ITEM, ...(rows.length > 0 ? rows : [STATUS_ITEM])];
  }, [comments.data, view, expanded]);

  // Another view or order brings the post back to the top, where it then stays while the
  // replies change under it (`maintainVisibleContentPosition` on the list).
  const pinAnchor = useCallback(
    () => listRef.current?.scrollToOffset({ offset: 0, animated: false }),
    [],
  );
  const headerRight = useCallback(() => <ThreadMenu onChange={pinAnchor} />, [pinAnchor]);

  const { mutate: like } = toggleLike;
  const { mutate: remove } = deleteComment;
  const openComposer = useCallback((target: ReplyTarget | null) => {
    setReplyTo(target);
    setComposing(true);
    setFocusRequest((count) => count + 1);
  }, []);
  const closeComposer = useCallback(() => {
    Keyboard.dismiss();
    setComposing(false);
    setReplyTo(null);
  }, []);
  const onReply = useCallback(
    (comment: Comment) =>
      openComposer({ commentId: comment.id, username: comment.author.username }),
    [openComposer],
  );
  const onReplyToPost = useCallback(() => openComposer(null), [openComposer]);
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

  const Item = view === 'tree' ? ThreadItemTree : ThreadItemLinear;
  const renderItem = ({ item }: { item: PageItem }) => {
    switch (item.type) {
      case 'anchor':
        return anchor;
      case 'status':
        return status;
      case 'comment':
        return (
          <Item row={item} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} />
        );
      case 'readMore':
        return <ThreadReadMore row={item} onExpand={onExpand} mode={view} />;
    }
  };

  async function submit(content: string) {
    await addComment.mutateAsync({
      content,
      ...(replyTo ? { parentCommentId: replyTo.commentId } : {}),
    });
    closeComposer();
  }

  let status: ReactElement;
  if (comments.data) {
    status = (
      <EmptyState title="Nenhum comentário ainda" message="Seja a primeira pessoa a comentar." />
    );
  } else if (comments.isError) {
    status = (
      <EmptyState
        title="Não foi possível carregar os comentários"
        action={{ label: 'Tentar de novo', onPress: () => void comments.refetch() }}
      />
    );
  } else {
    status = (
      <ActivityIndicator
        testID="comments-loading"
        accessibilityLabel="Carregando comentários"
        color={colors.textMedium}
        style={styles.loading}
      />
    );
  }

  const anchor = (
    <ThreadAnchor
      post={post}
      onReply={onReplyToPost}
      onDeleted={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  );

  return (
    <Screen>
      <Stack.Screen
        options={{ title: post.type === 'activity' ? 'Atividade' : 'Post', headerRight }}
      />
      <KeyboardAvoidingView
        testID="post-keyboard-avoider"
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.fill}
      >
        <FlatList
          ref={listRef}
          testID="comment-list"
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          maintainVisibleContentPosition={MAINTAIN_ANCHOR}
          style={styles.fill}
        />
        {composing ? (
          <CommentComposer
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            focusRequest={focusRequest}
            onDismiss={closeComposer}
            onSubmit={submit}
          />
        ) : (
          <ThreadReplyPrompt onPress={onReplyToPost} />
        )}
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
