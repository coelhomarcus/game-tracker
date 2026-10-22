import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type TextLayoutEvent } from 'react-native';

import { Avatar, Skeleton, StatusIcon, Text } from '@/components';
import { statusLabel } from '@/features/library/status';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, space } from '@/theme/tokens';

import { GameEmbed } from './embeds/GameEmbed';
import { ImageGrid } from './embeds/ImageGrid';
import { QuotedPost, RemovedQuote } from './embeds/QuotedPost';
import { PostActions } from './PostActions';
import { PostMeta } from './PostMeta';
import { displayName, type Post } from './types';

/** Lines of text shown before "Mostrar mais". */
export const MAX_POST_LINES = 25;
const AVATAR_SIZE = 42;
/** The real touch box around the 42 dp avatar. */
const AVATAR_BOX = 48;
const AVATAR_OVERHANG = (AVATAR_BOX - AVATAR_SIZE) / 2;
const AVATAR_COLUMN_LEFT = space.sm;
const AVATAR_COLUMN_RIGHT = 10;
/** Where the text column starts inside the row's padding (70 dp from the screen edge). */
const TEXT_COLUMN_START = AVATAR_COLUMN_LEFT + AVATAR_SIZE + AVATAR_COLUMN_RIGHT;

export type PostFeedItemProps = {
  post: Post;
  /** Opens the post. Without it the body is plain, e.g. on the post's own page. */
  onPress?: () => void;
  /** Hides the game card, for lists already scoped to one game. */
  hideGame?: boolean;
  /** The first row of a list sits under a header that already draws a line. */
  hideTopBorder?: boolean;
};

/** One line per accessibility stop: author, time and text (and the status of an activity). */
function bodyLabel(post: Post, name: string, time: string): string {
  if (post.type !== 'activity') return `Post de ${name}, ${time}: ${post.content}`;
  const status = post.activityStatus ? statusLabel[post.activityStatus] : null;
  return [`${name} ${post.content}`, status, time].filter(Boolean).join(', ');
}

/**
 * A post as a full-width feed row: avatar column, meta line, text clamped to 25 lines, embeds
 * (images, quoted post, game) and the actions. Every link is a sibling of the pressable body,
 * never inside it, so each stays reachable and none of them also opens the post.
 */
export function PostFeedItem({
  post,
  onPress,
  hideGame = false,
  hideTopBorder = false,
}: PostFeedItemProps) {
  const name = displayName(post.author);
  const time = formatRelativeTime(post.createdAt);
  const status = post.type === 'activity' ? post.activityStatus : null;
  const game = hideGame ? null : post.game;
  const hasEmbeds =
    post.images.length > 0 || post.quotedPost !== null || post.quotedPostRemoved || game !== null;
  const clamp = useTextClamp();

  return (
    <View testID="post-feed-item" style={[styles.outer, !hideTopBorder && styles.topBorder]}>
      {post.reason ? (
        <View style={styles.reason}>
          <ProfileLink
            user={post.reason.by}
            hitSlop={undefined}
            accessibilityLabel={`Repostado por ${displayName(post.reason.by)}`}
            style={styles.reasonLink}
          >
            <Ionicons name="repeat" size={13} color={colors.textMedium} />
            <Text numberOfLines={1} size="sm" weight="medium" tone="medium" style={styles.shrink}>
              {`Repostado por ${displayName(post.reason.by)}`}
            </Text>
          </ProfileLink>
        </View>
      ) : null}
      <View style={styles.layout}>
        <View style={styles.avatarColumn}>
          <ProfileLink
            user={post.author}
            hitSlop={undefined}
            touchOnly
            testID="author-avatar-link"
            style={styles.avatarLink}
          >
            <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
          </ProfileLink>
        </View>
        <View style={styles.content}>
          <PostMeta author={post.author} createdAt={post.createdAt} />
          <Pressable
            accessibilityRole={onPress ? 'button' : undefined}
            accessibilityLabel={bodyLabel(post, name, time)}
            onPress={onPress}
            style={styles.body}
          >
            {post.content ? (
              <Text
                testID="post-text"
                numberOfLines={clamp.numberOfLines}
                onTextLayout={clamp.onTextLayout}
              >
                {post.content}
              </Text>
            ) : null}
            {status ? (
              <View testID="activity-status" style={styles.status}>
                <StatusIcon status={status} />
                <Text size="sm" style={{ color: colors.status[status] }}>
                  {statusLabel[status]}
                </Text>
              </View>
            ) : null}
          </Pressable>
          {clamp.canExpand ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mostrar mais"
              onPress={clamp.expand}
              style={styles.showMore}
            >
              <Text size="sm" weight="medium" tone="primary">
                Mostrar mais
              </Text>
            </Pressable>
          ) : null}
          {hasEmbeds ? (
            <View style={styles.embeds}>
              {post.images.length > 0 ? <ImageGrid images={post.images} /> : null}
              {post.quotedPost ? <QuotedPost post={post.quotedPost} /> : null}
              {post.quotedPost === null && post.quotedPostRemoved ? <RemovedQuote /> : null}
              {game ? <GameEmbed game={game} platform={post.entry?.platform} /> : null}
            </View>
          ) : null}
          <PostActions post={post} onComment={onPress} />
        </View>
      </View>
    </View>
  );
}

/**
 * Clamps the post text to 25 lines. The text is laid out with one line more first: a 26th line
 * means it is longer, and only then "Mostrar mais" appears (Android reports no more lines than
 * it draws, so the clamp itself could not tell).
 */
function useTextClamp() {
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const onTextLayout = (event: TextLayoutEvent) => {
    if (!truncated && event.nativeEvent.lines.length > MAX_POST_LINES) setTruncated(true);
  };

  let numberOfLines: number | undefined;
  if (!expanded) numberOfLines = truncated ? MAX_POST_LINES : MAX_POST_LINES + 1;

  return {
    numberOfLines,
    onTextLayout,
    canExpand: truncated && !expanded,
    expand: () => setExpanded(true),
  };
}

export type PostFeedItemSkeletonProps = {
  hideTopBorder?: boolean;
  testID?: string;
};

/** A loading row in the geometry of `PostFeedItem`. */
export function PostFeedItemSkeleton({ hideTopBorder = false, testID }: PostFeedItemSkeletonProps) {
  return (
    <View testID={testID} style={[styles.outer, !hideTopBorder && styles.topBorder]}>
      <View style={styles.layout}>
        <View style={styles.avatarColumn}>
          <View style={styles.avatarLink}>
            <Skeleton.Circle size={AVATAR_SIZE} testID="post-skeleton-avatar" />
          </View>
        </View>
        <View style={styles.content}>
          <View style={styles.skeletonMeta}>
            <Skeleton.Text width="45%" />
          </View>
          <Skeleton.Text />
          <Skeleton.Text width="70%" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingLeft: 10, paddingRight: 15, paddingBottom: space.sm },
  topBorder: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  // Aligned with the text column, past the avatar.
  reason: { paddingLeft: TEXT_COLUMN_START, flexDirection: 'row' },
  // A real 48 dp tall touch target; Android ignores hit slop beyond the parent's bounds.
  reasonLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 48,
    flexShrink: 1,
  },
  shrink: { flexShrink: 1 },
  layout: { flexDirection: 'row' },
  avatarColumn: { paddingLeft: AVATAR_COLUMN_LEFT, paddingRight: AVATAR_COLUMN_RIGHT },
  // 48 dp of touch around the 42 dp avatar, inside the column's padding (so within its bounds);
  // centered on the 48 dp meta line beside it.
  avatarLink: {
    width: AVATAR_BOX,
    height: AVATAR_BOX,
    marginHorizontal: -AVATAR_OVERHANG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  body: { gap: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  showMore: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  embeds: { marginTop: space.sm, gap: space.sm },
  skeletonMeta: { minHeight: 48, justifyContent: 'center' },
});
