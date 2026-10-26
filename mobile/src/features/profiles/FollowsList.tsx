import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { memo, useCallback, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, EmptyState, Layout, Screen, Text } from '@/components';
import { useSession } from '@/features/auth';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { colors, radii, space } from '@/theme/tokens';

import { FollowButton } from './FollowButton';
import { useFollowList, useProfile, type FollowListKind } from './queries';
import type { FollowListPerson } from './types';

const AVATAR_SIZE = 42;
const BIO_LINES = 2;

export const FOLLOWS_TITLE: Record<FollowListKind, string> = {
  followers: 'Seguidores',
  following: 'Seguindo',
};

/** The empty copy names the profile's handle when it is known. */
function emptyTitle(kind: FollowListKind, username: string | undefined): string {
  const who = username === undefined ? null : `@${username}`;
  if (kind === 'followers') return who ? `Ninguém segue ${who} ainda` : 'Ninguém segue esta conta ainda';
  return who ? `${who} ainda não segue ninguém` : 'Esta conta ainda não segue ninguém';
}

type RowProps = { person: FollowListPerson; self: boolean; onPress: (person: FollowListPerson) => void };

/** Avatar, name and handle (with "Segue você"), up to two lines of bio and the follow button. */
const FollowsRow = memo(function FollowsRow({ person, self, onPress }: RowProps) {
  const name = displayName(person);
  const bio = person.bio?.trim();
  return (
    <View testID="follows-row" style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Perfil de ${name}`}
        onPress={() => onPress(person)}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <Avatar uri={resolveImageUrl(person.avatarUrl)} name={name} size={AVATAR_SIZE} />
        <View style={styles.column}>
          <Text numberOfLines={1} weight="bold" tone="high">
            {name}
          </Text>
          <View style={styles.handleRow}>
            {person.followsMe ? (
              <View style={styles.followsYou}>
                <Text size="xs">Segue você</Text>
              </View>
            ) : null}
            <Text numberOfLines={1} size="sm" tone="medium" style={styles.handle}>
              {`@${person.username}`}
            </Text>
          </View>
          {bio ? (
            <Text testID="follows-bio" numberOfLines={BIO_LINES} size="sm" style={styles.bio}>
              {bio}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {self ? null : (
        <FollowButton
          userId={person.id}
          following={person.isFollowedByMe}
          followsMe={person.followsMe}
          name={name}
          size="small"
        />
      )}
    </View>
  );
});

export type FollowsListProps = {
  userId: string;
  kind: FollowListKind;
  /** The profile's handle, for the empty copy; unknown until the profile loads. */
  username?: string;
};

/** Who follows a user, or whom they follow: newest follow first, more pages as it scrolls. */
export function FollowsList({ userId, kind, username }: FollowsListProps) {
  const router = useRouter();
  const selfId = useSession((state) => state.user?.id);
  const query = useFollowList(userId, kind);
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = query;
  const people = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const open = useCallback(
    (person: FollowListPerson) => router.push(`/users/${person.id}` as Href),
    [router],
  );
  const renderItem = useCallback(
    ({ item }: { item: FollowListPerson }) => (
      <FollowsRow person={item} self={item.id === selfId} onPress={open} />
    ),
    [open, selfId],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const [pulling, setPulling] = useState(false);
  const refresh = useCallback(async () => {
    setPulling(true);
    try {
      const failed = await refetch().then(
        (result) => result.isError,
        () => true,
      );
      if (failed) showToast('Não foi possível atualizar a lista');
    } finally {
      setPulling(false);
    }
  }, [refetch]);

  let empty: ReactElement;
  if (data !== undefined) {
    empty = <EmptyState title={emptyTitle(kind, username)} />;
  } else if (query.isError) {
    empty = (
      <EmptyState
        title="Não foi possível carregar a lista"
        action={{ label: 'Tentar de novo', onPress: () => void refetch() }}
      />
    );
  } else {
    empty = (
      <View style={styles.loading}>
        <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />
      </View>
    );
  }

  let footer: ReactElement | undefined;
  if (isFetchingNextPage) {
    footer = (
      <View style={styles.footer}>
        <ActivityIndicator testID="follows-loading-more" color={colors.textMedium} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <View style={styles.footer}>
        <Text size="sm" tone="medium" style={styles.footerText}>
          Não foi possível carregar mais pessoas.
        </Text>
        <Button label="Tentar de novo" color="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  }

  return (
    <Screen>
      <FlatList
        testID="follows-list"
        data={people}
        keyExtractor={(person) => person.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={() => void refresh()}
        refreshing={pulling}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
      />
    </Screen>
  );
}

function FollowsTitle({ title, username }: { title: string; username: string | undefined }) {
  return (
    <View>
      <Layout.Header.TitleText>{title}</Layout.Header.TitleText>
      {username === undefined ? null : (
        <Layout.Header.SubtitleText>{`@${username}`}</Layout.Header.SubtitleText>
      )}
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/users/[id]/followers` and `/following`, the own profile's lists included: a stack screen
 * titled "Seguidores" or "Seguindo" over the profile's "@usuario".
 */
export function FollowsRoute({ kind }: { kind: FollowListKind }) {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);
  // Usually cached: the lists open from the profile's counts.
  const { data: profile } = useProfile(id);
  const title = FOLLOWS_TITLE[kind];
  const username = profile?.username;

  const headerTitle = useCallback(
    () => <FollowsTitle title={title} username={username} />,
    [title, username],
  );

  if (id === undefined) return null;
  return (
    <>
      <Stack.Screen options={{ title, headerTitle }} />
      <FollowsList userId={id} kind={kind} username={username} />
    </>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingVertical: space.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingRight: space.lg,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: 48,
    paddingLeft: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.bgContrast25 },
  column: { flex: 1, gap: space._2xs },
  handleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  handle: { flexShrink: 1 },
  followsYou: {
    backgroundColor: colors.bgContrast50,
    borderRadius: radii.xs,
    paddingHorizontal: space.xs,
    paddingVertical: space._2xs,
  },
  bio: { paddingTop: space._2xs },
  loading: { padding: space._2xl, alignItems: 'center' },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
