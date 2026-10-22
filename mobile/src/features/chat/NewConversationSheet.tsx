import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Text, TextField } from '@/components';
import { authErrorMessage, useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { PersonRow } from '@/features/profiles/PersonRow';
import { usePeopleSearch } from '@/features/profiles/queries';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

import { useStartConversation } from './queries';

const MIN_TERM_LENGTH = 2;

type ContentProps = { onClose: () => void };

function SheetContent({ onClose }: ContentProps) {
  const router = useRouter();
  const selfId = useSession((state) => state.user?.id);
  const [term, setTerm] = useState('');
  const search = usePeopleSearch(term);
  const start = useStartConversation();
  const starting = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const trimmed = term.trim();
  const searching = trimmed.length >= MIN_TERM_LENGTH;
  // The hook keeps the previous results as placeholder data, so a short term is decided here.
  const results = searching ? (search.data ?? []).filter((person) => person.id !== selfId) : [];

  async function choose(userId: string) {
    if (starting.current) return;
    starting.current = true;
    setFailure(null);
    try {
      const id = await start.mutateAsync(userId);
      onClose();
      router.push(`/chat/${id}` as Href);
    } catch (error) {
      // A native Modal covers the root toast host, so the sheet shows the failure itself too.
      const message = authErrorMessage(error);
      setFailure(message);
      showToast(message);
    } finally {
      starting.current = false;
    }
  }

  const empty = (() => {
    if (!searching) {
      return (
        <EmptyState
          title="Encontre pessoas"
          message="Busque pelo nome ou username. Digite pelo menos 2 letras."
        />
      );
    }
    if (search.isError) {
      return (
        <EmptyState
          title="Não foi possível buscar agora"
          action={{ label: 'Tentar de novo', onPress: () => void search.refetch() }}
        />
      );
    }
    // Still waiting on the debounce or on the first response: the spinner says it.
    if (search.isPending || search.isPlaceholderData) return null;
    return <EmptyState title="Ninguém encontrado" message={`Nada para "${trimmed}".`} />;
  })();

  const busy = (searching && search.isFetching) || start.isPending;

  return (
    <Screen>
      <View style={styles.top}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          Nova conversa
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={styles.close}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <View style={styles.field}>
          <TextField
            label="Buscar pessoas"
            value={term}
            onChangeText={(text) => {
              setTerm(text);
              setFailure(null);
            }}
            returnKeyType="search"
            maxLength={50}
          />
        </View>
        {busy ? (
          <ActivityIndicator
            accessibilityLabel="Buscando"
            color={colors.textMedium}
            style={styles.busy}
          />
        ) : null}
      </View>
      {failure ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" size="sm" tone="danger" style={styles.failure}>
          {failure}
        </Text>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(person) => person.id}
        renderItem={({ item }) => (
          <PersonRow
            person={item}
            showFollow={false}
            pressLabel={`Conversar com ${displayName(item)}`}
            onPress={() => void choose(item.id)}
          />
        )}
        ListEmptyComponent={empty ?? undefined}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

export type NewConversationSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** The content mounts only while visible, so each opening starts with an empty search. */
export function NewConversationSheet({ visible, onClose }: NewConversationSheetProps) {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      {visible ? <SheetContent onClose={onClose} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minHeight: 56,
  },

  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  field: { flex: 1 },
  busy: { height: 48 },
  failure: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
});
