import type { FlashListRef } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
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
  Tabs,
  TextField,
  type TextFieldInput,
} from "@/components";
import { useLibrary } from "@/features/library/queries";
import { PeopleSearch } from "@/features/profiles/PeopleSearch";
import { useScrollToTopOnTabPress } from "@/lib/useScrollToTopOnTabPress";
import { colors, fontSize, space } from "@/theme/tokens";

import { useGameSearch } from "./queries";
import type { GameSummary } from "./types";

const MIN_TERM_LENGTH = 2;
const MIN_ITEM_WIDTH = 110;

type ExploreTab = "games" | "people";

const REQUESTABLE: ExploreTab[] = ["games", "people"];

const TABS: { value: ExploreTab; label: string }[] = [
  { value: "games", label: "Jogos" },
  { value: "people", label: "Pessoas" },
];

type HeaderProps = {
  tabs: ReactNode;
  term: string;
  busy: boolean;
  inputRef: Ref<TextFieldInput>;
  onChangeTerm: (text: string) => void;
};

/**
 * Defined at module scope and rendered as an element: a component created inside the screen
 * would get a new identity on every keystroke, remounting the field and closing the keyboard.
 */
function ExploreHeader({
  tabs,
  term,
  busy,
  inputRef,
  onChangeTerm,
}: HeaderProps) {
  return (
    <View style={styles.headerColumn}>
      {/* The page pads its content; the tabs bring their own padding. */}
      <View style={styles.tabs}>{tabs}</View>
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

type GamesSearchProps = {
  term: string;
  onChangeTerm: (text: string) => void;
  tabs: ReactNode;
};

function GamesSearch({ term, onChangeTerm, tabs }: GamesSearchProps) {
  const router = useRouter();
  const inputRef = useRef<TextFieldInput>(null);
  const listRef = useRef<FlashListRef<GameSummary>>(null);
  useScrollToTopOnTabPress(listRef);
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

  const openGame = (igdbId: number) => router.push(`/games/${igdbId}`);

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
      tabs={tabs}
      term={term}
      busy={searching && search.isFetching}
      inputRef={inputRef}
      onChangeTerm={onChangeTerm}
    />
  );

  return (
    <Screen>
      <View style={styles.page}>
        <CoverGrid<GameSummary>
          data={results}
          keyExtractor={(game) => String(game.igdbId)}
          minItemWidth={MIN_ITEM_WIDTH}
          listRef={listRef}
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

export function ExploreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requested = REQUESTABLE.find((value) => value === params.tab);
  const [tab, setTab] = useState<ExploreTab>(requested ?? "games");
  const [gameTerm, setGameTerm] = useState("");
  const [peopleTerm, setPeopleTerm] = useState("");

  // The screen stays mounted in the tab bar, so a link to a tab arrives as a change of the param.
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) setTab(requested);
  }

  // Once applied the request is consumed, so the same link works again after a manual switch.
  useEffect(() => {
    if (requested) router.setParams({ tab: undefined });
  }, [requested, router]);

  const tabs = <Tabs items={TABS} selected={tab} onSelect={setTab} />;

  return tab === "people" ? (
    <PeopleSearch term={peopleTerm} onChangeTerm={setPeopleTerm} tabs={tabs} />
  ) : (
    <GamesSearch term={gameTerm} onChangeTerm={setGameTerm} tabs={tabs} />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.lg },
  headerColumn: { gap: space.md },
  tabs: { marginHorizontal: -space.lg },
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
