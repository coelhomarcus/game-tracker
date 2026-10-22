import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { EmptyState, GameCover, Screen, Text, TextField, type TextFieldInput } from '@/components';
import { useGameSearch } from '@/features/games/queries';
import type { GameSummary } from '@/features/games/types';
import { colors, space } from '@/theme/tokens';

const MIN_TERM_LENGTH = 2;
const COVER_WIDTH = 36;

export type GamePickerSheetProps = {
  visible: boolean;
  onSelect: (game: GameSummary) => void;
  onClose: () => void;
};

/** Full-screen search over the catalog. The body mounts with the modal, so every opening starts clean. */
export function GamePickerSheet({ visible, onSelect, onClose }: GamePickerSheetProps) {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      <PickerBody onSelect={onSelect} onClose={onClose} />
    </Modal>
  );
}

function PickerBody({ onSelect, onClose }: Omit<GamePickerSheetProps, 'visible'>) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<TextFieldInput>(null);
  const search = useGameSearch(term);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The search hook keeps the previous results as placeholder data, so a short term is decided here.
  const searching = term.trim().length >= MIN_TERM_LENGTH;
  const results = searching ? (search.data ?? []) : [];

  let empty;
  if (!searching) {
    empty = (
      <Text size="sm" tone="medium" style={styles.hint}>
        Digite pelo menos 2 letras.
      </Text>
    );
  } else if (search.isError) {
    empty = (
      <EmptyState
        title="Não foi possível buscar agora"
        action={{ label: 'Tentar de novo', onPress: () => void search.refetch() }}
      />
    );
  } else if (!search.isPending && !search.isPlaceholderData) {
    empty = <EmptyState title="Nenhum jogo encontrado" />;
  }

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.top}>
          <Text accessibilityRole="header" size="xl" weight="bold" tone="high" style={styles.title}>
            Vincular um jogo
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
              label="Buscar jogos"
              value={term}
              onChangeText={setTerm}
              returnKeyType="search"
              inputRef={inputRef}
            />
          </View>
          {searching && search.isFetching ? (
            <ActivityIndicator
              accessibilityLabel="Buscando"
              color={colors.textMedium}
              style={styles.busy}
            />
          ) : null}
        </View>
        <FlatList
          data={results}
          keyExtractor={(game) => String(game.igdbId)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => onSelect(item)}
              style={styles.row}
            >
              <GameCover decorative name={item.name} url={item.coverUrl} width={COVER_WIDTH} />
              <Text numberOfLines={2} style={styles.name}>
                {item.name}
              </Text>
            </Pressable>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    flex: 1,
    paddingVertical: space.md,
  },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, paddingBottom: space.md },
  field: { flex: 1 },
  busy: { height: 48 },
  hint: { paddingVertical: space.md },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  name: { flex: 1 },
});
