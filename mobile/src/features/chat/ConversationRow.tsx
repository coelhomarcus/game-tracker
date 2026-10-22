import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, space } from '@/theme/tokens';

import type { Conversation } from './types';

const AVATAR_SIZE = 48;
const NO_MESSAGE = 'Nenhuma mensagem';

export type ConversationRowProps = {
  conversation: Conversation;
  onPress: () => void;
};

export function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const selfId = useSession((state) => state.user?.id);
  const { otherUser, lastMessage, unread } = conversation;
  const name = otherUser ? displayName(otherUser) : 'Conversa';
  const preview = lastMessage
    ? `${lastMessage.senderId === selfId ? 'Você: ' : ''}${lastMessage.content}`
    : NO_MESSAGE;
  const time = lastMessage ? formatRelativeTime(lastMessage.createdAt) : null;
  const label = [name, unread ? 'Não lida' : null, preview, time].filter(Boolean).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.row}
    >
      <Avatar uri={resolveImageUrl(otherUser?.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.column}>
        <Text numberOfLines={1} weight={unread ? 'bold' : 'normal'} tone="high">
          {name}
        </Text>
        <Text numberOfLines={1} size="sm" weight={unread ? 'bold' : 'normal'} tone={unread ? 'default' : 'medium'}>
          {preview}
        </Text>
      </View>
      <View style={styles.meta}>
        {time ? (
          <Text size="xs" tone="medium">
            {time}
          </Text>
        ) : null}
        {unread ? <View testID="conversation-unread-dot" style={styles.dot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 64,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  column: { flex: 1, gap: space.xs },
  meta: { alignItems: 'flex-end', gap: space.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
});
