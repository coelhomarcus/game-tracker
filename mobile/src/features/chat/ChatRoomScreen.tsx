import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { KeyboardChatScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, EmptyState, Screen, Text } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { ApiError } from '@/lib/http/errors';
import { colors, radii, space } from '@/theme/tokens';

import { ChatComposer, useTypingSignal } from './ChatComposer';
import { ChatHeaderMenu, ChatHeaderTitle } from './ChatHeader';
import { useChatStore, type PendingMessage } from './chatStore';
import { ConnectionBanner } from './ConnectionBanner';
import { DateDivider } from './DateDivider';
import { groupMessages, type GroupedItem } from './groupMessages';
import { MessageBubble, type BubbleMessage } from './MessageBubble';
import { useConversation, useMessages } from './queries';
import type { Message } from './types';

// The API answers 500 to an id that is not a UUID, so such an address is simply not a conversation.
const CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Up to this far (px) from the newest message the person is following the conversation. */
const NEAR_BOTTOM = 80;
const NO_PENDING: PendingMessage[] = [];
// Also clears the room's title and "…" when its first page answers 404.
const NOT_FOUND_OPTIONS = { title: '', headerTitle: '', headerRight: undefined };

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Route entry: validates the address, then opens the conversation. */
export function ChatRoomScreen() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const conversationId = firstParam(params.conversationId)?.trim() ?? '';
  if (!CONVERSATION_ID_PATTERN.test(conversationId)) return <ConversationNotFound />;
  return <ChatRoomLoader conversationId={conversationId} />;
}

function ConversationNotFound() {
  const router = useRouter();
  return (
    <Screen>
      {/* Also replaces a room's avatar and name when its first page answers 404. */}
      <Stack.Screen options={NOT_FOUND_OPTIONS} />
      <View style={styles.center}>
        <EmptyState
          title="Conversa não encontrada"
          action={{
            label: 'Voltar',
            onPress: () => (router.canGoBack() ? router.back() : router.replace('/messages')),
          }}
        />
      </View>
    </Screen>
  );
}

function ChatRoomLoader({ conversationId }: { conversationId: string }) {
  const messages = useMessages(conversationId);
  // A 404 closes the room (and leaves it): the conversation does not exist or is not mine.
  if (messages.error instanceof ApiError && messages.error.status === 404) {
    return <ConversationNotFound />;
  }
  return <ChatRoom conversationId={conversationId} messages={messages} />;
}

// ---------- items ----------

type MessageRow = BubbleMessage & {
  key: string;
  senderId: string;
  /** Set while the message is still pending here. */
  clientMessageId: string | null;
};

type RoomItem = GroupedItem<MessageRow>;

/**
 * Newest first, for the inverted list: pending messages (they go out last) above the server's.
 * A server copy of a pending message (same clientMessageId) replaces it, under the same key.
 */
function buildRows(
  server: Message[],
  pending: PendingMessage[],
  selfId: string | undefined,
  otherName: string,
): MessageRow[] {
  const rows: MessageRow[] = [];
  const seen = new Set<string>();
  const confirmed = new Set<string>();
  for (const message of server) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    if (message.clientMessageId) confirmed.add(message.clientMessageId);
    const mine = message.senderId === selfId;
    rows.push({
      // The same key before and after confirmation, so the bubble is not recreated.
      key: `m-${message.clientMessageId ?? message.id}`,
      senderId: message.senderId,
      clientMessageId: null,
      content: message.content,
      createdAt: message.createdAt,
      mine,
      senderName: mine ? '' : displayName(message.sender) || otherName,
      status: 'sent',
    });
  }
  const waiting = pending
    .filter((item) => !confirmed.has(item.clientMessageId))
    .reverse()
    .map<MessageRow>((item) => ({
      key: `m-${item.clientMessageId}`,
      senderId: selfId ?? '',
      clientMessageId: item.clientMessageId,
      content: item.content,
      createdAt: item.createdAt,
      mine: true,
      senderName: '',
      status: item.status,
      reason: item.refusal,
    }));
  return [...waiting, ...rows];
}

const keyExtractor = (item: RoomItem) => item.key;

// ---------- room ----------

type ChatRoomProps = {
  conversationId: string;
  messages: ReturnType<typeof useMessages>;
};

function ChatRoom({ conversationId, messages }: ChatRoomProps) {
  const insets = useSafeAreaInsets();
  const selfId = useSession((state) => state.user?.id);
  const conversation = useConversation(conversationId).data;
  const otherUser = conversation?.otherUser ?? null;
  const otherName = otherUser ? displayName(otherUser) : 'Conversa';
  const pending = useChatStore((state) => state.pending[conversationId] ?? NO_PENDING);
  const retry = useChatStore((state) => state.retry);
  const discard = useChatStore((state) => state.discard);
  const typing = useTypingSignal(conversationId);
  const stopTyping = typing.stop;

  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = messages;
  // Opened only once the conversation is known to exist: the first page loaded, or failed with
  // something other than a 404 (the loader shows a 404 as not found instead of this room).
  const ready = data !== undefined || messages.isError;

  // Open while on screen: the realtime bridge joins the room (asks who is online, refetches what
  // was sent while away and then marks it read) and leaves it when this clears. Typing stops
  // before leaving, since the room is needed to send it.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      useChatStore.getState().setOpenConversation(conversationId);
      return () => {
        stopTyping();
        const store = useChatStore.getState();
        if (store.openConversationId === conversationId) store.setOpenConversation(null);
      };
    }, [ready, conversationId, stopTyping]),
  );

  // Stable across scrolls and new messages, so the header is not set again on each render. The
  // title reads typing and presence from the store itself, the menu the conversation.
  const headerOptions = useMemo(
    () => ({
      headerTitle: () => <ChatHeaderTitle conversationId={conversationId} otherUser={otherUser} />,
      headerRight: () => <ChatHeaderMenu conversationId={conversationId} />,
    }),
    [conversationId, otherUser],
  );

  const rows = useMemo(
    () =>
      buildRows(data?.pages.flatMap((item) => item.items) ?? [], pending, selfId, otherName),
    [data, pending, selfId, otherName],
  );
  const items = useMemo(() => groupMessages(rows, new Date()), [rows]);

  const listRef = useRef<FlatList<RoomItem>>(null);
  // Pending rows sit above the server's, so the newest incoming message is looked up on its own.
  const newestIncoming = rows.find((row) => !row.mine);
  const newestServerAt = rows.find((row) => row.status === 'sent')?.createdAt.getTime();
  // Set while the person reads older messages: the newest incoming message and the newest server
  // time when they scrolled away. The list keeps their place, so someone else's message arriving
  // meanwhile is announced instead. Older pages are earlier than `seenAt` and announce nothing.
  const [away, setAway] = useState<{ seenKey: string | undefined; seenAt: number } | null>(null);
  const newBelow =
    away !== null &&
    newestIncoming !== undefined &&
    newestIncoming.key !== away.seenKey &&
    newestIncoming.createdAt.getTime() > away.seenAt;

  function scrollToNewest() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setAway(null);
  }

  // What I just sent from here always shows: follow it to the bottom. Only a newer pending
  // message counts, not a discard revealing an older one, nor my messages from another device.
  const lastSentAt = pending.length > 0 ? pending[pending.length - 1].createdAt.getTime() : undefined;
  const followedAt = useRef(lastSentAt);
  useEffect(() => {
    if (lastSentAt === undefined) return;
    if (followedAt.current !== undefined && lastSentAt <= followedAt.current) return;
    followedAt.current = lastSentAt;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [lastSentAt]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Inverted: offset 0 is the newest message.
    if (event.nativeEvent.contentOffset.y > NEAR_BOTTOM) {
      if (away === null) {
        setAway({ seenKey: newestIncoming?.key, seenAt: newestServerAt ?? -Infinity });
      }
    } else if (away !== null) {
      setAway(null);
    }
  }

  function loadOlder() {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      // A second call while this one runs joins it instead of starting over.
      void fetchNextPage({ cancelRefetch: false });
    }
  }

  const renderItem = ({ item }: { item: RoomItem }) => {
    if (item.kind === 'divider') return <DateDivider label={item.label} />;
    const row = item.message;
    const clientMessageId = row.clientMessageId;
    return (
      <MessageBubble
        message={row}
        isFirstInGroup={item.isFirstInGroup}
        isLastInGroup={item.isLastInGroup}
        // A refusal (a block, the recipient's policy) would only repeat: the reason stays, the retry goes.
        onRetry={
          clientMessageId && !row.reason ? () => retry(conversationId, clientMessageId) : undefined
        }
        onDiscard={clientMessageId ? () => discard(conversationId, clientMessageId) : undefined}
      />
    );
  };

  // In the inverted list the footer sits at the top, above the oldest message.
  let older: ReactElement | null = null;
  // A retry in flight keeps the error flag until it settles: loading wins.
  if (isFetchingNextPage) {
    older = (
      <View style={styles.older}>
        <ActivityIndicator accessibilityLabel="Carregando mensagens" color={colors.textMedium} />
      </View>
    );
  } else if (isFetchNextPageError) {
    older = (
      <View style={styles.older}>
        <Text size="sm" tone="medium" style={styles.olderText}>
          Não foi possível carregar mensagens mais antigas.
        </Text>
        <Button
          label="Tentar de novo"
          variant="ghost"
          onPress={() => void fetchNextPage({ cancelRefetch: false })}
        />
      </View>
    );
  } else if (!hasNextPage) {
    older = (
      <View style={styles.older}>
        <Text size="sm" tone="medium" style={styles.olderText}>
          Início da conversa
        </Text>
      </View>
    );
  }

  // The list lifts its newest messages with the keyboard by as much as the composer rises: the
  // keyboard's height less the bottom inset the composer already sits above.
  const renderScrollComponent = useCallback(
    (props: ScrollViewProps) => (
      <KeyboardChatScrollView {...props} inverted keyboardLiftBehavior="always" offset={insets.bottom} />
    ),
    [insets.bottom],
  );
  // Closed, the composer sits above the bottom inset (the screen pads it); open, on the keyboard,
  // which covers that inset too.
  const stickyOffset = useMemo(() => ({ closed: 0, opened: insets.bottom }), [insets.bottom]);

  let body: ReactElement;
  if (data === undefined) {
    // A failed background refetch keeps the loaded messages: the error shows only without them.
    body = messages.isError ? (
      <View style={styles.center}>
        <EmptyState
          title="Não foi possível carregar as mensagens"
          action={{ label: 'Tentar de novo', onPress: () => void messages.refetch() }}
        />
      </View>
    ) : (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.primary} />
      </View>
    );
  } else if (items.length === 0 && !hasNextPage) {
    body = (
      <View testID="chat-empty" style={styles.center}>
        <EmptyState title={`Diga oi para ${otherName}`} message="As mensagens aparecem aqui." />
      </View>
    );
  } else {
    body = (
      <View style={styles.fill}>
        <FlatList
          ref={listRef}
          testID="message-list"
          inverted
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderScrollComponent={renderScrollComponent}
          ListFooterComponent={older ?? undefined}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.5}
          onScroll={onScroll}
          scrollEventThrottle={100}
          // Keeps the reader's place when messages arrive; follows them near the bottom.
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: NEAR_BOTTOM,
          }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          style={styles.fill}
        />
        {newBelow ? (
          <KeyboardStickyView
            testID="new-messages-sticky"
            pointerEvents="box-none"
            offset={stickyOffset}
            style={styles.pillArea}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Novas mensagens"
              onPress={scrollToNewest}
              style={styles.pill}
            >
              <Text size="sm" weight="bold" tone="high">
                Novas mensagens
              </Text>
            </Pressable>
          </KeyboardStickyView>
        ) : null}
      </View>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={headerOptions} />
      {body}
      <KeyboardStickyView testID="composer-sticky" offset={stickyOffset} style={styles.footer}>
        <ConnectionBanner />
        <ChatComposer
          conversationId={conversationId}
          onChangeText={typing.keystroke}
          onSent={stopTyping}
        />
      </KeyboardStickyView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  // Inverted: the top padding is under the newest message, clear of the composer's fade.
  content: { paddingTop: space.md, paddingBottom: space.sm },
  // Above the list, so the composer's fade draws over the messages under it.
  footer: { zIndex: 1 },
  older: { alignItems: 'center', gap: space.xs, padding: space.lg },
  olderText: { textAlign: 'center' },
  pillArea: { position: 'absolute', left: 0, right: 0, bottom: space.sm, alignItems: 'center' },
  pill: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radii.full,
    backgroundColor: colors.selected,
  },
});
