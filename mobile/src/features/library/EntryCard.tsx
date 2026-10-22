import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { RatingStars, Text } from '@/components';
import { formatDate } from '@/lib/dateOnly';
import { formatHours } from '@/lib/hours';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { statusIcon, statusLabel } from './status';
import type { GameEntry } from './types';

const NOTES_LINES = 3;
const MENU_ICON_SIZE = 22;

export type EntryCardProps = {
  entry: GameEntry;
  onOpenMenu: () => void;
};

/** One playthrough of a game: status, platform, dates, hours, rating and private notes. */
export function EntryCard({ entry, onOpenMenu }: EntryCardProps) {
  const details: string[] = [];
  if (entry.startedAt) details.push(`Início ${formatDate(entry.startedAt)}`);
  if (entry.finishedAt) details.push(`Fim ${formatDate(entry.finishedAt)}`);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <View style={styles.statusRow}>
            <Ionicons
              name={statusIcon[entry.status]}
              size={20}
              color={colors.status[entry.status]}
            />
            <Text weight="bold" tone="high">
              {statusLabel[entry.status]}
            </Text>
          </View>
          <Text size="sm" tone="medium">
            {entry.platform}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ações do registro"
          hitSlop={space.sm}
          onPress={onOpenMenu}
          style={styles.menu}
        >
          <Ionicons name="ellipsis-vertical" size={MENU_ICON_SIZE} color={colors.text} />
        </Pressable>
      </View>

      {details.length > 0 || entry.hoursPlayed !== null ? (
        <View style={styles.facts}>
          {details.map((text) => (
            <Text key={text} size="sm">
              {text}
            </Text>
          ))}
          {entry.hoursPlayed !== null ? (
            <Text size="sm">{`${formatHours(entry.hoursPlayed)} h`}</Text>
          ) : null}
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
    borderRadius: radii.md,
    padding: space.lg,
    gap: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1, gap: space.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  menu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  notes: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  notesText: { flex: 1 },
});
