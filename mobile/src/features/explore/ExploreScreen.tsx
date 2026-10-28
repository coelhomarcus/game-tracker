import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, type TextFieldInput } from '@/components';
import { useSession } from '@/features/auth';
import type { Post } from '@/features/feed/types';
import type { GameSummary } from '@/features/games/types';
import type { PersonResult } from '@/features/profiles/types';
import { useScrollToTopOnTabPress } from '@/lib/useScrollToTopOnTabPress';
import { space } from '@/theme/tokens';

import { ExploreResults, type ResultTab } from './ExploreResults';
import { FollowSuggestions } from './FollowSuggestions';
import { useMyRecents, useRecentSearches, type RecentPerson } from './recentSearches';
import { SearchField } from './SearchField';
import { SearchRecents } from './SearchRecents';
import { TrendingGames } from './TrendingGames';

export const MIN_TERM_LENGTH = 2;

/**
 * `?tab=games` (the library's "Adicionar jogo") and `?tab=people` (the feed's "Encontrar
 * pessoas") open the search in focus mode with that results tab chosen, so what the user types
 * next lands on games or people.
 */
const REQUESTABLE: ResultTab[] = ['games', 'people'];

type TabScreenNavigation = {
  addListener(event: 'tabPress', listener: () => void): () => void;
  isFocused(): boolean;
};

type DiscoveryModule = 'trending' | 'suggestions';
const MODULES: DiscoveryModule[] = ['trending', 'suggestions'];

function Discovery({
  onOpenGame,
  onOpenPerson,
}: {
  onOpenGame: (igdbId: number) => void;
  onOpenPerson: (person: PersonResult) => void;
}) {
  const listRef = useRef<FlatList<DiscoveryModule>>(null);
  useScrollToTopOnTabPress(listRef);
  return (
    <FlatList
      ref={listRef}
      testID="explore-discovery"
      data={MODULES}
      keyExtractor={(module) => module}
      renderItem={({ item }) =>
        item === 'trending' ? (
          <TrendingGames onOpenGame={onOpenGame} />
        ) : (
          <FollowSuggestions onOpenPerson={onOpenPerson} />
        )
      }
      contentContainerStyle={styles.discovery}
    />
  );
}

/**
 * Explorar after the design reference: a search bar on top; focusing it enters focus mode
 * ("Cancelar" and the recent searches), 2 or more characters show the results in Jogos / Pessoas /
 * Posts tabs, and without a search the discovery modules ("Em alta", "Sugestões para seguir").
 */
export function ExploreScreen() {
  const router = useRouter();
  const navigation = useNavigation<TabScreenNavigation>();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const requested = REQUESTABLE.find((value) => value === params.tab);
  const userId = useSession((state) => state.user?.id);
  const recents = useMyRecents();

  const inputRef = useRef<TextFieldInput>(null);
  const inputFocused = useRef(false);
  const [query, setQuery] = useState('');
  // Focus mode lasts from focusing the field until "Cancelar", through a hidden keyboard too.
  const [focusMode, setFocusMode] = useState(requested !== undefined);
  const [tab, setTab] = useState<ResultTab>(requested ?? 'games');

  // The screen stays mounted in the tab bar, so a link to a tab arrives as a change of the param.
  const [seenRequest, setSeenRequest] = useState(requested);
  if (requested !== seenRequest) {
    setSeenRequest(requested);
    if (requested) {
      setTab(requested);
      setFocusMode(true);
    }
  }

  // Once applied the request is consumed, so the same link works again later.
  useEffect(() => {
    if (!requested) return;
    inputRef.current?.focus();
    router.setParams({ tab: undefined });
  }, [requested, router]);

  // Pressing Explorar again: the lists scroll to the top themselves; the keyboard goes away.
  useEffect(
    () =>
      navigation.addListener('tabPress', () => {
        if (navigation.isFocused() && inputFocused.current) Keyboard.dismiss();
      }),
    [navigation],
  );

  const term = query.trim();

  const saveTerm = useCallback(
    (value: string) => {
      if (userId !== undefined && value.trim().length >= MIN_TERM_LENGTH) {
        useRecentSearches.getState().addTerm(userId, value);
      }
    },
    [userId],
  );

  const savePerson = useCallback(
    (person: RecentPerson) => {
      if (userId !== undefined) useRecentSearches.getState().addPerson(userId, person);
    },
    [userId],
  );

  const openProfile = (id: string) => router.push(`/users/${id}` as Href);
  const openGame = (igdbId: number) => router.push(`/games/${igdbId}` as Href);

  function cancel() {
    setQuery('');
    setFocusMode(false);
    setTab('games');
    Keyboard.dismiss();
  }

  function clear() {
    setQuery('');
    setFocusMode(true);
    inputRef.current?.focus();
  }

  function runRecentTerm(value: string) {
    setQuery(value);
    saveTerm(value);
    Keyboard.dismiss();
  }

  let body;
  if (term.length >= MIN_TERM_LENGTH) {
    body = (
      <ExploreResults
        term={query}
        tab={tab}
        onChangeTab={setTab}
        onOpenGame={(game: GameSummary) => {
          saveTerm(term);
          openGame(game.igdbId);
        }}
        onOpenPerson={(person: PersonResult) => {
          savePerson(person);
          openProfile(person.id);
        }}
        onOpenPost={(post: Post) => {
          saveTerm(term);
          router.push(`/posts/${post.id}` as Href);
        }}
      />
    );
  } else if (term.length > 0) {
    body = <EmptyState title="Busque jogos, pessoas e posts" message="Digite pelo menos 2 letras." />;
  } else if (focusMode) {
    body = (
      <SearchRecents
        terms={recents.terms}
        people={recents.people}
        onPressTerm={runRecentTerm}
        onRemoveTerm={(value) => {
          if (userId !== undefined) useRecentSearches.getState().removeTerm(userId, value);
        }}
        onPressPerson={(person) => {
          savePerson(person);
          openProfile(person.id);
        }}
        onRemovePerson={(person) => {
          if (userId !== undefined) useRecentSearches.getState().removePerson(userId, person.id);
        }}
      />
    );
  } else {
    body = <Discovery onOpenGame={openGame} onOpenPerson={(person) => openProfile(person.id)} />;
  }

  return (
    <Screen>
      <SearchField
        value={query}
        onChangeText={setQuery}
        onFocus={() => {
          inputFocused.current = true;
          setFocusMode(true);
        }}
        onBlur={() => {
          inputFocused.current = false;
        }}
        onSubmit={() => saveTerm(query)}
        onClear={clear}
        showCancel={focusMode}
        onCancel={cancel}
        inputRef={inputRef}
      />
      <View style={styles.body}>{body}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  discovery: { paddingBottom: space._2xl },
});
