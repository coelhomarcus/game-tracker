import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Avatar, EmptyState, Screen, Text } from '@/components';
import { fontFamily } from '@/components/Text';
import { authErrorMessage, useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { profilesApi } from '@/features/profiles/api';
import { useFollowList, usePeopleSearch } from '@/features/profiles/queries';
import type { UserProfile } from '@/features/profiles/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { colors, lineHeight, space, type } from '@/theme/tokens';

import { useConversations, useStartConversation } from './queries';

const MIN_TERM_LENGTH = 2;
const MAX_SUGGESTIONS = 10;
const AVATAR_SIZE = 42;
const FIELD_RADIUS = 10;
const FONT_SIZE = type.size.md;
/** A suggestion's profile (whether I can message the person) is read again after this long. */
const SUGGESTION_PROFILE_STALE_MS = 60_000;

/** Someone the sheet offers; `canMessage` comes with search results, and from profiles otherwise. */
export type Candidate = UserSummary & { canMessage?: boolean };

/**
 * The suggestions for an empty search: the people of my conversations (most recent first), then
 * the people I follow, without repeats or me, up to 10.
 */
export function pickSuggestions(
  conversationPeople: readonly (UserSummary | null)[],
  following: readonly UserSummary[],
  selfId: string | undefined,
): UserSummary[] {
  const seen = new Set<string>();
  const out: UserSummary[] = [];
  for (const person of [...conversationPeople, ...following]) {
    if (!person || person.id === selfId || seen.has(person.id)) continue;
    seen.add(person.id);
    out.push({ id: person.id, username: person.username, name: person.name, avatarUrl: person.avatarUrl });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Why I cannot message this person, or `null` when I can (or nothing says otherwise). A cached
 * profile tells a block apart; the search tells the person's message policy.
 */
export function messagingRefusal(person: Candidate, client: QueryClient): string | null {
  const profile = client.getQueryData<UserProfile>(['profile', person.id]);
  if (profile?.isBlockedByMe || profile?.blocksMe) return 'Bloqueado';
  if (person.canMessage === false || profile?.canMessage === false) return 'Não aceita mensagens suas';
  return null;
}

type SearchFieldProps = { value: string; onChangeText: (text: string) => void; busy: boolean };

function SearchField({ value, onChangeText, busy }: SearchFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, value.length === 0 && styles.fieldEmpty]}>
      <Ionicons
        testID="search-icon"
        name="search"
        size={20}
        color={focused ? colors.primary : colors.textMedium}
      />
      <TextInput
        accessibilityLabel="Buscar pessoas"
        placeholder="Buscar pessoas"
        placeholderTextColor={colors.textMedium}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={50}
        selectionColor={colors.primary}
        style={styles.input}
      />
      {busy ? (
        <ActivityIndicator accessibilityLabel="Buscando" color={colors.textMedium} />
      ) : null}
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpar busca"
          onPress={() => onChangeText('')}
          style={styles.clear}
        >
          <Ionicons name="close-circle" size={20} color={colors.textMedium} />
        </Pressable>
      ) : null}
    </View>
  );
}

type CandidateRowProps = { person: Candidate; refusal: string | null; onPress: () => void };

/** A person to start a conversation with; dimmed with the reason, and not pressable, when I cannot. */
function CandidateRow({ person, refusal, onPress }: CandidateRowProps) {
  const name = displayName(person);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={refusal ? `${name}, ${refusal}` : `Conversar com ${name}`}
      accessibilityState={{ disabled: refusal !== null }}
      disabled={refusal !== null}
      onPress={onPress}
      style={({ pressed }) => [styles.row, refusal ? styles.refused : null, pressed && styles.pressed]}
    >
      <Avatar uri={resolveImageUrl(person.avatarUrl)} name={name} size={AVATAR_SIZE} />
      <View style={styles.column}>
        <Text numberOfLines={1} weight="semibold" tone="high">
          {name}
        </Text>
        <Text numberOfLines={1} size="sm" tone="medium">{`@${person.username}`}</Text>
        {refusal ? (
          <Text numberOfLines={1} size="sm" tone="medium">
            {refusal}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

type ContentProps = { onClose: () => void };

function SheetContent({ onClose }: ContentProps) {
  const router = useRouter();
  const client = useQueryClient();
  const selfId = useSession((state) => state.user?.id);
  const [term, setTerm] = useState('');
  const search = usePeopleSearch(term);
  const conversations = useConversations();
  const following = useFollowList(selfId, 'following');
  const start = useStartConversation();
  const starting = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const trimmed = term.trim();
  const searching = trimmed.length >= MIN_TERM_LENGTH;
  // The hook keeps the previous results as placeholder data, so a short term is decided here.
  const results: Candidate[] = searching
    ? (search.data ?? []).filter((person) => person.id !== selfId)
    : pickSuggestions(
        (conversations.data ?? []).map((item) => item.otherUser),
        following.data?.pages[0]?.items ?? [],
        selfId,
      );
  // The suggestions come from lists that do not say whether I can message each person; their
  // profiles do (and tell a block apart). At most 10, shared with the profile screens' cache.
  useQueries({
    queries: (searching ? [] : results).map((person) => ({
      queryKey: ['profile', person.id],
      queryFn: () => profilesApi.get(person.id),
      staleTime: SUGGESTION_PROFILE_STALE_MS,
    })),
  });

  async function choose(userId: string) {
    if (starting.current) return;
    starting.current = true;
    setFailure(null);
    try {
      const id = await start.mutateAsync(userId);
      onClose();
      router.push(`/chat/${id}` as Href);
    } catch (error) {
      // A native Modal covers the root toast host, so the sheet shows the failure itself too.
      const message = authErrorMessage(error);
      setFailure(message);
      showToast(message);
    } finally {
      starting.current = false;
    }
  }

  const empty = (() => {
    if (!searching) {
      return (
        <EmptyState
          title="Encontre pessoas"
          message="Busque pelo nome ou username. Digite pelo menos 2 letras."
        />
      );
    }
    if (search.isError) {
      return (
        <EmptyState
          title="Não foi possível buscar agora"
          action={{ label: 'Tentar de novo', onPress: () => void search.refetch() }}
        />
      );
    }
    // Still waiting on the debounce or on the first response: the spinner says it.
    if (search.isPending || search.isPlaceholderData) return null;
    return <EmptyState title="Ninguém encontrado" message={`Nada para "${trimmed}".`} />;
  })();

  const busy = (searching && search.isFetching) || start.isPending;

  return (
    <Screen>
      <View style={styles.top}>
        <Text accessibilityRole="header" size="xl" weight="bold" tone="high">
          Nova conversa
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          onPress={onClose}
          style={styles.close}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <SearchField
          value={term}
          onChangeText={(text) => {
            setTerm(text);
            setFailure(null);
          }}
          busy={busy}
        />
      </View>
      {failure ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          size="sm"
          tone="danger"
          style={styles.failure}
        >
          {failure}
        </Text>
      ) : null}
      <FlatList
        data={results}
        keyExtractor={(person) => person.id}
        renderItem={({ item }) => (
          <CandidateRow
            person={item}
            refusal={messagingRefusal(item, client)}
            onPress={() => void choose(item.id)}
          />
        )}
        ListHeaderComponent={
          !searching && results.length > 0 ? (
            <Text accessibilityRole="header" size="sm" weight="semibold" tone="medium" style={styles.section}>
              Sugestões
            </Text>
          ) : undefined
        }
        ListEmptyComponent={empty ?? undefined}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
}

export type NewConversationSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** The content mounts only while visible, so each opening starts with an empty search. */
export function NewConversationSheet({ visible, onClose }: NewConversationSheetProps) {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
      {visible ? <SheetContent onClose={onClose} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: space.lg,
    paddingRight: space.sm,
    minHeight: 56,
  },
  close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  search: { paddingHorizontal: space.lg, paddingBottom: space.md },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 48,
    paddingLeft: space.md,
    borderRadius: FIELD_RADIUS,
    backgroundColor: colors.bgContrast50,
  },
  // Without the clear button the field's end needs its own padding.
  fieldEmpty: { paddingRight: space.md },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    fontFamily: fontFamily.normal,
    fontSize: FONT_SIZE,
    lineHeight: lineHeight(FONT_SIZE, 'snug'),
    color: colors.text,
  },
  clear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  failure: { paddingHorizontal: space.lg, paddingBottom: space.md },
  section: { paddingHorizontal: space.lg, paddingTop: space.xs, paddingBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  refused: { opacity: 0.5 },
  pressed: { backgroundColor: colors.bgContrast25 },
  column: { flex: 1 },
});
