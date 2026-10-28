import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { ConfirmDialog, OptionSheet, type OptionSheetOption } from '@/components';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { useModerationMenu, type ModerationMenu } from '@/features/profiles/moderationMenu';
import type { UserProfile } from '@/features/profiles/types';
import { haptic } from '@/lib/haptics';
import { queryClient } from '@/lib/queryClient';
import { colors, space } from '@/theme/tokens';

import { useMarkRead, useMuteConversation } from './queries';
import { showsUnread, type Conversation } from './types';

// ---------- swipe ----------

/** Dragged this far left, releasing marks the conversation read. */
export const MARK_READ_DISTANCE = 120;
/** Dragged this far left, releasing leaves the conversation (after a confirmation). */
export const LEAVE_DISTANCE = 225;
const ICON_SIZE = 32;
/** Horizontal travel before the swipe takes over; vertical travel first lets the list scroll. */
const ACTIVATE_OFFSET = 10;
/** Large enough that a drag to the right never activates (there is no action on that side). */
const NEVER = 10_000;
const SETTLE_MS = 200;

export type SwipeAction = 'none' | 'read' | 'leave';

/**
 * What releasing the row at `translationX` does: past 225 leave, past 120 mark read (only when
 * there is something to mark), nothing below. Runs on the UI thread as well.
 */
export function swipeActionAt(translationX: number, canMarkRead: boolean): SwipeAction {
  'worklet';
  const distance = -translationX;
  if (distance >= LEAVE_DISTANCE) return 'leave';
  if (canMarkRead && distance >= MARK_READ_DISTANCE) return 'read';
  return 'none';
}

/** The action the background shows while dragging: the next one the drag can reach. */
export function swipePreviewAt(translationX: number, canMarkRead: boolean): SwipeAction {
  'worklet';
  if (translationX >= 0) return 'none';
  return canMarkRead && -translationX < LEAVE_DISTANCE ? 'read' : 'leave';
}

/** True when the drag went from `previous` to a further action: each such crossing plays one haptic. */
export function crossedFurther(previous: SwipeAction, next: SwipeAction): boolean {
  'worklet';
  const rank = (action: SwipeAction) => (action === 'leave' ? 2 : action === 'read' ? 1 : 0);
  return rank(next) > rank(previous);
}

function playThresholdHaptic() {
  haptic('tap');
}

export type SwipeableConversationProps = {
  conversation: Conversation;
  /** Runs on release past a threshold: `read` marks it read, `leave` asks to leave. */
  onAction: (action: Exclude<SwipeAction, 'none'>) => void;
  children: ReactNode;
};

/**
 * Swipe a row left: the background turns `primary` with a double check past 120 (mark read, only
 * for an unread row) and `danger` with a trash can past 225 (leave). Each threshold plays one
 * haptic as it is crossed; releasing below 120 does nothing. A vertical move first leaves the
 * gesture to the list, and a gesture the system takes over (the Android back swipe) is cancelled
 * and does nothing either.
 */
export function SwipeableConversation({ conversation, onAction, children }: SwipeableConversationProps) {
  const canMarkRead = showsUnread(conversation);
  const reduceMotion = useReducedMotion();
  const [preview, setPreview] = useState<SwipeAction>('none');
  const translateX = useSharedValue(0);
  const width = useSharedValue(0);
  const reached = useSharedValue<SwipeAction>('none');
  const shown = useSharedValue<SwipeAction>('none');

  const pan = usePanGesture({
    testID: `conversation-swipe-${conversation.id}`,
    activeOffsetX: [-ACTIVATE_OFFSET, NEVER],
    failOffsetY: [-ACTIVATE_OFFSET, ACTIVATE_OFFSET],
    onUpdate: (event) => {
      'worklet';
      const limit = width.get() > 0 ? -width.get() : -NEVER;
      const x = Math.max(limit, Math.min(0, event.translationX));
      translateX.set(x);
      const next = swipePreviewAt(x, canMarkRead);
      if (next !== shown.get()) {
        shown.set(next);
        scheduleOnRN(setPreview, next);
      }
      const action = swipeActionAt(x, canMarkRead);
      const previous = reached.get();
      if (action !== previous) {
        reached.set(action);
        if (crossedFurther(previous, action)) scheduleOnRN(playThresholdHaptic);
      }
    },
    onDeactivate: (event) => {
      'worklet';
      // Cancelled: the list or the system (the Android back swipe) took the touch over.
      const action = event.canceled ? 'none' : swipeActionAt(Math.min(0, event.translationX), canMarkRead);
      if (action !== 'none') scheduleOnRN(onAction, action);
      reached.set('none');
      const clearIcon = () => {
        'worklet';
        shown.set('none');
        scheduleOnRN(setPreview, 'none');
      };
      if (reduceMotion) {
        translateX.set(0);
        clearIcon();
      } else {
        // The icon stays while the row slides back over it.
        translateX.set(
          withTiming(0, { duration: SETTLE_MS }, (finished) => {
            'worklet';
            if (finished) clearIcon();
          }),
        );
      }
    },
  });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.get() }] }));
  const backgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: canMarkRead
      ? interpolateColor(
          translateX.get(),
          [-LEAVE_DISTANCE, -LEAVE_DISTANCE + 40, -MARK_READ_DISTANCE, 0],
          [colors.danger, colors.primary, colors.primary, colors.bg],
        )
      : interpolateColor(translateX.get(), [-LEAVE_DISTANCE, 0], [colors.danger, colors.bg]),
  }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.get(), [0, 75], [0.15, 1], 'clamp'),
  }));

  const onLayout = (event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width);

  return (
    <GestureDetector gesture={pan}>
      <View onLayout={onLayout}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.underlay, backgroundStyle]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={iconStyle}>
            {preview === 'read' ? (
              <Ionicons testID="swipe-read-icon" name="checkmark-done" size={ICON_SIZE} color={colors.onPrimary} />
            ) : preview === 'leave' ? (
              <Ionicons testID="swipe-leave-icon" name="trash" size={ICON_SIZE} color={colors.onPrimary} />
            ) : null}
          </Animated.View>
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}

// ---------- leave confirmation ----------

export type LeaveConversationDialogProps = {
  /** The conversation to leave; `null` keeps the dialog closed. */
  conversation: Conversation | null;
  onConfirm: (conversation: Conversation) => void;
  onCancel: () => void;
};

export function LeaveConversationDialog({ conversation, onConfirm, onCancel }: LeaveConversationDialogProps) {
  const person = conversation?.otherUser;
  return (
    <ConfirmDialog
      visible={conversation !== null}
      title="Sair da conversa?"
      message={
        person
          ? `A conversa some da sua lista. Se @${person.username} mandar uma nova mensagem, ela volta.`
          : 'A conversa some da sua lista.'
      }
      confirmLabel="Sair"
      cancelLabel="Cancelar"
      destructive
      onConfirm={() => {
        if (conversation) onConfirm(conversation);
      }}
      onCancel={onCancel}
    />
  );
}

// ---------- long-press menu ----------

type MenuChoice = 'profile' | 'read' | 'mute' | 'block' | 'leave';

export type ConversationMenuProps = {
  conversation: Conversation;
  visible: boolean;
  onClose: () => void;
  /** "Sair da conversa": the screen asks for confirmation (shared with the swipe). */
  onLeave: (conversation: Conversation) => void;
  /** Offers "Marcar como lida" on an unread conversation; the open room is read already. */
  offerMarkRead?: boolean;
};

type MenuSheetProps = ConversationMenuProps & { moderation: ModerationMenu | null };

function MenuSheet({
  conversation,
  visible,
  onClose,
  onLeave,
  offerMarkRead = true,
  moderation,
}: MenuSheetProps) {
  const router = useRouter();
  const markRead = useMarkRead();
  const mute = useMuteConversation();
  const person = conversation.otherUser;

  const options: OptionSheetOption<MenuChoice>[] = [];
  if (person) options.push({ value: 'profile', label: 'Ver perfil', icon: 'person-outline' });
  if (offerMarkRead && showsUnread(conversation)) {
    options.push({ value: 'read', label: 'Marcar como lida', icon: 'checkmark-done-outline' });
  }
  options.push(
    conversation.muted
      ? { value: 'mute', label: 'Reativar conversa', icon: 'notifications-outline' }
      : { value: 'mute', label: 'Silenciar conversa', icon: 'notifications-off-outline' },
  );
  const block = moderation?.options.find((option) => option.value === 'block');
  if (block) options.push({ ...block, value: 'block' });
  options.push({ value: 'leave', label: 'Sair da conversa', icon: 'log-out-outline', destructive: true });

  return (
    <>
      <OptionSheet<MenuChoice>
        visible={visible}
        title={person ? displayName(person) : 'Conversa'}
        options={options}
        onSelect={(choice) => {
          if (choice === 'profile' && person) router.push(`/users/${person.id}` as Href);
          else if (choice === 'read') markRead.mutate(conversation.id);
          else if (choice === 'mute') mute.mutate({ conversationId: conversation.id, muted: !conversation.muted });
          else if (choice === 'block') moderation?.select('block');
          else if (choice === 'leave') onLeave(conversation);
        }}
        onClose={onClose}
      />
      {moderation?.dialog ?? null}
    </>
  );
}

function PersonMenu(props: ConversationMenuProps & { person: UserSummary }) {
  // A profile in the cache knows whether the person is already blocked; without one the menu
  // offers the block.
  const profile = queryClient.getQueryData<UserProfile>(['profile', props.person.id]);
  const moderation = useModerationMenu(props.person, { blocked: profile?.isBlockedByMe });
  return <MenuSheet {...props} moderation={moderation} />;
}

/**
 * The long-press menu of a conversation: see the profile, mark read (when unread), mute or unmute
 * the conversation, block the person (with the confirmation of the profile's menu) and leave.
 * Keep it mounted after the sheet closes: the block confirmation lives here.
 */
export function ConversationMenu(props: ConversationMenuProps) {
  const person = props.conversation.otherUser;
  return person ? <PersonMenu {...props} person={person} /> : <MenuSheet {...props} moderation={null} />;
}

const styles = StyleSheet.create({
  underlay: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
});
