import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { GameCover, Text } from '@/components';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { PostMeta } from '../PostMeta';
import { displayName, itemHref, type PostReference } from '../types';
import { ImageGrid } from './ImageGrid';

type PostPreviewProps = {
  post: PostReference;
  kind: 'quote' | 'reply';
  testID?: string;
  /** Null renders a static preview in the post editor. */
  onPress?: (() => void) | null;
};

export function PostPreview({ post, kind, testID, onPress }: PostPreviewProps) {
  const router = useRouter();
  const name = displayName(post.author);
  const open = () => router.push(itemHref(post.id, post.type));

  if (post.type === 'activity') {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Ver atividade de ${name}`}
        onPress={open}
        style={styles.activityLink}
      >
        <Ionicons name="game-controller-outline" size={16} color={colors.primary} />
        <Text size="sm" tone="primary" weight="medium">Ver atividade</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.primary} />
      </Pressable>
    );
  }

  const quote = kind === 'quote';
  const time = post.createdAt ? `, ${formatRelativeTime(post.createdAt)}` : '';
  const label = `${quote ? 'Post citado' : 'Post original'} de ${name}${time}`;
  const image = post.images?.[0];
  const imageCount = post.images?.length ?? 0;
  const imageLabel = imageCount === 1 ? '1 imagem' : `${imageCount} imagens`;
  const excerpt = post.content || (image ? imageLabel : '');
  const accessibleSummary = [excerpt, post.game?.name].filter(Boolean).join(', ');
  const accessibilityLabel = accessibleSummary ? `${label}: ${accessibleSummary}` : label;

  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.meta}>
          <PostMeta author={post.author} createdAt={post.createdAt} linked={false} avatarSize={22} />
        </View>
        {onPress !== null ? <Ionicons name="chevron-forward" size={14} color={colors.textMedium} /> : null}
      </View>
      {excerpt || post.game ? (
        <View style={styles.body}>
          <View style={styles.summary}>
            {excerpt ? <Text size="sm" numberOfLines={quote ? 4 : 3}>{excerpt}</Text> : null}
            {post.game ? (
              <View style={styles.game}>
                <Ionicons name="game-controller-outline" size={14} color={colors.textMedium} />
                <Text size="xs" tone="medium" numberOfLines={1} style={styles.gameName}>{post.game.name}</Text>
              </View>
            ) : null}
          </View>
          {image ? (
            <View style={styles.thumbnail}>
              <ImageGrid images={[image]} interactive={false} aspect={1} />
            </View>
          ) : post.game?.coverUrl ? (
            <GameCover width={38} name={post.game.name} url={post.game.coverUrl} decorative />
          ) : null}
        </View>
      ) : null}
    </>
  );

  return onPress === null ? (
    <View testID={testID} accessible accessibilityLabel={accessibilityLabel} style={styles.card}>{content}</View>
  ) : (
    <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={accessibilityLabel}
      onPress={onPress ?? open} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
    gap: space.xs,
  },
  pressed: { backgroundColor: colors.bgContrast50 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  meta: { flex: 1, minWidth: 0 },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  summary: { flex: 1, minWidth: 0, gap: space.xs },
  game: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  gameName: { flexShrink: 1 },
  thumbnail: { width: 56 },
  activityLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: space.xs, minHeight: 44 },
});
