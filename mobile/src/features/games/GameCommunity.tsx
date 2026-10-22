import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar, Button, Tabs, Text } from '@/components';
import { STATUSES, statusIcon, statusLabel } from '@/features/library/status';
import { displayName } from '@/features/feed/types';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { formatHours } from '@/lib/hours';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, space } from '@/theme/tokens';

import type { PlayersScope } from './api';
import { GamePosts } from './GamePosts';
import { useGamePlayers, useGameStats } from './queries';
import type { GamePlayer, GameStats } from './types';

const SCOPES: { value: PlayersScope; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'following', label: 'Quem eu sigo' },
];

const EMPTY_PLAYERS: Record<PlayersScope, string> = {
  all: 'Ninguém está jogando agora.',
  following: 'Ninguém que você segue está jogando.',
};

function Counts({ stats }: { stats: GameStats }) {
  return (
    <View style={styles.counts}>
      {STATUSES.map((status) => (
        <View
          key={status}
          accessible
          accessibilityLabel={`${statusLabel[status]}: ${stats[status]}`}
          style={styles.count}
        >
          <Ionicons name={statusIcon[status]} size={20} color={colors.status[status]} />
          <Text size="xs">{statusLabel[status]}</Text>
          <Text size="xl" weight="bold" tone="high">
            {stats[status]}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The API returns one row per record, so a player with two playing records comes twice. */
function uniquePlayers(players: GamePlayer[]): GamePlayer[] {
  const seen = new Set<string>();
  return players.filter((player) => {
    if (seen.has(player.user.id)) return false;
    seen.add(player.user.id);
    return true;
  });
}

function PlayerRow({ player }: { player: GamePlayer }) {
  const { user } = player;
  const name = displayName(user);
  const hours = player.hoursPlayed === null ? null : `${formatHours(player.hoursPlayed)} h`;
  return (
    <ProfileLink
      user={user}
      hitSlop={0}
      style={styles.player}
      accessibilityLabel={hours === null ? undefined : `Perfil de ${name}, ${hours}`}
    >
      <Avatar uri={resolveImageUrl(user.avatarUrl)} name={name} size={40} />
      <View style={styles.playerText}>
        <Text numberOfLines={1} tone="high">
          {name}
        </Text>
        {name === user.username ? null : (
          <Text numberOfLines={1} size="sm" tone="medium">{`@${user.username}`}</Text>
        )}
      </View>
      {hours === null ? null : <Text size="sm">{hours}</Text>}
    </ProfileLink>
  );
}

export function GameCommunity({ gameId, igdbId }: { gameId: string; igdbId: number }) {
  const [scope, setScope] = useState<PlayersScope>('all');
  const stats = useGameStats(gameId);
  const players = useGamePlayers(gameId, scope);

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          Registros da comunidade
        </Text>
        {stats.data ? (
          <Counts stats={stats.data} />
        ) : stats.isError ? (
          <>
            <Text size="sm" tone="medium">Não foi possível carregar os números.</Text>
            <Button label='Tentar de novo' variant="ghost" onPress={() => void stats.refetch()} />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
        )}
        <Text size="sm" tone="medium">
          Conta registros, não pessoas: quem rejoga aparece mais de uma vez.
        </Text>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          Jogando agora
        </Text>
        <Text size="sm" tone="medium">Alguns dos jogadores, até 10.</Text>
        <View style={styles.tabs}>
          <Tabs items={SCOPES} selected={scope} onSelect={setScope} />
        </View>
        {players.data ? (
          players.data.length === 0 ? (
            <Text size="sm" tone="medium">{EMPTY_PLAYERS[scope]}</Text>
          ) : (
            uniquePlayers(players.data).map((player) => <PlayerRow key={player.user.id} player={player} />)
          )
        ) : players.isError ? (
          <>
            <Text size="sm" tone="medium">Não foi possível carregar os jogadores.</Text>
            <Button label='Tentar de novo' variant="ghost" onPress={() => void players.refetch()} />
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
        )}
      </View>

      <GamePosts gameId={gameId} igdbId={igdbId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space._2xl },
  section: { gap: space.md },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  count: { alignItems: 'center', gap: space.xs, minWidth: 64 },

  // Tabs pad their own row by `space.lg`; this cancels it so they align with the text above.
  tabs: { marginHorizontal: -space.lg },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  playerText: { flex: 1 },
});
