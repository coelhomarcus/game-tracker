import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, TextField } from '@/components';
import { displayName } from '@/features/feed/types';
import { foldText } from '@/lib/foldText';
import { showToast } from '@/lib/toast';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { space } from '@/theme/tokens';

import { ConversationMenu, LeaveConversationDialog, SwipeableConversation } from './ConversationActions';
import { ConversationRow } from './ConversationRow';
import { ConversationSkeleton } from './ConversationSkeleton';
import { NewConversationSheet } from './NewConversationSheet';
import { useConversations, useLeaveConversation, useMarkRead } from './queries';
import {
  closeNewConversationSheet,
  openNewConversationSheet,
  useNewConversationSheet,
} from './sheetStore';
import { showsUnread, type Conversation } from './types';

function matches(conversation: Conversation, query: string): boolean {
  if (query === '') return true;
  const person = conversation.otherUser;
  if (!person) return false;
  return foldText(displayName(person)).includes(query) || foldText(person.username).includes(query);
}

export default function ConversationsScreen() {
  const router = useRouter();
  const query = useConversations();
  const sheetOpen = useNewConversationSheet((state) => state.open);
  const [term, setTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // The menu's conversation stays set after the sheet closes: its block confirmation lives there.
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState<Conversation | null>(null);
  const markRead = useMarkRead();
  const leave = useLeaveConversation();
  const all = query.data;
  const shown = useMemo(() => {
    const folded = foldText(term);
    // Stable sorting keeps the existing most-recent-first order within both groups.
    return (all ?? [])
      .filter((item) => matches(item, folded))
      .sort((a, b) => Number(showsUnread(b)) - Number(showsUnread(a)));
  }, [all, term]);
  const listRef = useRef<FlatList<Conversation>>(null);
  useScrollToTopOnTabPress(listRef);

  // The header button opens the sheet from outside; do not leave it open for the next session.
  useEffect(() => closeNewConversationSheet, []);

  async function refresh() {
    setRefreshing(true);
    const failed = await query.refetch().then(
      (result) => result.isError,
      () => true,
    );
    setRefreshing(false);
    if (failed) showToast('Não foi possível atualizar as conversas');
  }

  const sheet = <NewConversationSheet visible={sheetOpen} onClose={closeNewConversationSheet} />;

  function openMenu(conversation: Conversation) {
    setMenuFor(conversation);
    setMenuOpen(true);
  }
  // A failed background refetch keeps the loaded list: the error shows only without data.
  if (all === undefined) {
    return (
      <Screen>
        {query.isError ? (
          <EmptyState
            title="Não foi possível carregar as conversas"
            action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }}
          />
        ) : (
          <ConversationSkeleton />
        )}
        {sheet}
      </Screen>
    );
  }

  const empty =
    all.length === 0 ? (
      <EmptyState
        icon="chatbubbles-outline"
        title="Nenhuma conversa ainda"
        message="Diga oi para alguém."
        action={{ label: 'Nova conversa', onPress: openNewConversationSheet }}
        fill
      />
    ) : (
      <EmptyState
        title="Nenhuma conversa encontrada"
        message="Tente outro nome ou limpe a busca."
        action={{ label: 'Limpar busca', onPress: () => setTerm('') }}
      />
    );

  return (
    <Screen>
      <FlatList
        ref={listRef}
        testID="conversations-list"
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const swipeAction = (action: 'read' | 'leave') => {
            if (action === 'read') markRead.mutate(item.id);
            else setLeaving(item);
          };
          return (
            <SwipeableConversation conversation={item} onAction={swipeAction}>
              <ConversationRow
                conversation={item}
                onPress={() => router.push(`/chat/${item.id}` as Href)}
                onLongPress={() => openMenu(item)}
                // The swipe's actions, for screen readers.
                onSwipeAction={swipeAction}
              />
            </SwipeableConversation>
          );
        }}
        ListHeaderComponent={
          all.length === 0 ? undefined : (
            <View style={styles.search}>
              <TextField
                label="Buscar conversas"
                value={term}
                onChangeText={setTerm}
                returnKeyType="search"
                maxLength={50}
              />
            </View>
          )
        }
        ListEmptyComponent={empty}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
      {menuFor ? (
        <ConversationMenu
          key={menuFor.id}
          conversation={all.find((item) => item.id === menuFor.id) ?? menuFor}
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          onLeave={setLeaving}
        />
      ) : null}
      <LeaveConversationDialog
        conversation={leaving}
        onConfirm={(conversation) => {
          setLeaving(null);
          leave.mutate(conversation.id);
        }}
        onCancel={() => setLeaving(null)}
      />
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { paddingHorizontal: space.lg, paddingVertical: space.md },
});
