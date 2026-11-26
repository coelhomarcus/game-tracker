import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { CoverFooter, GameCover, StatusIcon, Text } from '@/components';
import { colors, lineHeight, radii, space, type } from '@/theme/tokens';

import { platformsOf, singleStatus, type LibraryGroup } from './groups';
import { libraryFooter } from './libraryFooter';
import type { LibrarySort } from './prefsStore';
import { statusIcon, statusLabel } from './status';

const TITLE_LINE_HEIGHT = lineHeight(type.size.sm, 'snug');

export type LibraryCardProps = {
  group: LibraryGroup;
  width: number;
  sort: LibrarySort;
  /** Whether the user favorited the game; library entries do not carry that themselves. */
  favorite: boolean;
  /** The status badge is only shown in the unfiltered status tab. */
  showStatus: boolean;
  /** Adds the title and full status label to standalone library cards. */
  detailed?: boolean;
  onPress: (igdbId: number) => void;
};

function recordsLabel(group: LibraryGroup): string {
  if (group.totalEntries > 1) return `${group.totalEntries} registros`;
  return platformsOf(group)[0] || 'Plataforma não informada';
}

export function LibraryCard({ group, width, sort, favorite, showStatus, detailed = false, onPress }: LibraryCardProps) {
  const { fontScale } = useWindowDimensions();
  const status = singleStatus(group);
  const statusText = status ? statusLabel[status] : 'Vários status';
  const statusColor = status ? colors.status[status] : colors.textMedium;
  const records = recordsLabel(group);
  const footer = libraryFooter(group, sort, favorite);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.game.name}, ${statusText}, ${records}`}
      onPress={() => onPress(group.game.igdbId)}
      style={({ pressed }) => [styles.card, { width }, detailed && styles.detailed, detailed && pressed && styles.pressed]}
    >
      <View>
        <GameCover decorative name={group.game.name} url={group.game.coverUrl} width={width} />
        {showStatus ? (
          <View testID="library-card-status" style={styles.status}>
            {detailed ? (
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.statusBadge}>
                <Ionicons name={status ? statusIcon[status] : 'layers-outline'} size={13} color={statusColor} />
                <Text size="xs" weight="semibold" tone="high" numberOfLines={1} style={styles.statusText}>
                  {statusText}
                </Text>
              </View>
            ) : <StatusIcon status={status} />}
          </View>
        ) : null}
      </View>
      {detailed ? (
        <View style={styles.details}>
          <View style={{ minHeight: TITLE_LINE_HEIGHT * 2 * fontScale }}>
            <Text size="sm" leading="snug" weight="semibold" tone="high" numberOfLines={2}>{group.game.name}</Text>
          </View>
          <View style={styles.footer}>
            {typeof footer === 'string' || footer === null ? (
              <Text size="xs" tone="medium" numberOfLines={1}>{footer ?? records}</Text>
            ) : footer}
          </View>
        </View>
      ) : (
        footer ? <CoverFooter>{footer}</CoverFooter> : <View style={styles.emptyFooter} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  detailed: { gap: space.sm, paddingBottom: space.sm },
  pressed: { opacity: 0.8 },
  status: {
    position: 'absolute',
    start: space.xs,
    bottom: space.xs,
    maxWidth: '94%',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: 6,
    borderRadius: radii.sm,
    backgroundColor: `${colors.bg}F2`,
  },
  statusText: { flexShrink: 1 },
  details: { gap: space.xs },
  footer: { minHeight: lineHeight(type.size.xs, 'snug'), justifyContent: 'center' },
  emptyFooter: { height: 22 },
});
