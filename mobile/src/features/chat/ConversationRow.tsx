import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { haptic } from '@/lib/haptics';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, radii, space } from '@/theme/tokens';

import { formatConversationTime } from './formatConversationTime';
import { showsUnread, type Conversation } from './types';

const AVATAR_SIZE = 52;
const DOT_SIZE = 8;
const NO_MESSAGE = 'Nenhuma mensagem';

export type ConversationRowProps = {
  conversation: Conversation;
  onPress: () => void;
  /** Opens the conversation's menu; the row plays the long-press haptic first. */
  onLongPress?: () => void;
};

/**
 * One conversation in the list: avatar, name, time and unread dot, the @handle, then up to two
 * lines of the last message. Unread rows are tinted; a muted one shows a bell-off icon and never
 * looks unread. The background is opaque, so a swipe slides it over the action underneath.
 */
export function ConversationRow({ conversation, onPress, onLongPress }: ConversationRowProps) {
  const selfId = useSession((state) => state.user?.id);
  const { otherUser, lastMessage, muted } = conversation;
  const unread = showsUnread(conversation);
  const name = otherUser ? displayName(otherUser) : 'Conversa';
  const preview = lastMessage
    ? `${lastMessage.senderId === selfId ? 'Você: ' : ''}${lastMessage.content}`
    : NO_MESSAGE;
  const time = lastMessage ? formatConversationTime(lastMessage.createdAt) : null;
  const label = [name, unread ? 'Não lida' : null, muted ? 'Silenciada' : null, preview, time]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={
        onLongPress
          ? () => {
              haptic('longPress');
              onLongPress();
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.row,
        unread ? styles.unreadRow : null,
        pressed ? (unread ? styles.unreadPressed : styles.pressed) : null,
      ]}
    >
      <Avatar uri={resolveImageUrl(otherUser?.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.column}>
        <View style={styles.top}>
          <Text numberOfLines={1} weight="semibold" tone="high" style={styles.name}>
            {name}
          </Text>
          {muted ? (
            <Ionicons
              testID="conversation-muted-icon"
              name="notifications-off"
              size={14}
              color={colors.textMedium}
            />
          ) : null}
          <View style={styles.spacer} />
          {time ? (
            <Text size="sm" tone="medium">
              {time}
            </Text>
          ) : null}
          {unread ? <View testID="conversation-unread-dot" style={styles.dot} /> : null}
        </View>
        {otherUser ? (
          <Text numberOfLines={1} size="sm" tone="medium">{`@${otherUser.username}`}</Text>
        ) : null}
        <Text
          testID="conversation-preview"
          numberOfLines={2}
          weight={unread ? 'medium' : 'normal'}
          tone={unread ? 'default' : 'medium'}
        >
          {preview}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.bg,
  },
  unreadRow: { backgroundColor: colors.bgContrast25 },
  pressed: { backgroundColor: colors.bgContrast25 },
  unreadPressed: { backgroundColor: colors.bgContrast50 },
  column: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  name: { flexShrink: 1 },
  spacer: { flex: 1 },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    marginLeft: space.xs,
  },
});
