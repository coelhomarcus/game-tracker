import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, fontSize, space } from '@/theme/tokens';

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
        <Text numberOfLines={1} style={[styles.name, unread ? styles.bold : null]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[styles.preview, unread ? styles.previewUnread : null]}>
          {preview}
        </Text>
      </View>
      <View style={styles.meta}>
        {time ? <Text style={styles.time}>{time}</Text> : null}
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
  name: { color: colors.textStrong, fontSize: fontSize.md },
  bold: { fontWeight: 'bold' },
  preview: { color: colors.textMuted, fontSize: fontSize.sm },
  previewUnread: { color: colors.text, fontWeight: 'bold' },
  meta: { alignItems: 'flex-end', gap: space.xs },
  time: { color: colors.textMuted, fontSize: fontSize.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
