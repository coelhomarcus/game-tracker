import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Skeleton, Tabs, TextField } from '@/components';
import { displayName } from '@/features/feed/types';
import { foldText } from '@/lib/foldText';
import { showToast } from '@/lib/toast';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { radii, space } from '@/theme/tokens';

import { ConversationRow } from './ConversationRow';
import { NewConversationSheet } from './NewConversationSheet';
import { useConversations } from './queries';
import {
  closeNewConversationSheet,
  openNewConversationSheet,
  useNewConversationSheet,
} from './sheetStore';
import type { Conversation } from './types';

const AVATAR_SIZE = 48;
const SKELETON_ROWS = ['0', '1', '2', '3', '4'];

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

function ConversationsSkeleton() {
  return (
    <View style={styles.skeleton}>
      {SKELETON_ROWS.map((id) => (
        <View key={id} testID="conversation-skeleton-row" style={styles.skeletonRow}>
          <Skeleton width={AVATAR_SIZE} height={AVATAR_SIZE} radius={AVATAR_SIZE / 2} />
          <View style={styles.skeletonText}>
            <Skeleton width="40%" height={14} radius={radii.cover} />
            <Skeleton height={14} radius={radii.cover} />
          </View>
        </View>
      ))}
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
          <ConversationsSkeleton />
        )}
        {sheet}
      </Screen>
    );
  }

  const folded = foldText(term);
  const shown = all.filter((item) => (filter === 'all' || item.unread) && matches(item, folded));
  const unreadCount = all.filter((item) => item.unread).length;

  const empty =
    all.length === 0 ? (
      <EmptyState
        title="Nenhuma conversa ainda"
        message="Converse com quem você encontrar na comunidade."
        action={{ label: 'Nova conversa', onPress: openNewConversationSheet }}
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
          <ConversationRow
            conversation={item}
            onPress={() => router.push(`/chat/${item.id}` as Href)}
          />
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
      {sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingVertical: space.md },
  search: { paddingHorizontal: space.lg },
  skeleton: { gap: space.lg, padding: space.lg },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  skeletonText: { flex: 1, gap: space.sm },
});
