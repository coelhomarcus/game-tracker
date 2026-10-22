import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components';
import { ActivityCard } from '@/features/feed/ActivityCard';
import { PostCard } from '@/features/feed/PostCard';
import { useGamePosts } from '@/features/feed/queries';
import { colors, fontSize, space } from '@/theme/tokens';

export type GamePostsProps = {
  gameId: string;
  igdbId: number;
};

/** What the community wrote about a game. Lives inside the game page's scroll view. */
export function GamePosts({ gameId, igdbId }: GamePostsProps) {
  const router = useRouter();
  const query = useGamePosts(gameId);
  const { data, hasNextPage, isFetchingNextPage, isError, fetchNextPage, refetch } = query;
  const open = (id: string) => router.push(`/posts/${id}` as Href);
  const posts = data?.pages.flatMap((page) => page.items);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>
        Posts
      </Text>
      <Button
        label="Publicar sobre este jogo"
        onPress={() => router.push(`/posts/new?igdbId=${igdbId}` as Href)}
      />
      {posts ? (
        posts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ninguém publicou sobre este jogo</Text>
            <Text style={styles.muted}>Seja a primeira pessoa a contar o que achou.</Text>
          </View>
        ) : (
          <>
            {posts.map((post) =>
              post.type === 'activity' ? (
                <ActivityCard
                  key={post.id}
                  post={post}
                  hideGame
                  onPress={() => open(post.id)}
                />
              ) : (
                <PostCard
                  key={post.id}
                  post={post}
                  hideGame
                  onPress={() => open(post.id)}
                />
              ),
            )}
            {hasNextPage ? (
              <Button
                label="Carregar mais"
                variant="secondary"
                loading={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              />
            ) : null}
          </>
        )
      ) : isError ? (
        <View style={styles.empty}>
          <Text style={styles.muted}>Não foi possível carregar os posts</Text>
          <Button label="Tentar de novo" variant="text" onPress={() => void refetch()} />
        </View>
      ) : (
        <ActivityIndicator accessibilityLabel="Carregando" color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  empty: { gap: space.xs },
  emptyTitle: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: '600' },
});
