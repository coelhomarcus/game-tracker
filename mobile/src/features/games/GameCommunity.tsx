import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Avatar, Button, Divider, EmptyState, Tabs, Text } from '@/components';
import { ActivityRow } from '@/features/feed/ActivityRow';
import { useActivities } from '@/features/feed/queries';
import { STATUSES, statusIcon, statusLabel } from '@/features/library/status';
import { displayName } from '@/features/feed/types';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { formatHours } from '@/lib/hours';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, hairline, radii, space } from '@/theme/tokens';

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

type CommunityTab = 'overview' | 'activities' | 'posts';
const COMMUNITY_TABS: { value: CommunityTab; label: string }[] = [
  { value: 'overview', label: 'Visão geral' },
  { value: 'activities', label: 'Atividades' },
  { value: 'posts', label: 'Posts' },
];

function Counts({ stats }: { stats: GameStats }) {
  return (
    <View style={styles.panel}>
      <View style={styles.counts}>
        {STATUSES.map((status) => (
          <View
            key={status}
            accessible
            accessibilityLabel={`${statusLabel[status]}: ${stats[status]}`}
            style={styles.count}
          >
            <Ionicons name={statusIcon[status]} size={18} color={colors.status[status]} />
            <Text size="xl" weight="bold" tone="high">
              {stats[status]}
            </Text>
            <Text size="xs" tone="medium" style={styles.countLabel}>{statusLabel[status]}</Text>
          </View>
        ))}
      </View>
      <Divider />
      <Text size="sm" tone="medium" style={styles.countNote}>
        Conta registros, não pessoas: quem rejoga aparece mais de uma vez.
      </Text>
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
  const [tab, setTab] = useState<CommunityTab>('overview');
  const [scope, setScope] = useState<PlayersScope>('all');
  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        <Tabs items={COMMUNITY_TABS} selected={tab} onSelect={setTab} />
      </View>
      {tab === 'overview' ? <CommunityOverview gameId={gameId} scope={scope} onScopeChange={setScope} /> : null}
      {tab === 'activities' ? <GameActivities gameId={gameId} /> : null}
      {tab === 'posts' ? <GamePosts gameId={gameId} igdbId={igdbId} /> : null}
    </View>
  );
}

function GameActivities({ gameId }: { gameId: string }) {
  const query = useActivities({ kind: 'game', id: gameId });
  const items = query.data?.pages.flatMap((page) => page.items);

  if (items === undefined) {
    return query.isError ? (
      <EmptyState title="Não foi possível carregar as atividades" action={{ label: 'Tentar de novo', onPress: () => void query.refetch() }} />
    ) : <ActivityIndicator accessibilityLabel="Carregando atividades" color={colors.primary} />;
  }

  return (
    <View style={styles.activityList}>
      {items.length === 0 && !query.hasNextPage ? <EmptyState title="Nenhuma atividade para este jogo ainda" /> : null}
      {items.map((activity) => <ActivityRow key={activity.id} activity={activity} />)}
      {query.hasNextPage ? (
        <View style={styles.activityFooter}>
          {query.isFetchNextPageError ? <Text size="sm" tone="medium">Não foi possível carregar mais atividades.</Text> : null}
          <Button
            label={query.isFetchNextPageError ? 'Tentar de novo' : 'Carregar mais atividades'}
            color="secondary" loading={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}
          />
        </View>
      ) : null}
    </View>
  );
}

function CommunityOverview({ gameId, scope, onScopeChange }: { gameId: string; scope: PlayersScope; onScopeChange: (scope: PlayersScope) => void }) {
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
      </View>

      <View style={styles.section}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          Jogando agora
        </Text>
        <View style={[styles.panel, styles.players]}>
          <View style={styles.tabs}>
            <Tabs items={SCOPES} selected={scope} onSelect={onScopeChange} />
          </View>
          <Divider />
          <View style={styles.playerResults}>
            {players.data ? (
              players.data.length === 0 ? (
                <Text size="sm" tone="medium" style={styles.playerMessage}>{EMPTY_PLAYERS[scope]}</Text>
              ) : (
                uniquePlayers(players.data).map((player) => <PlayerRow key={player.user.id} player={player} />)
              )
            ) : players.isError ? (
              <>
                <Text size="sm" tone="medium" style={styles.playerMessage}>Não foi possível carregar os jogadores.</Text>
                <Button label="Tentar de novo" variant="ghost" onPress={() => void players.refetch()} />
              </>
            ) : (
              <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
            )}
          </View>
          {players.data && players.data.length > 0 ? (
            <Text size="xs" tone="medium">Alguns dos jogadores, até 10.</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space._3xl, paddingTop: space.xs },
  section: { gap: space.md },
  panel: {
    backgroundColor: colors.bgContrast25,
    borderRadius: radii.lg,
    borderWidth: hairline,
    borderColor: colors.borderLow,
  },
  counts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: space.md,
    rowGap: space.md,
  },
  count: { flex: 1, alignItems: 'center', gap: space.xs, minWidth: 65, paddingHorizontal: space._2xs },
  countLabel: { textAlign: 'center' },
  countNote: { paddingHorizontal: space.md, paddingVertical: space.md },
  players: { padding: space.lg, gap: space.md },
  tabs: { flexDirection: 'row', marginHorizontal: -space.lg },
  playerResults: { gap: space.sm },
  playerMessage: { paddingVertical: space.sm },
  player: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  playerText: { flex: 1 },
  activityList: { marginHorizontal: -space.lg },
  activityFooter: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg },
});
