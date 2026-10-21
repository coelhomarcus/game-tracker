import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
  type Href,
} from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Avatar, Button, EmptyState, Screen } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { ApiError } from '@/lib/http/errors';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, fontSize, space } from '@/theme/tokens';

import { ChatComposer, useTypingSignal } from './ChatComposer';
import { useChatStore, type PendingMessage } from './chatStore';
import { ConnectionBanner } from './ConnectionBanner';
import { MessageBubble, type BubbleMessage } from './MessageBubble';
import { useConversation, useMarkRead, useMessages } from './queries';
import type { Message } from './types';

// The API answers 500 to an id that is not a UUID, so such an address is simply not a conversation.
const CONVERSATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Up to this far (px) from the newest message the person is following the conversation. */
const NEAR_BOTTOM = 80;
const HEADER_AVATAR_SIZE = 32;
const NO_PENDING: PendingMessage[] = [];

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
      <Stack.Screen options={{ title: '' }} />
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
  /** Set while the message is still pending here. */
  clientMessageId: string | null;
};

type RoomItem =
  | { kind: 'message'; key: string; row: MessageRow }
  | { kind: 'day'; key: string; label: string };

const pad = (value: number) => String(value).padStart(2, '0');

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** `Hoje`, `Ontem` or `dd/mm/aaaa`, in local time. */
function dayLabel(date: Date, now: Date): string {
  const day = startOfDay(date);
  if (day === startOfDay(now)) return 'Hoje';
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (day === yesterday) return 'Ontem';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Newest first, for the inverted list: pending messages (they go out last) above the server's,
 * and a day separator after the oldest message of each day, so it shows above that day.
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
      clientMessageId: item.clientMessageId,
      content: item.content,
      createdAt: item.createdAt,
      mine: true,
      senderName: '',
      status: item.status,
    }));
  return [...waiting, ...rows];
}

function withDays(rows: MessageRow[], now: Date): RoomItem[] {
  const items: RoomItem[] = [];
  rows.forEach((row, index) => {
    items.push({ kind: 'message', key: row.key, row });
    const older = rows[index + 1];
    if (!older || startOfDay(older.createdAt) !== startOfDay(row.createdAt)) {
      items.push({ kind: 'day', key: `day-${row.key}`, label: dayLabel(row.createdAt, now) });
    }
  });
  return items;
}

const keyExtractor = (item: RoomItem) => item.key;

function DaySeparator({ label }: { label: string }) {
  return (
    <View style={styles.day}>
      <Text style={styles.dayText}>{label}</Text>
    </View>
  );
}

// ---------- header ----------

type HeaderTitleProps = { conversationId: string; otherUser: UserSummary | null };

function ChatHeaderTitle({ conversationId, otherUser }: HeaderTitleProps) {
  const router = useRouter();
  const typing = useChatStore((state) => state.typing[conversationId] === true);
  const online = useChatStore((state) =>
    otherUser ? state.online[otherUser.id] === true : false,
  );
  const name = otherUser ? displayName(otherUser) : 'Conversa';
  const status = typing ? 'digitando…' : online ? 'online' : null;

  const content = (
    <>
      <Avatar uri={resolveImageUrl(otherUser?.avatarUrl)} name={name} size={HEADER_AVATAR_SIZE} />
      <View style={styles.headerText}>
        <Text numberOfLines={1} style={styles.headerName}>
          {name}
        </Text>
        {status ? <Text style={styles.headerStatus}>{status}</Text> : null}
      </View>
    </>
  );

  if (!otherUser) return <View style={styles.headerTitle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Perfil de ${name}${status ? `, ${status}` : ''}`}
      onPress={() => router.push(`/users/${otherUser.id}` as Href)}
      style={styles.headerTitle}
    >
      {content}
    </Pressable>
  );
}

// ---------- room ----------

type ChatRoomProps = {
  conversationId: string;
  messages: ReturnType<typeof useMessages>;
};

function ChatRoom({ conversationId, messages }: ChatRoomProps) {
  const selfId = useSession((state) => state.user?.id);
  const conversation = useConversation(conversationId).data;
  const otherUser = conversation?.otherUser ?? null;
  const otherName = otherUser ? displayName(otherUser) : 'Conversa';
  const pending = useChatStore((state) => state.pending[conversationId] ?? NO_PENDING);
  const retry = useChatStore((state) => state.retry);
  const discard = useChatStore((state) => state.discard);
  const { mutate: markRead } = useMarkRead(conversationId);
  const typing = useTypingSignal(conversationId);
  const stopTyping = typing.stop;

  // Open while on screen: the realtime bridge joins the room (and asks who is online) and leaves
  // it when this clears. Typing stops before leaving, since the room is needed to send it.
  useFocusEffect(
    useCallback(() => {
      useChatStore.getState().setOpenConversation(conversationId);
      markRead();
      return () => {
        stopTyping();
        const store = useChatStore.getState();
        if (store.openConversationId === conversationId) store.setOpenConversation(null);
      };
    }, [conversationId, markRead, stopTyping]),
  );

  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = messages;
  const rows = useMemo(
    () =>
      buildRows(data?.pages.flatMap((item) => item.items) ?? [], pending, selfId, otherName),
    [data, pending, selfId, otherName],
  );
  const items = useMemo(() => withDays(rows, new Date()), [rows]);

  const listRef = useRef<FlatList<RoomItem>>(null);
  const newest = rows[0];
  const newestKey = newest?.key;
  const newestMine = newest?.mine ?? false;
  // Set while the person reads older messages: the newest message when they scrolled away. The
  // list keeps their place, so someone else's message arriving meanwhile is announced instead.
  const [away, setAway] = useState<{ seenKey: string | undefined } | null>(null);
  const newBelow = away !== null && newestKey !== away.seenKey && !newestMine;

  function scrollToNewest() {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setAway(null);
  }

  // What I send always shows: follow it to the bottom.
  useEffect(() => {
    if (newestKey !== undefined && newestMine) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [newestKey, newestMine]);

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    // Inverted: offset 0 is the newest message.
    if (event.nativeEvent.contentOffset.y > NEAR_BOTTOM) {
      if (away === null) setAway({ seenKey: newestKey });
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
    if (item.kind === 'day') return <DaySeparator label={item.label} />;
    const { row } = item;
    const clientMessageId = row.clientMessageId;
    return (
      <MessageBubble
        message={row}
        onRetry={clientMessageId ? () => retry(conversationId, clientMessageId) : undefined}
        onDiscard={clientMessageId ? () => discard(conversationId, clientMessageId) : undefined}
      />
    );
  };

  // In the inverted list the footer sits at the top, above the oldest message.
  let older: ReactElement | null = null;
  if (isFetchNextPageError) {
    older = (
      <View style={styles.older}>
        <Text style={styles.olderText}>Não foi possível carregar mensagens mais antigas.</Text>
        <Button label="Tentar de novo" variant="text" onPress={() => void fetchNextPage()} />
      </View>
    );
  } else if (isFetchingNextPage) {
    older = (
      <View style={styles.older}>
        <ActivityIndicator accessibilityLabel="Carregando mensagens" color={colors.textMuted} />
      </View>
    );
  } else if (!hasNextPage) {
    older = (
      <View style={styles.older}>
        <Text style={styles.olderText}>Início da conversa</Text>
      </View>
    );
  }

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
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
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
          <View pointerEvents="box-none" style={styles.pillArea}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Novas mensagens"
              onPress={scrollToNewest}
              style={styles.pill}
            >
              <Text style={styles.pillText}>Novas mensagens</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: 'minimal',
          headerTitle: () => (
            <ChatHeaderTitle conversationId={conversationId} otherUser={otherUser} />
          ),
        }}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        {body}
        <ConnectionBanner />
        <ChatComposer
          conversationId={conversationId}
          onChangeText={typing.keystroke}
          onSent={stopTyping}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  content: { paddingVertical: space.sm },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    flexShrink: 1,
  },
  headerText: { flexShrink: 1 },
  headerName: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: 'bold' },
  headerStatus: { color: colors.textMuted, fontSize: fontSize.xs },
  day: { alignItems: 'center', paddingVertical: space.md },
  dayText: {
    color: colors.text,
    fontSize: fontSize.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: 999,
    overflow: 'hidden',
  },
  older: { alignItems: 'center', gap: space.xs, padding: space.lg },
  olderText: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center' },
  pillArea: { position: 'absolute', left: 0, right: 0, bottom: space.sm, alignItems: 'center' },
  pill: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: 999,
    backgroundColor: colors.active,
  },
  pillText: { color: colors.textStrong, fontSize: fontSize.sm, fontWeight: 'bold' },
});
