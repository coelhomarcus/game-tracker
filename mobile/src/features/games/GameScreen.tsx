import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, TabBar } from '@/components';
import { useLibrary } from '@/features/library/queries';
import { ApiError } from '@/lib/http/errors';
import { colors, space } from '@/theme/tokens';

import { GameAbout } from './GameAbout';
import { GameCommunity } from './GameCommunity';
import { GameHeader } from './GameHeader';
import { GameNotFound } from './GameNotFound';
import { GameProgress } from './GameProgress';
import { useGame, useToggleFavorite } from './queries';
import type { Game } from './types';

type TabValue = 'about' | 'progress' | 'community';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'about', label: 'Sobre' },
  { value: 'progress', label: 'Meu progresso' },
  { value: 'community', label: 'Comunidade' },
];

const GAME_MAX_WIDTH = 760;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIgdbId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Route entry: validates the address, then waits for the game. */
export function GameScreen() {
  const params = useLocalSearchParams<{ igdbId?: string | string[]; tab?: string | string[] }>();
  const igdbId = parseIgdbId(firstParam(params.igdbId));
  if (igdbId === null) return <GameNotFound />;
  const requestedTab = firstParam(params.tab);
  const initialTab = requestedTab === 'progress' || requestedTab === 'community' ? requestedTab : 'about';
  return <GameLoader igdbId={igdbId} initialTab={initialTab} />;
}

function GameLoader({ igdbId, initialTab }: { igdbId: number; initialTab: TabValue }) {
  const game = useGame(igdbId);

  // A failed background refetch keeps the previous data, so the loaded page stays.
  if (game.data) return <GameBody game={game.data} initialTab={initialTab} />;

  if (game.isError) {
    if (game.error instanceof ApiError && game.error.status === 404) return <GameNotFound />;
    return (
      <Screen>
        <View style={styles.center}>
          <EmptyState
            title="Não foi possível carregar"
            message="Verifique a conexão e tente de novo."
            action={{ label: 'Tentar novamente', onPress: () => void game.refetch() }}
          />
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.primary} />
      </View>
    </Screen>
  );
}

function GameBody({ game, initialTab }: { game: Game; initialTab: TabValue }) {
  const router = useRouter();
  const library = useLibrary();
  const toggleFavorite = useToggleFavorite(game.igdbId);
  const [tab, setTab] = useState<TabValue>(initialTab);

  const entries = useMemo(
    () =>
      (library.data ?? [])
        .filter((entry) => entry.game.igdbId === game.igdbId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [library.data, game.igdbId],
  );

  function createRecord() {
    router.push(`/games/${game.igdbId}/playthroughs/new` as Href);
  }

  const recordLabel = entries.length === 0 ? 'Adicionar à biblioteca' : 'Novo registro';

  return (
    <Screen scroll>
      <View style={styles.page}>
        <GameHeader
          game={game}
          recordLabel={library.data ? recordLabel : undefined}
          onCreateRecord={createRecord}
          onToggleFavorite={() => toggleFavorite.mutate({ gameId: game.id, favorite: !game.isFavoritedByMe })}
        />

        <TabBar items={TABS} selected={tab} onSelect={setTab} />

        <View style={styles.content}>
          {tab === 'about' ? <GameAbout game={game} /> : null}
          {tab === 'progress' ? (
            library.data ? (
              <GameProgress igdbId={game.igdbId} entries={entries} onCreate={createRecord} />
            ) : library.isError ? (
              <EmptyState
                title="Não foi possível carregar"
                message="Verifique a conexão e tente de novo."
                action={{ label: 'Tentar novamente', onPress: () => void library.refetch() }}
              />
            ) : (
              <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
            )
          ) : null}
          {tab === 'community' ? <GameCommunity gameId={game.id} igdbId={game.igdbId} /> : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  page: { width: '100%', maxWidth: GAME_MAX_WIDTH, alignSelf: 'center' },
  content: { padding: space.lg, paddingBottom: space._4xl },
});
