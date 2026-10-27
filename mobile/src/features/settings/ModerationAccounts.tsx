import { useRouter, type Href } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Button, EmptyState, Screen, Text } from '@/components';
import { displayName } from '@/features/feed/types';
import type { UserSummary } from '@/features/games/types';
import { useModerationList, useSetModeration, type ModerationKind } from '@/features/profiles/queries';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

const AVATAR_SIZE = 42;

const COPY: Record<ModerationKind, { undo: string; empty: string; emptyMessage: string }> = {
  mutes: {
    undo: 'Reativar',
    empty: 'Você não silenciou ninguém',
    emptyMessage:
      'Os posts e as notificações de quem você silenciar deixam de aparecer para você. A pessoa não fica sabendo.',
  },
  blocks: {
    undo: 'Desbloquear',
    empty: 'Você não bloqueou ninguém',
    emptyMessage:
      'Vocês deixam de ver os posts um do outro e não podem interagir nem trocar mensagens.',
  },
};

type RowProps = {
  person: UserSummary;
  undoLabel: string;
  onOpen: (person: UserSummary) => void;
  onUndo: (person: UserSummary) => void;
};

/** Avatar, name and handle (opens the profile) and the small button that undoes the mute or block. */
const AccountRow = memo(function AccountRow({ person, undoLabel, onOpen, onUndo }: RowProps) {
  const name = displayName(person);
  return (
    <View testID="moderation-row" style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Perfil de ${name}`}
        onPress={() => onOpen(person)}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <Avatar uri={resolveImageUrl(person.avatarUrl)} name={name} size={AVATAR_SIZE} />
        <View style={styles.column}>
          <Text numberOfLines={1} weight="bold" tone="high">
            {name}
          </Text>
          <Text numberOfLines={1} size="sm" tone="medium">
            {`@${person.username}`}
          </Text>
        </View>
      </Pressable>
      <Button
        label={undoLabel}
        accessibilityLabel={`${undoLabel} ${name}`}
        size="small"
        color="secondary"
        onPress={() => onUndo(person)}
      />
    </View>
  );
});

/** The accounts the signed-in user muted or blocked, newest first, each with its undo. */
export function ModerationAccounts({ kind }: { kind: ModerationKind }) {
  const router = useRouter();
  const copy = COPY[kind];
  const query = useModerationList(kind);
  const { mutate } = useSetModeration(kind);
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage, refetch } = query;
  const people = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  const open = useCallback(
    (person: UserSummary) => router.push(`/users/${person.id}` as Href),
    [router],
  );
  const undo = useCallback((person: UserSummary) => mutate({ person, on: false }), [mutate]);
  const renderItem = useCallback(
    ({ item }: { item: UserSummary }) => (
      <AccountRow person={item} undoLabel={copy.undo} onOpen={open} onUndo={undo} />
    ),
    [copy.undo, open, undo],
  );

  const loadMore = useCallback(() => {
    // A second call while a page loads (the list fires it again on layout) joins that load.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    }
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

  // Every loaded row can be undone while more pages wait on the server: ask for the next one.
  const exhausted = data !== undefined && people.length === 0 && hasNextPage;
  useEffect(() => {
    if (exhausted && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [exhausted, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  let empty: ReactElement | null;
  if (exhausted) {
    // Not empty yet: the footer shows the page loading, or the retry when it failed.
    empty = null;
  } else if (data !== undefined) {
    empty = <EmptyState title={copy.empty} message={copy.emptyMessage} fill />;
  } else if (query.isError) {
    empty = (
      <EmptyState
        title="Não foi possível carregar a lista"
        action={{ label: 'Tentar de novo', onPress: () => void refetch() }}
        fill
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
        <ActivityIndicator testID="moderation-loading-more" color={colors.textMedium} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <View style={styles.footer}>
        <Text size="sm" tone="medium" style={styles.footerText}>
          Não foi possível carregar mais contas.
        </Text>
        <Button label="Tentar de novo" color="secondary" onPress={() => void fetchNextPage()} />
      </View>
    );
  }

  return (
    <Screen>
      <FlatList
        testID="moderation-list"
        data={people}
        keyExtractor={(person) => person.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        onRefresh={() => void refresh()}
        refreshing={pulling}
        ListEmptyComponent={empty ?? undefined}
        ListFooterComponent={footer}
      />
    </Screen>
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
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingLeft: space.lg,
    paddingVertical: space.md,
  },
  pressed: { backgroundColor: colors.bgContrast25 },
  column: { flex: 1, gap: space._2xs },
  loading: { padding: space._2xl, alignItems: 'center' },
  footer: { alignItems: 'center', gap: space.md, paddingVertical: space._2xl, paddingHorizontal: space.lg },
  footerText: { textAlign: 'center' },
});
