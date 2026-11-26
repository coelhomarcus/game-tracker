import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, GameCover, Text } from '@/components';
import type { Game } from '@/features/games/types';
import { useGameBackdrop } from '@/features/games/useGameBackdrop';
import { statusIcon, statusLabel } from '@/features/library/status';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space, type GameStatus } from '@/theme/tokens';

import { formatCount } from './formatCount';
import { PostMoreMenu } from './PostMoreMenu';
import { useTogglePostLike } from './queries';
import { displayName, itemHref, type Post } from './types';

const ACTION: Record<GameStatus, string> = {
  backlog: 'adicionou à fila',
  playing: 'começou a jogar',
  completed: 'zerou',
  dropped: 'abandonou',
};

function ActivityGameBanner({ game, platform, color }: { game: Game; platform?: string; color: string }) {
  const router = useRouter();
  const { uri, isScreenshot, onError } = useGameBackdrop(game);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Abrir jogo ${game.name}`}
      accessibilityHint={platform || undefined}
      onPress={() => router.push(`/games/${game.igdbId}` as Href)}
      style={[styles.banner, uri === null && styles.bannerCompact]}
    >
      {({ pressed }) => (
        <>
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[StyleSheet.absoluteFill, { backgroundColor: `${color}24` }]}
          >
            {uri !== null ? (
              <Image
                key={uri}
                testID="activity-game-art"
                source={{ uri }}
                resizeMode="cover"
                blurRadius={isScreenshot ? 0 : 14}
                onError={onError}
                style={[StyleSheet.absoluteFill, styles.art, !isScreenshot && styles.blurredCover]}
              />
            ) : null}
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          </View>
          <View style={styles.gameInfo}>
            {game.coverUrl || uri === null ? (
              <GameCover decorative name={game.name} url={game.coverUrl} width={52} />
            ) : null}
            <View style={styles.gameText}>
              <Text size="_2xl" leading="tight" weight="bold" tone="high" numberOfLines={2}>{game.name}</Text>
              {platform ? <Text size="sm" tone="medium" numberOfLines={1}>{platform}</Text> : null}
            </View>
            <View style={styles.openGame}>
              <Ionicons name="chevron-forward" size={16} color={colors.textEmphasis} />
            </View>
          </View>
          {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.bannerPressed]} /> : null}
        </>
      )}
    </Pressable>
  );
}

type ActivityRowProps = {
  activity: Post;
  onReply?: () => void;
  onDeleted?: () => void;
};

export function ActivityRow({ activity, onReply, onDeleted }: ActivityRowProps) {
  const router = useRouter();
  const like = useTogglePostLike();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUsed, setMenuUsed] = useState(false);
  const { author, game, entry, activityStatus: status, likeCount, commentCount } = activity;
  const name = displayName(author);
  const color = status ? colors.status[status] : colors.textMedium;
  const action = status && game ? ACTION[status] : activity.content;

  return (
    <View testID="activity-row" style={styles.row}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <View style={styles.person}>
              <ProfileLink user={author} hitSlop={4} touchOnly>
                <Avatar name={name} uri={resolveImageUrl(author.avatarUrl)} size={36} />
              </ProfileLink>
              <View style={styles.personText}>
                <ProfileLink user={author} hitSlop={2}>
                  <Text weight="bold" tone="high" numberOfLines={1}>{name}</Text>
                </ProfileLink>
                {status && game ? <Text size="sm" tone="medium">{action}</Text> : null}
              </View>
            </View>
            <Text size="xs" tone="medium">{formatRelativeTime(activity.createdAt)}</Text>
          </View>
          {status && game ? null : <Text size="sm" tone="medium">{action}</Text>}
        </View>
        {game ? <ActivityGameBanner game={game} color={color} platform={entry?.platform} /> : null}
        <View style={styles.controls}>
          {status ? (
            <View style={[styles.status, { backgroundColor: `${color}1A` }]}>
              <Ionicons name={statusIcon[status]} size={14} color={color} accessibilityElementsHidden importantForAccessibility="no" />
              <Text size="xs" weight="semibold" style={{ color }}>{statusLabel[status]}</Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${activity.likedByMe ? 'Descurtir' : 'Curtir'} atividade, ${likeCount} ${likeCount === 1 ? 'curtida' : 'curtidas'}`}
              accessibilityState={{ selected: activity.likedByMe }}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              onPress={() => like.mutate(activity)}
            >
              <Ionicons name={activity.likedByMe ? 'heart' : 'heart-outline'} size={18} color={activity.likedByMe ? colors.primary : colors.textMedium} />
              <Text size="sm" tone={activity.likedByMe ? 'primary' : 'medium'}>{formatCount(likeCount)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Comentar atividade, ${commentCount} ${commentCount === 1 ? 'comentário' : 'comentários'}`}
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              onPress={onReply ?? (() => router.push(itemHref(activity.id, 'activity')))}
            >
              <Ionicons name="chatbubble-outline" size={17} color={colors.textMedium} />
              <Text size="sm" tone="medium">{formatCount(commentCount)}</Text>
            </Pressable>
            {onDeleted ? (
              <Button shape="round" size="small" color="secondary" variant="ghost" icon="ellipsis-horizontal"
                accessibilityLabel="Opções da atividade" onPress={() => { setMenuUsed(true); setMenuOpen(true); }} />
            ) : null}
          </View>
        </View>
      </View>
      {menuUsed ? (
        <PostMoreMenu post={activity} visible={menuOpen} narrow={false} onShare={() => {}}
          onClose={() => setMenuOpen(false)} onDone={onDeleted} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  card: {
    overflow: 'hidden',
    borderRadius: radii.lg,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
  header: { padding: space.md, gap: space.sm },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: space.sm },
  personText: { flex: 1, gap: space._2xs },
  banner: { minHeight: 152, justifyContent: 'flex-end', overflow: 'hidden', backgroundColor: colors.bg },
  bannerCompact: { minHeight: 100 },
  art: { width: '100%', height: '100%' },
  blurredCover: { opacity: 0.64 },
  scrim: {
    backgroundColor: '#0000001A',
    backgroundImage: 'linear-gradient(to bottom, #080A0F00 8%, #080A0F8C 47%, #080A0FF5 100%)',
  },
  gameInfo: { minHeight: 98, padding: space.md, flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  gameText: { flex: 1, minWidth: 0, gap: space.xs, paddingBottom: space.xs },
  openGame: {
    width: 32,
    height: 32,
    borderRadius: radii.full,
    backgroundColor: '#101217BD',
    borderWidth: hairline,
    borderColor: '#FFFFFF33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerPressed: { backgroundColor: '#FFFFFF12' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, paddingHorizontal: space.md, minHeight: 50 },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingVertical: 5, paddingHorizontal: space.sm, borderRadius: radii.full },
  actions: { flexDirection: 'row', alignItems: 'center', marginStart: 'auto' },
  action: { flexDirection: 'row', gap: space.xs, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.full },
  actionPressed: { backgroundColor: colors.bgContrast50 },
});
