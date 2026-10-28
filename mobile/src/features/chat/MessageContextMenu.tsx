import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components';
import type { IoniconName } from '@/features/library/status';
import { colors, hairline, radii, space, type } from '@/theme/tokens';

import { BubbleContent, type BubbleMessage } from './MessageBubble';
import type { Reaction } from './types';

/** The reactions offered first, in this order. */
export const QUICK_REACTIONS = ['😂', '❤️', '👍', '😮', '😢', '🔥'] as const;

/** The "+" grid: common emoji past the quick ones. */
export const MORE_REACTIONS = [
  '😀', '😁', '😅', '🤣', '😊', '😍',
  '🥰', '😘', '😎', '🤔', '🙄', '😴',
  '🥺', '😭', '😡', '🤯', '😱', '🥳',
  '👏', '🙏', '💪', '👀', '🎉', '💯',
  '✨', '💔', '👎', '🤝', '🎮', '🏆',
] as const;

const EMOJI_FONT = type.size._3xl;
const PREVIEW_MAX_LINES = 8;
/** Two-digit hex alpha for 60% opacity, appended to a 6-digit hex token. */
const ALPHA_60 = '99';

export type MessageMenuAction = 'reply' | 'copy' | 'hide' | 'discard';

export type MessageMenuTarget = {
  message: BubbleMessage;
  /** Confirmed by the server: it can be reacted to, replied to and deleted for me. */
  sent: boolean;
};

export type MessageContextMenuProps = {
  /** The pressed message; `null` keeps the menu closed. */
  target: MessageMenuTarget | null;
  selfId: string | undefined;
  /** An emoji picked: adds it, or takes it back when it is already mine. */
  onReact: (emoji: string) => void;
  onAction: (action: MessageMenuAction) => void;
  onClose: () => void;
};

type Option = { action: MessageMenuAction; label: string; icon: IoniconName; destructive?: boolean };

const SENT_OPTIONS: Option[] = [
  { action: 'reply', label: 'Responder', icon: 'arrow-undo-outline' },
  { action: 'copy', label: 'Copiar texto', icon: 'copy-outline' },
  { action: 'hide', label: 'Apagar para mim', icon: 'trash-outline', destructive: true },
];
const PENDING_OPTIONS: Option[] = [
  { action: 'copy', label: 'Copiar texto', icon: 'copy-outline' },
  { action: 'discard', label: 'Descartar', icon: 'close-circle-outline', destructive: true },
];

/** The emoji of mine on a message. */
function myEmoji(reactions: Reaction[] | undefined, selfId: string | undefined): Set<string> {
  return new Set((reactions ?? []).filter((item) => item.userId === selfId).map((item) => item.emoji));
}

/**
 * What a long press on a message opens: the message itself on top, a row of reactions (with "+"
 * for a grid of more), then its actions. A confirmed message offers "Responder", "Copiar texto"
 * and "Apagar para mim"; one still pending or failed only "Copiar texto" and "Descartar", and no
 * reactions. Every choice closes the menu.
 */
export function MessageContextMenu({ target, selfId, onReact, onAction, onClose }: MessageContextMenuProps) {
  const insets = useSafeAreaInsets();
  const [showAll, setShowAll] = useState(false);
  // Closed, it forgets the grid: the next message opens on the quick row. (While open the target
  // changes as the message does, e.g. a reaction arriving, and the grid stays.)
  if (!target && showAll) setShowAll(false);
  if (!target) return null;

  const { message, sent } = target;
  const mine = myEmoji(message.reactions, selfId);
  const options = sent ? SENT_OPTIONS : PENDING_OPTIONS;
  const close = () => onClose();
  const pick = (emoji: string) => {
    onReact(emoji);
    close();
  };

  const emojiButton = (emoji: string) => {
    const selected = mine.has(emoji);
    return (
      <Pressable
        key={emoji}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Remover reação ${emoji}` : `Reagir com ${emoji}`}
        accessibilityState={{ selected }}
        onPress={() => pick(emoji)}
        style={styles.emojiTouch}
      >
        <View style={[styles.emojiCircle, selected && styles.emojiSelected]}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.root}>
        <Pressable
          testID="message-menu-backdrop"
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={close}
        >
          <View style={styles.backdrop} />
        </Pressable>
        <View
          testID="message-menu"
          accessibilityViewIsModal
          pointerEvents="box-none"
          style={[
            styles.content,
            message.mine ? styles.alignEnd : styles.alignStart,
            { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.lg },
          ]}
        >
          <View testID="message-menu-preview" style={[styles.preview, message.mine ? styles.alignEnd : styles.alignStart]}>
            <BubbleContent
              content={message.content}
              mine={message.mine}
              pending={!sent}
              numberOfLines={PREVIEW_MAX_LINES}
            />
          </View>
          {sent && !showAll ? (
            <View testID="message-menu-reactions" style={styles.reactions}>
              {QUICK_REACTIONS.map(emojiButton)}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mais reações"
                onPress={() => setShowAll(true)}
                style={styles.emojiTouch}
              >
                <View style={styles.emojiCircle}>
                  <Ionicons name="add" size={24} color={colors.text} />
                </View>
              </Pressable>
            </View>
          ) : null}
          {sent && showAll ? (
            <View testID="message-menu-emoji-grid" style={styles.grid}>
              {[...QUICK_REACTIONS, ...MORE_REACTIONS].map(emojiButton)}
            </View>
          ) : (
            <View style={styles.actions}>
              {options.map((option) => (
                <Pressable
                  key={option.action}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  onPress={() => {
                    onAction(option.action);
                    close();
                  }}
                  style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
                >
                  <Text tone={option.destructive ? 'danger' : 'default'} style={styles.actionLabel}>
                    {option.label}
                  </Text>
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={option.destructive ? colors.danger : colors.text}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const EMOJI_TOUCH = 48;
const GRID_COLUMNS = 6;

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: `${colors.bg}${ALPHA_60}` },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  preview: { alignSelf: 'stretch', paddingHorizontal: space.xs },
  reactions: {
    flexDirection: 'row',
    maxWidth: '100%',
    borderRadius: radii.full,
    backgroundColor: colors.bgContrast50,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
  grid: {
    width: EMOJI_TOUCH * GRID_COLUMNS + space.sm * 2,
    maxWidth: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: space.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgContrast50,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
  emojiTouch: { width: EMOJI_TOUCH, height: EMOJI_TOUCH, alignItems: 'center', justifyContent: 'center' },
  emojiCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiSelected: { backgroundColor: colors.selected },
  emoji: { fontSize: EMOJI_FONT, lineHeight: Math.round(EMOJI_FONT * 1.2) },
  actions: {
    minWidth: 220,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgContrast50,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
  action: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  actionPressed: { backgroundColor: colors.bgContrast25 },
  actionLabel: { flex: 1 },
});
