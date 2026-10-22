import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, Screen, Tabs, Text } from '@/components';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

import { NotificationRow } from './NotificationRow';
import { useMarkAllRead, useNotifications } from './queries';
import type { AppNotification, NotificationType } from './types';

const LIMIT = 50;

type Filter = 'all' | 'interactions' | 'followers';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tudo' },
  { value: 'interactions', label: 'Interações' },
  { value: 'followers', label: 'Seguidores' },
];

const FILTER_TYPES: Record<Filter, readonly NotificationType[] | null> = {
  all: null,
  interactions: ['like', 'comment', 'reply', 'mention', 'repost', 'quote'],
  followers: ['follow'],
};

/**
 * Every post notification opens its post: for a quote that is the new quote post (the backend
 * sends it as `postId`). Highlighting `commentId` for replies and mentions comes later.
 */
function targetOf(item: AppNotification): Href | null {
  if (item.type === 'follow') return `/users/${item.actor.id}` as Href;
  return item.postId === null ? null : (`/posts/${item.postId}` as Href);
}

function MarkAllReadButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Marcar todas como lidas"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.markAll}
    >
      <Ionicons name="checkmark-done" size={24} color={disabled ? colors.textMedium : colors.text} />
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();

  const data = notifications.data;
  const unread = data?.unreadCount ?? 0;
  const types = FILTER_TYPES[filter];
  const items = (data?.items ?? []).filter((item) => types === null || types.includes(item.type));

  async function refresh() {
    setRefreshing(true);
    const failed = await notifications.refetch().then(
      (result) => result.isError,
      () => true,
    );
    setRefreshing(false);
    if (failed) showToast('Não foi possível atualizar as notificações');
  }

  const header = (
    <Stack.Screen
      options={{
        title: 'Notificações',
        headerRight: () => (
          <MarkAllReadButton disabled={unread === 0} onPress={() => markAllRead.mutate()} />
        ),
      }}
    />
  );

  // A failed background refetch keeps the loaded list: the error shows only without data.
  if (data === undefined) {
    return (
      <Screen>
        {header}
        {notifications.isError ? (
          <EmptyState
            title="Não foi possível carregar as notificações"
            action={{ label: 'Tentar de novo', onPress: () => void notifications.refetch() }}
          />
        ) : (
          <ActivityIndicator
            accessibilityLabel="Carregando"
            color={colors.textMedium}
            style={styles.loading}
          />
        )}
      </Screen>
    );
  }

  const footer =
    data.items.length === LIMIT ? (
      <Text size="sm" tone="medium" style={styles.footer}>{`Mostrando as ${LIMIT} mais recentes.`}</Text>
    ) : undefined;
  const filterLabel = FILTERS.find((entry) => entry.value === filter)?.label ?? '';
  const empty =
    data.items.length === 0 ? (
      <EmptyState
        title="Sem notificações"
        message="Curtidas, comentários e novos seguidores aparecem aqui."
      />
    ) : (
      <EmptyState title={`Nada em "${filterLabel}"`} />
    );

  return (
    <Screen>
      {header}
      <FlatList
        testID="notifications-list"
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const target = targetOf(item);
          return (
            <NotificationRow
              notification={item}
              canOpen={target !== null}
              onPress={() => target !== null && router.push(target)}
            />
          );
        }}
        ListHeaderComponent={
          <View style={styles.tabs}>
            <Tabs items={FILTERS} selected={filter} onSelect={setFilter} />
          </View>
        }
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  markAll: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: space._2xl },
  tabs: { paddingVertical: space.md },
  footer: {
    textAlign: 'center',
    padding: space.lg,
  },
});
