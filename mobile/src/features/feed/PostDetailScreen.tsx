import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState, Screen } from '@/components';
import { ApiError } from '@/lib/http/errors';
import { colors, fontSize, space } from '@/theme/tokens';

import { ActivityCard } from './ActivityCard';
import { CommentComposer, type ReplyTarget } from './CommentComposer';
import { CommentItem } from './CommentItem';
import { flattenComments, type FlatComment } from './flattenComments';
import { PostCard } from './PostCard';
import { useAddComment, useComments, usePost, useToggleCommentLike } from './queries';
import type { Post } from './types';

// The API answers 500 to an id that is not a UUID, so such an address is simply not a post.
const POST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Route entry: validates the address, then waits for the post. */
export function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const postId = firstParam(params.postId)?.trim() ?? '';
  if (!POST_ID_PATTERN.test(postId)) return <PostNotFound />;
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
  const post = usePost(postId);

  // A failed background refetch keeps the previous data, so the loaded post stays.
  if (post.data) return <PostBody post={post.data} />;

  if (post.isError) {
    if (post.error instanceof ApiError && post.error.status === 404) return <PostNotFound />;
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
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
      </View>
    </Screen>
  );
}

const keyExtractor = (item: FlatComment) => item.comment.id;

function Separator() {
  return <View style={styles.separator} />;
}

function PostBody({ post }: { post: Post }) {
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
    empty = <Text style={styles.empty}>Ainda não há comentários. Seja o primeiro.</Text>;
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
        color={colors.textMuted}
      />
    );
  }

  const header = (
    <View style={styles.header}>
      {post.type === 'activity' ? <ActivityCard post={post} /> : <PostCard post={post} />}
      <Text accessibilityRole="header" style={styles.title}>
        {`Comentários (${post.commentCount})`}
      </Text>
    </View>
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: post.type === 'activity' ? 'Atividade' : 'Post' }} />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
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
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  separator: { height: space.md },
  empty: { color: colors.textMuted, fontSize: fontSize.md, textAlign: 'center', padding: space.xl },
});
