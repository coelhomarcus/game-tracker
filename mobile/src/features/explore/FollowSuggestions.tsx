import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Skeleton } from '@/components';
import { PersonRow } from '@/features/profiles/PersonRow';
import { useFollowSuggestions } from '@/features/profiles/queries';
import type { SuggestedPerson } from '@/features/profiles/types';
import { space } from '@/theme/tokens';

import { ExploreSection } from './ExploreSection';

/** Rows shown before "Ver mais"; the list holds up to 10. */
export const SUGGESTIONS_COLLAPSED = 5;
const SKELETON_ROWS = ['a', 'b', 'c'];
const AVATAR_SIZE = 48;

function SuggestionSkeleton() {
  return (
    <View testID="suggestions-skeleton">
      {SKELETON_ROWS.map((id) => (
        <View key={id} style={styles.skeletonRow}>
          <Skeleton.Circle size={AVATAR_SIZE} />
          <View style={styles.skeletonText}>
            <Skeleton.Text width="50%" />
            <Skeleton.Text size="sm" width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * "Sugestões para seguir": people to follow with their bio and a follow button, five at first and
 * up to ten after "Ver mais". With no one to suggest (or a failure) the module is left out.
 */
export function FollowSuggestions({ onOpenPerson }: { onOpenPerson: (person: SuggestedPerson) => void }) {
  const suggestions = useFollowSuggestions();
  const [expanded, setExpanded] = useState(false);

  if (suggestions.isPending) {
    return (
      <ExploreSection title="Sugestões para seguir">
        <SuggestionSkeleton />
      </ExploreSection>
    );
  }
  const people = suggestions.data ?? [];
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, SUGGESTIONS_COLLAPSED);
  return (
    <ExploreSection title="Sugestões para seguir">
      <View>
        {shown.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            followsMe={person.followsMe}
            onPress={() => onOpenPerson(person)}
          />
        ))}
        {!expanded && people.length > SUGGESTIONS_COLLAPSED ? (
          <View style={styles.more}>
            <Button
              label="Ver mais"
              variant="ghost"
              color="primary"
              size="small"
              onPress={() => setExpanded(true)}
            />
          </View>
        ) : null}
      </View>
    </ExploreSection>
  );
}

const styles = StyleSheet.create({
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  skeletonText: { flex: 1 },
  more: { alignItems: 'flex-start', paddingHorizontal: space.sm, paddingVertical: space.sm },
});
