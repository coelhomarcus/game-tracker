import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Tabs, TextField } from '@/components';
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

type Filter = 'all' | 'unread';

function matches(conversation: Conversation, query: string): boolean {
  if (query === '') return true;
  const person = conversation.otherUser;
  if (!person) return false;
  return foldText(displayName(person)).includes(query) || foldText(person.username).includes(query);
}

type HeaderProps = {
  term: string;
  filter: Filter;
  total: number;
  unread: number;
  onChangeTerm: (text: string) => void;
  onSelect: (filter: Filter) => void;
};

/**
 * Module scope, rendered as an element: a component created inside the screen would get a new
 * identity on every keystroke, remounting the field and closing the keyboard.
 */
function ConversationsHeader({ term, filter, total, unread, onChangeTerm, onSelect }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.search}>
        <TextField
          label="Buscar conversas"
          value={term}
          onChangeText={onChangeTerm}
          returnKeyType="search"
          maxLength={50}
        />
      </View>
      <Tabs
        items={[
          { value: 'all', label: `Todas (${total})` },
          { value: 'unread', label: `Não lidas (${unread})` },
        ]}
        selected={filter}
        onSelect={onSelect}
      />
    </View>
  );
}

export default function ConversationsScreen() {
  const router = useRouter();
  const query = useConversations();
  const sheetOpen = useNewConversationSheet((state) => state.open);
  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  // The menu's conversation stays set after the sheet closes: its block confirmation lives there.
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState<Conversation | null>(null);
  const markRead = useMarkRead();
  const leave = useLeaveConversation();
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
  const all = query.data;

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

  const folded = foldText(term);
  const shown = all.filter((item) => (filter === 'all' || showsUnread(item)) && matches(item, folded));
  const unreadCount = all.filter(showsUnread).length;

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
        action={{
          label: 'Limpar busca',
          onPress: () => {
            setTerm('');
            setFilter('all');
          },
        }}
      />
    );

  return (
    <Screen>
      <FlatList
        ref={listRef}
        testID="conversations-list"
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SwipeableConversation
            conversation={item}
            onAction={(action) => {
              if (action === 'read') markRead.mutate(item.id);
              else setLeaving(item);
            }}
          >
            <ConversationRow
              conversation={item}
              onPress={() => router.push(`/chat/${item.id}` as Href)}
              onLongPress={() => openMenu(item)}
            />
          </SwipeableConversation>
        )}
        ListHeaderComponent={
          all.length === 0 ? undefined : (
            <ConversationsHeader
              term={term}
              filter={filter}
              total={all.length}
              unread={unreadCount}
              onChangeTerm={setTerm}
              onSelect={setFilter}
            />
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
  header: { gap: space.md, paddingVertical: space.md },
  search: { paddingHorizontal: space.lg },
});
