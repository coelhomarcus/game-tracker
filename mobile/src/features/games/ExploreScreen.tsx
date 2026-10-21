import { useRouter, type Href } from "expo-router";
import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  CoverFooter,
  CoverGrid,
  EmptyState,
  GameCover,
  Screen,
  TextField,
  type TextFieldInput,
} from "@/components";
import { useLibrary } from "@/features/library/queries";
import { colors, fontSize, space } from "@/theme/tokens";

import { useGameSearch } from "./queries";
import type { GameSummary } from "./types";

const MIN_TERM_LENGTH = 2;
const MIN_ITEM_WIDTH = 110;

type HeaderProps = {
  term: string;
  busy: boolean;
  inputRef: Ref<TextFieldInput>;
  onChangeTerm: (text: string) => void;
};

/**
 * Defined at module scope and rendered as an element: a component created inside the screen
 * would get a new identity on every keystroke, remounting the field and closing the keyboard.
 */
function ExploreHeader({ term, busy, inputRef, onChangeTerm }: HeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.field}>
        <TextField
          label="Buscar jogos"
          value={term}
          onChangeText={onChangeTerm}
          returnKeyType="search"
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
  );
}

type CardProps = {
  game: GameSummary;
  width: number;
  inLibrary: boolean;
  onPress: (igdbId: number) => void;
};

function ExploreCard({ game, width, inLibrary, onPress }: CardProps) {
  const footer = inLibrary
    ? "Na biblioteca"
    : (game.platforms[0] ?? "Plataformas não informadas");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game.name}, ${footer}`}
      onPress={() => onPress(game.igdbId)}
      style={[styles.card, { width }]}
    >
      <GameCover decorative name={game.name} url={game.coverUrl} width={width} />
      <Text style={styles.name} numberOfLines={2}>
        {game.name}
      </Text>
      <CoverFooter>{footer}</CoverFooter>
    </Pressable>
  );
}

export function ExploreScreen() {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const inputRef = useRef<TextFieldInput>(null);
  const search = useGameSearch(term);
  const library = useLibrary();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The search hook keeps the previous results as placeholder data, so a short term is decided here.
  const searching = term.trim().length >= MIN_TERM_LENGTH;
  const results = searching ? (search.data ?? []) : [];

  const libraryIds = useMemo(
    () => new Set((library.data ?? []).map((entry) => entry.game.igdbId)),
    [library.data],
  );

  // The game route is added by a later task, so it is not in the typed routes yet.
  const openGame = (igdbId: number) => router.push(`/games/${igdbId}` as Href);

  const empty = (() => {
    if (!searching) {
      return (
        <EmptyState
          title="Busque um jogo pelo nome"
          message="Digite pelo menos 2 letras."
        />
      );
    }
    if (search.isError) {
      return (
        <EmptyState
          title="Não foi possível buscar agora"
          action={{
            label: "Tentar de novo",
            onPress: () => void search.refetch(),
          }}
        />
      );
    }
    // Still waiting on the debounce or on the first response: the spinner says it.
    if (search.isPending || search.isPlaceholderData) return null;
    return <EmptyState title="Nenhum jogo encontrado" />;
  })();

  const header = (
    <ExploreHeader
      term={term}
      busy={searching && search.isFetching}
      inputRef={inputRef}
      onChangeTerm={setTerm}
    />
  );

  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<GameSummary>
          data={results}
          keyExtractor={(game) => String(game.igdbId)}
          minItemWidth={MIN_ITEM_WIDTH}
          renderItem={(game, width) => (
            <ExploreCard
              game={game}
              width={width}
              inLibrary={libraryIds.has(game.igdbId)}
              onPress={openGame}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.md,
    paddingBottom: space.md,
  },
  field: { flex: 1 },
  busy: { height: 48 },
  card: { gap: space.xs },
  name: { color: colors.text, fontSize: fontSize.sm },
});
