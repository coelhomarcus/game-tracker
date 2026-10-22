import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RatingStars } from '@/components';
import { formatDate } from '@/lib/dateOnly';
import { formatHours } from '@/lib/hours';
import { colors, fontSize, radii, space } from '@/theme/tokens';

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
            <Text style={styles.status}>{statusLabel[entry.status]}</Text>
          </View>
          <Text style={styles.muted}>{entry.platform}</Text>
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
            <Text key={text} style={styles.fact}>
              {text}
            </Text>
          ))}
          {entry.hoursPlayed !== null ? (
            <Text style={styles.fact}>{`${formatHours(entry.hoursPlayed)} h`}</Text>
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
            color={colors.textMuted}
          />
          <Text numberOfLines={NOTES_LINES} style={styles.notesText}>
            {entry.notes}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: space.lg,
    gap: space.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerText: { flex: 1, gap: space.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  status: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: 'bold' },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  menu: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.xs },
  fact: { color: colors.text, fontSize: fontSize.sm },
  notes: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  notesText: { flex: 1, color: colors.text, fontSize: fontSize.sm },
});
