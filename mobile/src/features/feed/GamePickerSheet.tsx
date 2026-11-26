import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Divider, EmptyState, GameCover, Screen, Text, TextField, type TextFieldInput } from '@/components';
import { useGameSearch } from '@/features/games/queries';
import type { GameSummary } from '@/features/games/types';
import { buildLibraryOverview } from '@/features/library/groups';
import type { GameEntry } from '@/features/library/types';
import { haptic } from '@/lib/haptics';
import { colors, hairline, radii, space } from '@/theme/tokens';

const MIN_TERM_LENGTH = 2;
const COVER_WIDTH = 42;
const SUGGESTION_COUNT = 3;

export type GamePickerSheetProps = {
  visible: boolean;
  onSelect: (game: GameSummary) => void;
  onClose: () => void;
  entries?: GameEntry[];
  selectedIgdbId?: number;
};

/** Full-screen search over the catalog. The body mounts with the modal, so every opening starts clean. */
export function GamePickerSheet({ visible, ...props }: GamePickerSheetProps) {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={props.onClose} statusBarTranslucent navigationBarTranslucent>
      {visible ? <PickerBody {...props} /> : null}
    </Modal>
  );
}

function PickerBody({ onSelect, onClose, entries, selectedIgdbId }: Omit<GamePickerSheetProps, 'visible'>) {
  const [term, setTerm] = useState('');
  const inputRef = useRef<TextFieldInput>(null);
  const search = useGameSearch(term);

  const suggestions = useMemo(() => buildLibraryOverview(
    entries ?? [], { query: '', status: null, platformKey: null }, 'recent',
  ).groups.slice(0, SUGGESTION_COUNT).map(({ game }) => game), [entries]);

  function select(game: GameSummary) {
    haptic('tap');
    onSelect(game);
  }

  // The search hook keeps the previous results as placeholder data, so a short term is decided here.
  const trimmed = term.trim();
  const searching = trimmed.length >= MIN_TERM_LENGTH;
  const results = searching && !search.isPlaceholderData ? (search.data ?? []) : [];
  const busy = searching && (search.isPending || search.isPlaceholderData);

  let empty;
  if (trimmed === '' && suggestions.length > 0) {
    empty = (
      <View style={styles.suggestions}>
        <Text accessibilityRole="header" size="lg" weight="bold" tone="high">Da sua biblioteca</Text>
        <View style={styles.suggestionRow}>
          {suggestions.map((game) => (
            <Pressable
              key={game.igdbId}
              accessibilityRole="button"
              accessibilityLabel={game.name}
              accessibilityState={{ selected: selectedIgdbId === game.igdbId }}
              onPress={() => select(game)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.suggestionPressed]}
            >
              <View>
                <GameCover decorative iconFallback name={game.name} url={game.coverUrl} />
                {selectedIgdbId === game.igdbId ? (
                  <View style={styles.selectedCover} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
                  </View>
                ) : null}
              </View>
              <Text size="sm" weight="semibold" tone="high" numberOfLines={2}>{game.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  } else if (!searching) {
    empty = (
      <EmptyState icon="search-outline" title="Encontre um jogo" message="Digite pelo menos 2 letras." />
    );
  } else if (search.isError) {
    empty = (
      <EmptyState
        title="Não foi possível buscar agora"
        action={{ label: 'Tentar de novo', onPress: () => void search.refetch() }}
      />
    );
  } else if (busy) {
    empty = <ActivityIndicator accessibilityLabel="Buscando jogos" color={colors.primary} style={styles.busy} />;
  } else {
    empty = <EmptyState icon="game-controller-outline" title="Nenhum jogo encontrado" message="Tente outro nome." />;
  }

  return (
    <Screen topInset>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <View style={styles.page}>
          <View style={styles.top}>
            <Text accessibilityRole="header" size="xl" weight="bold" tone="high" style={styles.title}>
              {selectedIgdbId === undefined ? 'Vincular um jogo' : 'Trocar jogo'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <View style={styles.closeIcon}><Ionicons name="close" size={22} color={colors.text} /></View>
            </Pressable>
          </View>
          <View style={styles.search}>
            <TextField
              label="Buscar jogos"
              hideLabel
              leadingIcon="search-outline"
              placeholder="Buscar pelo nome do jogo"
              value={term}
              onChangeText={setTerm}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              inputRef={inputRef}
              clear={{
                label: 'Limpar busca',
                onPress: () => {
                  setTerm('');
                  inputRef.current?.focus();
                },
              }}
            />
          </View>
          <FlatList
            data={results}
            keyExtractor={(game) => String(game.igdbId)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.list}
            ListEmptyComponent={empty}
            ItemSeparatorComponent={Divider}
            renderItem={({ item }) => <GameResult game={item} selected={selectedIgdbId === item.igdbId} onSelect={() => select(item)} />}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function GameResult({ game, selected, onSelect }: { game: GameSummary; selected: boolean; onSelect: () => void }) {
  const detail = [game.platforms[0], game.genres[0]].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={game.name}
      accessibilityHint={detail || undefined}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [styles.row, pressed && styles.resultPressed]}
    >
      <GameCover decorative name={game.name} url={game.coverUrl} width={COVER_WIDTH} />
      <View style={styles.resultText}>
        <Text numberOfLines={2} weight="semibold" tone="high">{game.name}</Text>
        {detail ? <Text numberOfLines={1} size="sm" tone="medium">{detail}</Text> : null}
      </View>
      <View style={[styles.add, selected && styles.addSelected]}>
        <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color={selected ? colors.primary : colors.textMedium} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingStart: space.lg, paddingEnd: space.sm, minHeight: 58 },
  title: { flex: 1 },
  close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  closeIcon: { width: 36, height: 36, borderRadius: radii.full, backgroundColor: colors.bgContrast50, alignItems: 'center', justifyContent: 'center' },
  closePressed: { opacity: 0.65 },
  search: { paddingHorizontal: space.lg, paddingBottom: space.lg, borderBottomWidth: hairline, borderBottomColor: colors.borderLow },
  list: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  busy: { paddingVertical: space._4xl },
  suggestions: { paddingTop: space.xl, gap: space.md },
  suggestionRow: { flexDirection: 'row', gap: space.md },
  suggestion: { flexBasis: 0, flexGrow: 1, maxWidth: 144, minWidth: 0, gap: space.sm },
  suggestionPressed: { opacity: 0.75 },
  selectedCover: {
    position: 'absolute', top: space.xs, end: space.xs, width: 24, height: 24, borderRadius: radii.full,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  resultPressed: { backgroundColor: colors.bgContrast25 },
  resultText: { flex: 1, minWidth: 0, gap: space.xs },
  add: { width: 32, height: 32, borderRadius: radii.full, backgroundColor: colors.bgContrast50, alignItems: 'center', justifyContent: 'center' },
  addSelected: { backgroundColor: `${colors.primary}1A` },
});
