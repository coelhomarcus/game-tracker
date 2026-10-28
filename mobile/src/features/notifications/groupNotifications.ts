import type { UserSummary } from '@/features/games/types';

import type { AppNotification, NotificationType } from './types';

/** Likes and reposts of one post this close to the group's newest one join it. */
export const GROUP_WINDOW_MS = 48 * 60 * 60 * 1000;

/** One row of the notifications screen: a single notification or several collapsed into one. */
export type NotificationGroup = {
  /** The id of the newest notification. */
  key: string;
  type: NotificationType;
  /** The newest notification: its post, comment, excerpt, image and time stand for the group. */
  first: AppNotification;
  /** Newest first. */
  items: AppNotification[];
  /** Each actor once, newest first. */
  actors: UserSummary[];
  /** A group is read only when every notification in it is. */
  read: boolean;
};

export type NotificationSectionTitle = 'Hoje' | 'Antes';

export type NotificationListEntry =
  | { kind: 'section'; key: string; title: NotificationSectionTitle }
  | { kind: 'group'; key: string; group: NotificationGroup };

function localDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * What a notification may be collapsed with: likes and reposts of the same post, and follows.
 * Replies, comments, mentions and quotes are each their own row; so is a like or repost whose
 * post is gone.
 */
function groupKey(item: AppNotification): string | null {
  if (item.type === 'follow') return 'follow';
  if ((item.type === 'like' || item.type === 'repost') && item.postId !== null) {
    return `${item.type}:${item.postId}`;
  }
  return null;
}

function joins(group: NotificationGroup, item: AppNotification): boolean {
  if (group.type === 'follow') return localDay(group.first.createdAt) === localDay(item.createdAt);
  return group.first.createdAt.getTime() - item.createdAt.getTime() <= GROUP_WINDOW_MS;
}

/**
 * Collapses notifications (newest first, as the server sends them) into rows: likes or reposts of
 * one post within 48 h of the group's newest one, and follows of one local day. A group keeps the
 * position of its newest notification.
 */
export function groupNotifications(items: readonly AppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  // The newest group of each key; an older notification that does not fit starts the next one.
  const open = new Map<string, NotificationGroup>();

  for (const item of items) {
    const key = groupKey(item);
    const group = key === null ? undefined : open.get(key);
    if (group !== undefined && joins(group, item)) {
      group.items.push(item);
      if (!group.actors.some((actor) => actor.id === item.actor.id)) group.actors.push(item.actor);
      group.read = group.read && item.read;
      continue;
    }
    const created: NotificationGroup = {
      key: item.id,
      type: item.type,
      first: item,
      items: [item],
      actors: [item.actor],
      read: item.read,
    };
    groups.push(created);
    if (key !== null) open.set(key, created);
  }
  return groups;
}

/** Local midnight of `now`: groups from then on are "Hoje", older ones "Antes". */
function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

/** The rows under "Hoje" and "Antes" headers; a section without rows has no header. */
export function sectionGroups(
  groups: readonly NotificationGroup[],
  now: Date = new Date(),
): NotificationListEntry[] {
  const midnight = startOfDay(now);
  const today = groups.filter((group) => group.first.createdAt.getTime() >= midnight);
  const earlier = groups.filter((group) => group.first.createdAt.getTime() < midnight);
  const entries: NotificationListEntry[] = [];
  const section = (title: NotificationSectionTitle, rows: readonly NotificationGroup[]) => {
    if (rows.length === 0) return;
    entries.push({ kind: 'section', key: `section-${title}`, title });
    for (const group of rows) entries.push({ kind: 'group', key: group.key, group });
  };
  section('Hoje', today);
  section('Antes', earlier);
  return entries;
}
