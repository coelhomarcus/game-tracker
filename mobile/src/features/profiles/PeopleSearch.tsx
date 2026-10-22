import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, TextField, type TextFieldInput } from '@/components';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { colors, space } from '@/theme/tokens';

import { PersonRow } from './PersonRow';
import { usePeopleSearch } from './queries';
import type { PersonResult } from './types';

const MIN_TERM_LENGTH = 2;

type HeaderProps = {
  tabs: ReactNode;
  term: string;
  busy: boolean;
  inputRef: Ref<TextFieldInput>;
  onChangeTerm: (text: string) => void;
};

/**
 * Module scope, rendered as an element: a component created inside the screen would get a new
 * identity on every keystroke, remounting the field and closing the keyboard.
 */
function PeopleHeader({ tabs, term, busy, inputRef, onChangeTerm }: HeaderProps) {
  return (
    <View style={styles.header}>
      {tabs}
      <View style={styles.search}>
        <View style={styles.field}>
          <TextField
            label="Buscar pessoas"
            value={term}
            onChangeText={onChangeTerm}
            returnKeyType="search"
            maxLength={50}
            inputRef={inputRef}
          />
        </View>
        {busy ? (
          <ActivityIndicator
            accessibilityLabel="Buscando"
            color={colors.textMuted}
            style={styles.busy}
          />
        ) : null}
      </View>
    </View>
  );
}

export type PeopleSearchProps = {
  term: string;
  onChangeTerm: (text: string) => void;
  /** The Explore tabs, shown above the field. */
  tabs: ReactNode;
};

export function PeopleSearch({ term, onChangeTerm, tabs }: PeopleSearchProps) {
  const router = useRouter();
  const inputRef = useRef<TextFieldInput>(null);
  const listRef = useRef<FlatList<PersonResult>>(null);
  useScrollToTopOnTabPress(listRef);
  const search = usePeopleSearch(term);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The hook keeps the previous results as placeholder data, so a short term is decided here.
  const trimmed = term.trim();
  const searching = trimmed.length >= MIN_TERM_LENGTH;
  const results = searching ? (search.data ?? []) : [];

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

  const header = (
    <PeopleHeader
      tabs={tabs}
      term={term}
      busy={searching && search.isFetching}
      inputRef={inputRef}
      onChangeTerm={onChangeTerm}
    />
  );

  return (
    <Screen>
      <FlatList
        ref={listRef}
        data={results}
        keyExtractor={(person) => person.id}
        renderItem={({ item }) => (
          <PersonRow
            person={item}
            onPress={() => router.push(`/users/${item.id}` as Href)}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: space.md, paddingBottom: space.md },
  search: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  field: { flex: 1 },
  busy: { height: 48 },
});
