import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { colors, space } from '@/theme/tokens';

import type { RecentPerson } from './recentSearches';

const PERSON_WIDTH = 72;
const PERSON_AVATAR = 60;
/** Real touch box of every "x"; the drawn circle is smaller. */
const REMOVE_BOX = 48;
const REMOVE_BADGE = 20;
const ROW_MIN_HEIGHT = 48;

export type SearchRecentsProps = {
  terms: string[];
  people: RecentPerson[];
  onPressTerm: (term: string) => void;
  onRemoveTerm: (term: string) => void;
  onPressPerson: (person: RecentPerson) => void;
  onRemovePerson: (person: RecentPerson) => void;
};

function RecentPersonItem({
  person,
  onPress,
  onRemove,
}: {
  person: RecentPerson;
  onPress: () => void;
  onRemove: () => void;
}) {
  const name = displayName(person);
  return (
    <View style={styles.person}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Perfil de ${name}`}
        onPress={onPress}
        style={styles.personBody}
      >
        <Avatar uri={resolveImageUrl(person.avatarUrl)} name={name} size={PERSON_AVATAR} />
        <Text size="xs" tone="high" numberOfLines={1} style={styles.personName}>
          {name}
        </Text>
      </Pressable>
      {/* A 48 dp box in the item's corner; the small badge inside sits on the avatar's edge. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remover ${name} das pessoas recentes`}
        onPress={onRemove}
        style={styles.personRemove}
      >
        <View style={styles.badge}>
          <Ionicons name="close" size={12} color={colors.text} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Focus mode with nothing typed: the people opened from the search (a row of avatars) and the
 * terms searched before (a list), newest first, each with an "x" that forgets it.
 */
export function SearchRecents({
  terms,
  people,
  onPressTerm,
  onRemoveTerm,
  onPressPerson,
  onRemovePerson,
}: SearchRecentsProps) {
  return (
    <ScrollView
      testID="search-recents"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
    >
      {people.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" weight="semibold" tone="high" style={styles.heading}>
            Pessoas recentes
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.people}
          >
            {people.map((person) => (
              <RecentPersonItem
                key={person.id}
                person={person}
                onPress={() => onPressPerson(person)}
                onRemove={() => onRemovePerson(person)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}
      {terms.length > 0 ? (
        <View style={styles.section}>
          <Text accessibilityRole="header" weight="semibold" tone="high" style={styles.heading}>
            Buscas recentes
          </Text>
          {terms.map((term) => (
            <View key={term} style={styles.termRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Buscar ${term}`}
                onPress={() => onPressTerm(term)}
                style={styles.termBody}
              >
                <Ionicons name="time-outline" size={20} color={colors.textMedium} />
                <Text numberOfLines={1} style={styles.termText}>
                  {term}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover ${term} das buscas recentes`}
                onPress={() => onRemoveTerm(term)}
                style={styles.termRemove}
              >
                <Ionicons name="close" size={20} color={colors.textMedium} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space._2xl },
  section: { paddingTop: space.md },
  heading: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  people: { paddingHorizontal: space.sm, gap: space.sm },
  person: { width: PERSON_WIDTH },
  personBody: { alignItems: 'center', gap: space.xs, paddingTop: space.xs, paddingBottom: space.sm },
  personName: { maxWidth: PERSON_WIDTH, textAlign: 'center' },
  personRemove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: REMOVE_BOX,
    height: REMOVE_BOX,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  badge: {
    width: REMOVE_BADGE,
    height: REMOVE_BADGE,
    borderRadius: REMOVE_BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgContrast50,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    paddingRight: space.xs,
  },
  termBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: ROW_MIN_HEIGHT,
  },
  termText: { flex: 1 },
  termRemove: {
    width: REMOVE_BOX,
    height: REMOVE_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
