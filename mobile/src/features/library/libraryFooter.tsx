import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { RatingStars } from '@/components';
import { formatHours } from '@/lib/hours';
import { colors, space } from '@/theme/tokens';

import { bestRating, hasNotes, knownHours, newestAddedAt, oldestAddedAt, type LibraryGroup } from './groups';
import type { LibrarySort } from './prefsStore';

const ICON_SIZE = 12;

/** `dd/mm/aa` in local time: `createdAt` is an instant the user sees on their own calendar. */
function formatAddedDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${pad(date.getFullYear() % 100)}`;
}

/** What the pill under a cover says about the sort in use; `null` when there is nothing to say. */
export function libraryFooter(
  group: LibraryGroup,
  sort: LibrarySort,
  favorite: boolean,
): ReactNode | null {
  switch (sort) {
    case 'recent':
      return formatAddedDate(newestAddedAt(group));
    case 'oldest':
      return formatAddedDate(oldestAddedAt(group));
    case 'mostPlayed': {
      const hours = knownHours(group);
      return hours === null ? null : `${formatHours(hours)} h`;
    }
    case 'rating': {
      const rating = bestRating(group);
      const notes = hasNotes(group);
      if (rating === null && !favorite && !notes) return null;
      return (
        <View style={styles.row}>
          {rating !== null ? <RatingStars rating={rating} /> : null}
          {favorite ? (
            <Ionicons testID="library-footer-favorite" name="heart" size={ICON_SIZE} color={colors.accent} />
          ) : null}
          {notes ? (
            <Ionicons
              testID="library-footer-notes"
              name="document-text-outline"
              size={ICON_SIZE}
              color={colors.textMuted}
            />
          ) : null}
        </View>
      );
    }
    case 'name':
      return null;
  }
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
