import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import type { UserSummary } from '@/features/games/types';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, space, threadLine } from '@/theme/tokens';

import { PostPreview } from './embeds/PostPreview';
import { postFeedRowLayout } from './PostFeedItem';
import { PostMeta } from './PostMeta';
import { displayName, itemHref, type PostReference } from './types';

type PostReplyRowProps = {
  author: UserSummary;
  content: string;
  createdAt: Date;
  post: PostReference;
  hideTopBorder?: boolean;
  inThread?: boolean;
  hasReplyBelow?: boolean;
  onOpenPost?: () => void;
  testID?: string;
};

export const PostReplyRow = memo(function PostReplyRow({
  author, content, createdAt, post, hideTopBorder, inThread, hasReplyBelow, onOpenPost, testID,
}: PostReplyRowProps) {
  const router = useRouter();
  const name = displayName(author);
  const context = `Respondendo ${post.type === 'activity' ? 'à atividade' : 'ao post'} de @${post.author.username}`;
  const label = `Resposta de ${name}, ${formatRelativeTime(createdAt)}. ${context}. ${content}`;

  return (
    <View testID={testID} style={[styles.row, inThread && styles.threadRow, !inThread && !hideTopBorder && styles.topBorder]}>
      <View style={styles.avatarColumn}>
        <ProfileLink user={author} hitSlop={4}>
          <Avatar uri={resolveImageUrl(author.avatarUrl)} name={name} size={postFeedRowLayout.avatarSize} />
        </ProfileLink>
        {hasReplyBelow ? <View style={styles.threadLine} /> : null}
      </View>
      <View style={[styles.content, inThread && styles.threadContent]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onOpenPost ?? (() => router.push(itemHref(post.id, post.type)))}
          style={({ pressed }) => [styles.reply, pressed && styles.pressed]}
        >
          <PostMeta author={author} createdAt={createdAt} linked={false} />
          {!inThread ? (
            <View style={styles.context}>
              <Ionicons name="return-up-forward-outline" size={14} color={colors.primary} />
              <Text size="xs" tone="medium" numberOfLines={1} style={styles.contextText}>{context}</Text>
            </View>
          ) : null}
          <Text testID={inThread ? undefined : 'profile-reply-text'} numberOfLines={inThread ? 4 : undefined}>{content}</Text>
        </Pressable>
        {!inThread ? <PostPreview post={post} kind="reply" testID="reply-post-preview" /> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  threadRow: {
    paddingLeft: postFeedRowLayout.paddingLeft,
    paddingRight: postFeedRowLayout.paddingRight,
    paddingVertical: 0,
    gap: postFeedRowLayout.gap,
  },
  topBorder: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  avatarColumn: { alignItems: 'center' },
  content: { flex: 1, minWidth: 0, gap: space.sm },
  threadContent: { paddingBottom: space.md },
  threadLine: { flex: 1, width: threadLine, marginVertical: space.xs, backgroundColor: colors.borderMedium },
  reply: { gap: space.xs },
  pressed: { opacity: 0.72 },
  context: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  contextText: { flexShrink: 1 },
});
