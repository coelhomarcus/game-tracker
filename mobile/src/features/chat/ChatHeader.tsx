import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { HEADER_SLOT_SIZE, HEADER_TOUCH_SIZE } from '@/components/Layout/Header';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, radii, space } from '@/theme/tokens';

import { useChatStore } from './chatStore';
import { ConversationMenu, LeaveConversationDialog } from './ConversationActions';
import { useConversation, useLeaveConversation } from './queries';
import type { Conversation } from './types';

const AVATAR_SIZE = 40;

export type ChatHeaderTitleProps = { conversationId: string; otherUser: UserSummary | null };

/**
 * The room's title: Avatar 40, the name and the @handle, which presses to the profile. Typing
 * and presence come from the store, so the header options never change with them.
 */
export function ChatHeaderTitle({ conversationId, otherUser }: ChatHeaderTitleProps) {
  const router = useRouter();
  const typing = useChatStore((state) => state.typing[conversationId] === true);
  const online = useChatStore((state) => (otherUser ? state.online[otherUser.id] === true : false));
  const name = otherUser ? displayName(otherUser) : 'Conversa';
  const status = typing ? 'digitando…' : online ? 'online' : null;
  const handle = otherUser?.username ? `@${otherUser.username}` : null;

  const content = (
    <>
      <Avatar uri={resolveImageUrl(otherUser?.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.text}>
        <Text numberOfLines={1} size="lg" weight="semibold" leading="tight" tone="high">
          {name}
        </Text>
        {handle || status ? (
          <View style={styles.subtitle}>
            {handle ? (
              <Text numberOfLines={1} size="xs" tone="medium" style={styles.handle}>
                {handle}
              </Text>
            ) : null}
            {handle && status ? (
              <Text size="xs" tone="medium">
                ·
              </Text>
            ) : null}
            {status ? (
              <Text size="xs" tone={typing ? 'primary' : 'medium'}>
                {status}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </>
  );

  if (!otherUser) return <View style={styles.title}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Perfil de ${name}${status ? `, ${status}` : ''}`}
      onPress={() => router.push(`/users/${otherUser.id}` as Href)}
      style={styles.title}
    >
      {content}
    </Pressable>
  );
}

/**
 * The room's "…": see the profile, mute or unmute the conversation, block the person (the
 * profile's confirmation) and leave, which goes back to the list once confirmed.
 */
export function ChatHeaderMenu({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const current = useConversation(conversationId).data ?? null;
  // Leaving drops it from the list while the room is still popping: keep the last one known.
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);
  const conversation = current ?? last;
  const leave = useLeaveConversation();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState<Conversation | null>(null);

  if (!conversation) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Mais opções"
        onPress={() => setOpen(true)}
        style={styles.button}
      >
        {({ pressed }) => (
          <View style={[styles.circle, pressed && styles.pressed]}>
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
          </View>
        )}
      </Pressable>
      {/* Stays mounted after the sheet closes: the block confirmation lives in it. */}
      <ConversationMenu
        conversation={conversation}
        visible={open}
        offerMarkRead={false}
        onClose={() => setOpen(false)}
        onLeave={setLeaving}
      />
      <LeaveConversationDialog
        conversation={leaving}
        onConfirm={(left) => {
          setLeaving(null);
          // Off the room first: leaving drops its messages, which the open room would fetch again.
          if (router.canGoBack()) router.back();
          else router.replace('/messages');
          leave.mutate(left.id);
        }}
        onCancel={() => setLeaving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: HEADER_TOUCH_SIZE,
    flexShrink: 1,
  },
  text: { flexShrink: 1 },
  subtitle: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  handle: { flexShrink: 1 },
  button: {
    minWidth: HEADER_TOUCH_SIZE,
    minHeight: HEADER_TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: HEADER_SLOT_SIZE,
    height: HEADER_SLOT_SIZE,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.bgContrast25 },
});
