import { Pressable, StyleSheet, View } from 'react-native';

import { CoverFooter, GameCover, StatusIcon } from '@/components';
import { space } from '@/theme/tokens';

import { platformsOf, singleStatus, type LibraryGroup } from './groups';
import { libraryFooter } from './libraryFooter';
import type { LibrarySort } from './prefsStore';
import { statusLabel } from './status';

const FOOTER_HEIGHT = 22;

export type LibraryCardProps = {
  group: LibraryGroup;
  width: number;
  sort: LibrarySort;
  /** The status icon only helps when the list mixes statuses, i.e. under the `Todos` tab. */
  showStatus: boolean;
  onPress: (igdbId: number) => void;
};

function recordsLabel(group: LibraryGroup): string {
  if (group.totalEntries > 1) return `${group.totalEntries} registros`;
  return platformsOf(group)[0] || 'Plataforma não informada';
}

export function LibraryCard({ group, width, sort, showStatus, onPress }: LibraryCardProps) {
  const status = singleStatus(group);
  const footer = libraryFooter(group, sort);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.game.name}, ${status ? statusLabel[status] : 'Vários status'}, ${recordsLabel(group)}`}
      onPress={() => onPress(group.game.igdbId)}
      style={[styles.card, { width }]}
    >
      <View>
        <GameCover name={group.game.name} url={group.game.coverUrl} width={width} />
        {showStatus ? (
          <View testID="library-card-status" style={styles.status}>
            <StatusIcon status={status} />
          </View>
        ) : null}
      </View>
      {/* The slot is always reserved so rows keep the same height with or without a footer. */}
      {footer ? <CoverFooter>{footer}</CoverFooter> : <View style={styles.emptyFooter} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  status: { position: 'absolute', left: space.xs, bottom: space.xs },
  emptyFooter: { height: FOOTER_HEIGHT },
});
