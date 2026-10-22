import { useRouter, type Href } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { ActivityCard } from '@/features/feed/ActivityCard';
import { PostCard } from '@/features/feed/PostCard';
import { useGamePosts } from '@/features/feed/queries';
import { colors, space } from '@/theme/tokens';

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
      <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
        Posts
      </Text>
      <Button
        label="Publicar sobre este jogo"
        onPress={() => router.push(`/posts/new?igdbId=${igdbId}` as Href)}
      />
      {posts ? (
        posts.length === 0 ? (
          <View style={styles.empty}>
            <Text weight="semibold" tone="high">
              Ninguém publicou sobre este jogo
            </Text>
            <Text size="sm" tone="medium">
              Seja a primeira pessoa a contar o que achou.
            </Text>
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
                color="secondary"
                loading={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              />
            ) : null}
          </>
        )
      ) : isError ? (
        <View style={styles.empty}>
          <Text size="sm" tone="medium">
            Não foi possível carregar os posts
          </Text>
          <Button label="Tentar de novo" variant="ghost" onPress={() => void refetch()} />
        </View>
      ) : (
        <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.md },
  empty: { gap: space.xs },
});
