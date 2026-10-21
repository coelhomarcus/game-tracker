import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, EmptyState, GameCover, Screen, Tabs } from '@/components';
import { useLibrary } from '@/features/library/queries';
import { ApiError } from '@/lib/http/errors';
import { colors, fontSize, space } from '@/theme/tokens';

import { GameAbout } from './GameAbout';
import { GameCommunity } from './GameCommunity';
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

const COVER_WIDTH = 120;

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
  const initialTab = firstParam(params.tab) === 'progress' ? 'progress' : 'about';
  return <GameLoader igdbId={igdbId} initialTab={initialTab} />;
}

function GameLoader({ igdbId, initialTab }: { igdbId: number; initialTab: TabValue }) {
  const game = useGame(igdbId);

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
  if (!game.data) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
        </View>
      </Screen>
    );
  }
  return <GameBody game={game.data} initialTab={initialTab} />;
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

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <GameCover name={game.name} url={game.coverUrl} width={COVER_WIDTH} />
          <View style={styles.headerText}>
            <Text accessibilityRole="header" style={styles.name}>
              {game.name}
            </Text>
            {game.platforms.length > 0 ? (
              <Text style={styles.platforms}>{game.platforms.join(' · ')}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={game.isFavoritedByMe ? 'Remover dos favoritos' : 'Favoritar'}
              hitSlop={space.sm}
              onPress={() =>
                toggleFavorite.mutate({ gameId: game.id, favorite: !game.isFavoritedByMe })
              }
              style={styles.favorite}
            >
              <Ionicons
                name={game.isFavoritedByMe ? 'heart' : 'heart-outline'}
                size={28}
                color={colors.accent}
              />
            </Pressable>
          </View>
        </View>
        {library.data ? (
          <Button
            label={entries.length === 0 ? 'Adicionar à biblioteca' : 'Novo registro'}
            onPress={createRecord}
          />
        ) : null}
      </View>

      <Tabs items={TABS} selected={tab} onSelect={setTab} />

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
            <ActivityIndicator accessibilityLabel="Carregando" color={colors.accent} />
          )
        ) : null}
        {tab === 'community' ? <GameCommunity gameId={game.id} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  header: { padding: space.lg, gap: space.lg },
  headerRow: { flexDirection: 'row', gap: space.lg },
  headerText: { flex: 1, gap: space.sm, alignItems: 'flex-start' },
  name: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: 'bold' },
  platforms: { color: colors.textMuted, fontSize: fontSize.sm },
  favorite: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg },
});
