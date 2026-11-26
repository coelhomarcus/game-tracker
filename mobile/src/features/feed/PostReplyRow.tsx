import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import type { UserSummary } from '@/features/games/types';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, space } from '@/theme/tokens';

import { PostPreview } from './embeds/PostPreview';
import { PostMeta } from './PostMeta';
import { displayName, itemHref, type PostReference } from './types';

type PostReplyRowProps = {
  author: UserSummary;
  content: string;
  createdAt: Date;
  post: PostReference;
  hideTopBorder?: boolean;
  testID?: string;
};

export const PostReplyRow = memo(function PostReplyRow({ author, content, createdAt, post, hideTopBorder, testID }: PostReplyRowProps) {
  const router = useRouter();
  const name = displayName(author);
  const context = `Respondendo ${post.type === 'activity' ? 'à atividade' : 'ao post'} de @${post.author.username}`;
  const label = `Resposta de ${name}, ${formatRelativeTime(createdAt)}. ${context}. ${content}`;

  return (
    <View testID={testID} style={[styles.row, !hideTopBorder && styles.topBorder]}>
      <ProfileLink user={author} hitSlop={4} style={styles.avatar}>
        <Avatar uri={resolveImageUrl(author.avatarUrl)} name={name} size={42} />
      </ProfileLink>
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => router.push(itemHref(post.id, post.type))}
          style={({ pressed }) => [styles.reply, pressed && styles.pressed]}
        >
          <PostMeta author={author} createdAt={createdAt} linked={false} />
          <View style={styles.context}>
            <Ionicons name="return-up-forward-outline" size={14} color={colors.primary} />
            <Text size="xs" tone="medium" numberOfLines={1} style={styles.contextText}>{context}</Text>
          </View>
          <Text testID="profile-reply-text">{content}</Text>
        </Pressable>
        <PostPreview post={post} kind="reply" testID="reply-post-preview" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  topBorder: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  avatar: { alignSelf: 'flex-start' },
  content: { flex: 1, minWidth: 0, gap: space.sm },
  reply: { gap: space.xs },
  pressed: { opacity: 0.72 },
  context: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  contextText: { flexShrink: 1 },
});
