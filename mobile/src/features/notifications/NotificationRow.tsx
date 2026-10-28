import type { Href } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Text } from '@/components';
import { displayName } from '@/features/feed/types';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatShortRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, radii, space } from '@/theme/tokens';

import type { NotificationGroup } from './groupNotifications';
import { NotificationActorList, NotificationAvatarStack } from './NotificationAvatarStack';
import { NotificationBadge } from './NotificationBadge';
import type { NotificationType } from './types';

const AVATAR_SIZE = 44;
const THUMBNAIL_SIZE = 60;
const ROW_PADDING_VERTICAL = 12;

/** What one person did. Replies and comments quote their text when the server sent it. */
function singleVerb(type: NotificationType, excerpt: string | null): string {
  switch (type) {
    case 'like':
      return 'curtiu seu post';
    case 'repost':
      return 'repostou seu post';
    case 'follow':
      return 'começou a seguir você';
    case 'reply':
      return excerpt === null ? 'respondeu seu comentário' : `respondeu: ${excerpt}`;
    case 'comment':
      return excerpt === null ? 'comentou no seu post' : `comentou: ${excerpt}`;
    case 'mention':
      return 'mencionou você';
    case 'quote':
      return 'citou seu post';
  }
}

/** Only likes, reposts and follows group, so only they have a plural. */
const GROUP_VERBS: Partial<Record<NotificationType, string>> = {
  like: 'curtiram seu post',
  repost: 'repostaram seu post',
  follow: 'começaram a seguir você',
};

/** The sentence of a row in parts: the first name in bold, "mais N" in bold when grouped, the verb. */
function sentenceOf(group: NotificationGroup): { name: string; others: number; verb: string } {
  const name = displayName(group.first.actor);
  const others = group.actors.length - 1;
  const plural = GROUP_VERBS[group.type];
  if (others > 0 && plural !== undefined) return { name, others, verb: plural };
  return { name, others: 0, verb: singleVerb(group.type, group.first.excerpt) };
}

/** Whether the post text goes under the sentence; replies and comments already quote theirs. */
function showsExcerpt(type: NotificationType): boolean {
  return type !== 'reply' && type !== 'comment' && type !== 'follow';
}

/** Several people in one row: the faces, the chevron and the expandable list. */
export function isGroupedRow(group: NotificationGroup): boolean {
  return group.actors.length > 1;
}

/**
 * Where a row leads: a follow opens the follower's profile, every other type its post (for a
 * quote that is the new quote post, which the backend sends as `postId`). A grouped follow has no
 * single target: pressing it shows the people instead.
 */
export function notificationTarget(group: NotificationGroup): Href | null {
  if (group.type === 'follow') {
    return isGroupedRow(group) ? null : (`/users/${group.first.actor.id}` as Href);
  }
  return group.first.postId === null ? null : (`/posts/${group.first.postId}` as Href);
}

export type NotificationRowProps = {
  group: NotificationGroup;
  expanded: boolean;
  onToggleExpanded: () => void;
  onNavigate: (href: Href) => void;
  now?: Date;
};

export function NotificationRow({ group, expanded, onToggleExpanded, onNavigate, now }: NotificationRowProps) {
  const { first } = group;
  const actorName = displayName(first.actor);
  const { name, others, verb } = sentenceOf(group);
  const grouped = isGroupedRow(group);
  const target = notificationTarget(group);
  const expandsOnPress = target === null && grouped;
  const time = formatShortRelativeTime(first.createdAt, now);
  const unread = !group.read;
  const sentence = others > 0 ? `${name} e mais ${others} ${verb}` : `${name} ${verb}`;
  const excerpt = showsExcerpt(group.type) ? first.excerpt : null;
  const thumbnail = resolveImageUrl(first.postImageUrl);

  function press() {
    if (target !== null) onNavigate(target);
    else if (expandsOnPress) onToggleExpanded();
  }

  return (
    <Pressable
      testID={`notification-${group.key}`}
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Não lida. ' : ''}${sentence}, ${time}`}
      accessibilityState={{ disabled: target === null && !expandsOnPress, expanded: grouped ? expanded : undefined }}
      disabled={target === null && !expandsOnPress}
      onPress={press}
      style={({ pressed }) => [styles.row, (unread || pressed) && styles.tinted]}
    >
      <View style={styles.avatar}>
        <Avatar uri={resolveImageUrl(first.actor.avatarUrl)} name={actorName} size={AVATAR_SIZE} />
        <NotificationBadge type={group.type} />
      </View>
      <View style={styles.content}>
        {grouped ? (
          <NotificationAvatarStack actors={group.actors} expanded={expanded} onToggle={onToggleExpanded} />
        ) : null}
        {grouped && expanded ? (
          <NotificationActorList
            actors={group.actors}
            onOpenProfile={(actor) => onNavigate(`/users/${actor.id}` as Href)}
          />
        ) : null}
        <Text numberOfLines={4}>
          <Text weight="bold" tone="high">
            {name}
          </Text>
          {others > 0 ? (
            <>
              {' e '}
              <Text weight="bold" tone="high">
                {`mais ${others}`}
              </Text>
            </>
          ) : null}
          {` ${verb}`}
        </Text>
        {excerpt !== null ? (
          <Text size="sm" tone="medium" numberOfLines={2}>
            {excerpt}
          </Text>
        ) : null}
        <Text size="sm" tone="medium">
          {time}
        </Text>
      </View>
      {thumbnail !== null ? (
        <Image
          testID="notification-thumbnail"
          accessibilityIgnoresInvertColors
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingVertical: ROW_PADDING_VERTICAL,
    borderBottomWidth: hairline,
    borderBottomColor: colors.borderLow,
  },
  tinted: { backgroundColor: colors.bgContrast25 },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE },
  /**
   * Reaches over the row's vertical padding (and pads it back), so the avatar stack's 48 dp box can
   * rise above the faces without leaving its parent: Android drops touches outside a parent.
   */
  content: {
    flex: 1,
    gap: space.xs,
    marginVertical: -ROW_PADDING_VERTICAL,
    paddingVertical: ROW_PADDING_VERTICAL,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: radii.sm,
    backgroundColor: colors.bgContrast50,
  },
});
