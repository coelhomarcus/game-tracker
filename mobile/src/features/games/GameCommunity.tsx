import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Avatar, Tabs } from '@/components';
import { STATUSES, statusIcon, statusLabel } from '@/features/library/status';
import { formatHours } from '@/lib/hours';
import { colors, fontSize, space } from '@/theme/tokens';

import type { PlayersScope } from './api';
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
          <Text style={styles.countLabel}>{statusLabel[status]}</Text>
          <Text style={styles.countValue}>{stats[status]}</Text>
        </View>
      ))}
    </View>
  );
}

function PlayerRow({ player }: { player: GamePlayer }) {
  const { user } = player;
  return (
    <View style={styles.player}>
      <Avatar uri={user.avatarUrl} name={user.name ?? user.username} size={40} />
      <Text numberOfLines={1} style={styles.playerName}>
        {user.name ?? `@${user.username}`}
      </Text>
      {player.hoursPlayed !== null ? (
        <Text style={styles.playerHours}>{`${formatHours(player.hoursPlayed)} h`}</Text>
      ) : null}
    </View>
  );
}

export function GameCommunity({ gameId }: { gameId: string }) {
  const [scope, setScope] = useState<PlayersScope>('all');
  const stats = useGameStats(gameId);
  const players = useGamePlayers(gameId, scope);

  return (
    <View style={styles.root}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          Registros da comunidade
        </Text>
        {stats.data ? (
          <Counts stats={stats.data} />
        ) : stats.isError ? (
          <Text style={styles.muted}>Não foi possível carregar os números.</Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Carregando" color={colors.accent} />
        )}
        <Text style={styles.muted}>
          Conta registros, não pessoas: quem rejoga aparece mais de uma vez.
        </Text>
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>
          Jogando agora
        </Text>
        <Text style={styles.muted}>Alguns dos jogadores, até 10.</Text>
        <View style={styles.tabs}>
          <Tabs items={SCOPES} selected={scope} onSelect={setScope} />
        </View>
        {players.data ? (
          players.data.length === 0 ? (
            <Text style={styles.muted}>{EMPTY_PLAYERS[scope]}</Text>
          ) : (
            players.data.map((player) => <PlayerRow key={player.user.id} player={player} />)
          )
        ) : players.isError ? (
          <Text style={styles.muted}>Não foi possível carregar os jogadores.</Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Carregando" color={colors.accent} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  section: { gap: space.md },
  title: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  count: { alignItems: 'center', gap: space.xs, minWidth: 64 },
  countLabel: { color: colors.text, fontSize: fontSize.xs },
  countValue: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  // Tabs pad their own row by `space.lg`; this cancels it so they align with the text above.
  tabs: { marginHorizontal: -space.lg },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  playerName: { flex: 1, color: colors.textStrong, fontSize: fontSize.md },
  playerHours: { color: colors.text, fontSize: fontSize.sm },
});
