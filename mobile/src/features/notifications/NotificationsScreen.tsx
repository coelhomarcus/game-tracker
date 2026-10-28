import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Stack, useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { Button, EmptyState, ErrorState, Screen, Skeleton, Text } from '@/components';
import type { IoniconName } from '@/features/library/status';
import { showToast } from '@/lib/toast';
import { colors, hairline, radii, space } from '@/theme/tokens';

import {
  groupNotifications,
  sectionGroups,
  type NotificationListEntry,
  type NotificationSectionTitle,
} from './groupNotifications';
import { NotificationRow } from './NotificationRow';
import {
  notificationListsKey,
  useMarkAllRead,
  useNotifications,
  useUnreadCountQuery,
  type NotificationsPages,
} from './queries';
import type { NotificationFilter } from './types';

type FilterInfo = { value: NotificationFilter; label: string; empty: string; icon: IoniconName };

const FILTERS: readonly FilterInfo[] = [
  { value: 'all', label: 'Todas', empty: 'Nenhuma notificação ainda', icon: 'notifications-outline' },
  { value: 'replies', label: 'Respostas', empty: 'Nenhuma resposta ainda', icon: 'chatbubble-outline' },
  { value: 'mentions', label: 'Menções', empty: 'Nenhuma menção ainda', icon: 'at' },
  {
    value: 'follows',
    label: 'Seguidores',
    empty: 'Ninguém começou a seguir você ainda',
    icon: 'person-add-outline',
  },
];

const PILL_HEIGHT = 34;
const PILL_TOUCH = 48;
const FILTER_BAR_PADDING = 8;
const SKELETON_ROWS = 8;
const EMPTY: ReadonlySet<string> = new Set();

type ListHandle = FlatList<NotificationListEntry>;

/**
 * The ids that were unread when everything was marked read: their rows stay tinted until the
 * screen is left. A store (not state) so the ids are in place before the optimistic update lands.
 */
type UnreadSnapshot = { ids: ReadonlySet<string> };

function createUnreadSnapshot(): StoreApi<UnreadSnapshot> {
  return createStore<UnreadSnapshot>(() => ({ ids: EMPTY }));
}

function unreadIdsInCache(client: QueryClient): string[] {
  return client
    .getQueriesData<NotificationsPages>({ queryKey: notificationListsKey })
    .flatMap(([, data]) => data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => !item.read)
    .map((item) => item.id);
}

function FilterBar({ selected, onSelect }: { selected: NotificationFilter; onSelect: (f: NotificationFilter) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      style={styles.filterBar}
      contentContainerStyle={styles.filterBarContent}
    >
      {FILTERS.map(({ value, label }) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(value)}
            style={styles.filterTouch}
          >
            <View style={[styles.filterPill, active ? styles.filterPillActive : styles.filterPillIdle]}>
              <Text size="sm" weight={active ? 'semibold' : 'normal'} style={active ? styles.labelActive : styles.labelIdle}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: NotificationSectionTitle }) {
  return (
    <Text accessibilityRole="header" size="sm" weight="semibold" tone="medium" style={styles.section}>
      {title}
    </Text>
  );
}

function SkeletonRows() {
  return (
    <View accessible accessibilityLabel="Carregando notificações">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} testID="notification-skeleton" style={styles.skeletonRow}>
          <Skeleton.Circle size={44} />
          <View style={styles.skeletonBars}>
            <Skeleton.Text width="80%" />
            <Skeleton.Text size="sm" width="35%" />
          </View>
        </View>
      ))}
    </View>
  );
}

type NotificationListProps = {
  info: FilterInfo;
  wasUnread: ReadonlySet<string>;
  listRef: (list: ListHandle | null) => void;
  onNavigate: (href: Href) => void;
  /** A pull-to-refresh brought the list up to date. */
  onRefreshed: () => void;
};

/** One filter's list: it pages from the server on its own and keeps its own scroll. */
function NotificationList({ info, wasUnread, listRef, onNavigate, onRefreshed }: NotificationListProps) {
  const notifications = useNotifications(info.value);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(EMPTY);
  const { data } = notifications;

  const entries = useMemo(() => {
    const items = (data?.pages ?? [])
      .flatMap((page) => page.items)
      .map((item) => (item.read && wasUnread.has(item.id) ? { ...item, read: false } : item));
    return sectionGroups(groupNotifications(items));
  }, [data, wasUnread]);

  function toggle(key: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  function loadMore() {
    if (notifications.hasNextPage && !notifications.isFetchingNextPage) void notifications.fetchNextPage();
  }

  async function refresh() {
    setRefreshing(true);
    const failed = await notifications.refetch().then(
      (result) => result.isError,
      () => true,
    );
    setRefreshing(false);
    if (failed) showToast('Não foi possível atualizar as notificações');
    else onRefreshed();
  }

  // A failed background refetch keeps the loaded list: the error shows only without data.
  if (data === undefined) {
    return notifications.isError ? (
      <ErrorState
        title="Não foi possível carregar as notificações"
        onRetry={() => void notifications.refetch()}
        fill
      />
    ) : (
      <SkeletonRows />
    );
  }

  return (
    <FlatList
      ref={listRef}
      testID={`notifications-list-${info.value}`}
      data={entries}
      keyExtractor={(entry) => entry.key}
      extraData={expanded}
      renderItem={({ item: entry }) =>
        entry.kind === 'section' ? (
          <SectionHeader title={entry.title} />
        ) : (
          <NotificationRow
            group={entry.group}
            expanded={expanded.has(entry.key)}
            onToggleExpanded={() => toggle(entry.key)}
            onNavigate={onNavigate}
          />
        )
      }
      ListEmptyComponent={<EmptyState title={info.empty} icon={info.icon} fill />}
      ListFooterComponent={
        notifications.isFetchingNextPage ? (
          <ActivityIndicator
            testID="notifications-more"
            accessibilityLabel="Carregando mais"
            color={colors.textMedium}
            style={styles.footer}
          />
        ) : undefined
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshing={refreshing}
      onRefresh={() => void refresh()}
    />
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const focused = useIsFocused();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [visited, setVisited] = useState<ReadonlySet<NotificationFilter>>(() => new Set(['all']));
  const [snapshot] = useState(createUnreadSnapshot);
  const wasUnread = useStore(snapshot, (state) => state.ids);
  const lists = useRef<Partial<Record<NotificationFilter, ListHandle | null>>>({});
  /** A failed mark-all-read is not retried until the screen is focused or refreshed again. */
  const [markFailed, setMarkFailed] = useState(false);

  // Opening "Todas" marks everything read once its first page is in (and again when a refresh
  // brings new unread ones). The snapshot keeps their tint until the screen is left.
  const all = useNotifications('all');
  const { mutate: markAllRead, isPending: marking } = useMarkAllRead();
  const allHasUnread =
    all.data?.pages.some((page) => page.unreadCount > 0 || page.items.some((item) => !item.read)) ?? false;
  const shouldMark = focused && filter === 'all' && allHasUnread && !marking && !markFailed;
  useFocusEffect(
    useCallback(
      () => () => {
        snapshot.setState({ ids: EMPTY });
        setMarkFailed(false);
      },
      [snapshot],
    ),
  );
  useEffect(() => {
    if (!shouldMark) return;
    const ids = unreadIdsInCache(client);
    snapshot.setState((state) => ({ ids: new Set([...state.ids, ...ids]) }));
    markAllRead(undefined, { onError: () => setMarkFailed(true) });
  }, [shouldMark, client, snapshot, markAllRead]);

  // The count is polled (every 30 s) for the bell; while on screen, growth means the list is
  // behind: offer to update it instead of jumping the list.
  const count = useUnreadCountQuery().data;
  const [seenCount, setSeenCount] = useState(count);
  if (count !== undefined && (seenCount === undefined || count < seenCount)) setSeenCount(count);
  const hasNew = focused && !marking && count !== undefined && seenCount !== undefined && count > seenCount;

  function caughtUp() {
    setSeenCount(count);
    setMarkFailed(false);
  }

  function showNew() {
    caughtUp();
    lists.current[filter]?.scrollToOffset({ offset: 0, animated: true });
    void client.invalidateQueries({ queryKey: notificationListsKey });
  }

  function select(next: NotificationFilter) {
    if (next === filter) {
      lists.current[next]?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    setFilter(next);
    setVisited((current) => (current.has(next) ? current : new Set([...current, next])));
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notificações' }} />
      <FilterBar selected={filter} onSelect={select} />
      <View style={styles.fill}>
        {FILTERS.filter((info) => visited.has(info.value)).map((info) => (
          <View key={info.value} style={[styles.fill, info.value !== filter && styles.hidden]}>
            <NotificationList
              info={info}
              wasUnread={wasUnread}
              listRef={(list) => {
                lists.current[info.value] = list;
              }}
              onNavigate={(href) => router.push(href)}
              onRefreshed={caughtUp}
            />
          </View>
        ))}
        {hasNew ? (
          <View pointerEvents="box-none" style={styles.newOverlay}>
            <View style={styles.newTouch}>
              <Button label="Atualizar" icon="arrow-up" size="small" onPress={showNew} />
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  hidden: { display: 'none' },
  filterBar: { flexGrow: 0, borderBottomWidth: hairline, borderBottomColor: colors.borderLow },
  /** The pills' 48 dp boxes reach into the bar's padding: 8 dp around the 34 dp pill. */
  filterBarContent: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: FILTER_BAR_PADDING - (PILL_TOUCH - PILL_HEIGHT) / 2,
  },
  filterTouch: { minHeight: PILL_TOUCH, minWidth: PILL_TOUCH, justifyContent: 'center' },
  filterPill: {
    minHeight: PILL_HEIGHT,
    paddingHorizontal: space.md,
    borderRadius: radii.full,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: { backgroundColor: colors.bgContrast50, borderColor: colors.bgContrast50 },
  filterPillIdle: { backgroundColor: 'transparent', borderColor: colors.borderLow },
  labelActive: { color: colors.textEmphasis },
  labelIdle: { color: colors.textMedium },
  section: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xs },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  skeletonBars: { flex: 1, gap: space.xs },
  footer: { padding: space.lg },
  newOverlay: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' },
  /** The small button's hitSlop makes it a 48 dp target; this box keeps that area inside its parent. */
  newTouch: { padding: space.sm },
});
