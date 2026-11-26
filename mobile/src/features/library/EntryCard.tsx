import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { RatingStars, Text } from '@/components';
import { formatDate } from '@/lib/dateOnly';
import { formatHours } from '@/lib/hours';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { statusIcon, statusLabel, type IoniconName } from './status';
import type { GameEntry } from './types';

const NOTES_LINES = 3;
const MENU_ICON_SIZE = 22;

export type EntryCardProps = {
  entry: GameEntry;
  onOpenMenu: () => void;
};

/** One playthrough of a game: status, platform, dates, hours, rating and private notes. */
export function EntryCard({ entry, onOpenMenu }: EntryCardProps) {
  const statusColor = colors.status[entry.status];
  const details: { icon: IoniconName; label: string }[] = [];
  if (entry.startedAt) details.push({ icon: 'calendar-outline', label: `Início ${formatDate(entry.startedAt)}` });
  if (entry.finishedAt) details.push({ icon: 'flag-outline', label: `Fim ${formatDate(entry.finishedAt)}` });
  if (entry.hoursPlayed !== null) details.push({ icon: 'time-outline', label: `${formatHours(entry.hoursPlayed)} h` });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.statusTile, { backgroundColor: `${statusColor}1A` }]}
        >
          <Ionicons name={statusIcon[entry.status]} size={21} color={statusColor} />
        </View>
        <View style={styles.headerText}>
          <Text weight="bold" tone="high">{statusLabel[entry.status]}</Text>
          <Text size="sm" tone="medium">
            {entry.platform}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ações do registro"
          hitSlop={space.sm}
          onPress={onOpenMenu}
          style={({ pressed }) => [styles.menu, pressed && styles.menuPressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={MENU_ICON_SIZE} color={colors.textMedium} />
        </Pressable>
      </View>

      {details.length > 0 ? (
        <View style={styles.facts}>
          {details.map(({ icon, label }) => (
            <View key={icon} style={styles.fact}>
              <Ionicons name={icon} size={15} color={colors.textMedium} accessibilityElementsHidden importantForAccessibility="no" />
              <Text size="sm">{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {entry.rating !== null ? <RatingStars rating={entry.rating} size={16} /> : null}

      {entry.notes ? (
        <View style={styles.notes}>
          <Ionicons
            accessibilityLabel="Nota privada"
            name="lock-closed-outline"
            size={16}
            color={colors.textMedium}
          />
          <Text numberOfLines={NOTES_LINES} size="sm" style={styles.notesText}>
            {entry.notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgContrast25,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    borderRadius: radii.lg,
    padding: space.lg,
    gap: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: space._2xs },
  statusTile: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  menu: { width: 40, height: 40, borderRadius: radii.full, alignItems: 'center', justifyContent: 'center' },
  menuPressed: { backgroundColor: colors.bgContrast50 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  fact: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  notes: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingTop: space.md,
    borderTopWidth: hairline,
    borderColor: colors.borderLow,
  },
  notesText: { flex: 1 },
});
