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
import { PostControls } from './PostControls';
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
/**
 * The avatar and the meta line start 9 dp below the row's top edge without a reason line, and
 * 3 dp below the reason line with one, as in the design reference. The avatar's touch box starts
 * 3 dp above the avatar, so the row pads by that much less.
 */
const TOP_WITHOUT_REASON = space.sm + 1 - AVATAR_OVERHANG;

export type PostFeedItemProps = {
  post: Post;
  /**
   * Opens the post from anywhere on the row outside its own links and buttons. Without it the
   * row is plain, e.g. on the post's own page.
   */
  onPress?: () => void;
  /** Runs once the user deleted the post from its controls. */
  onDeleted?: () => void;
  /** Hides the game card, for lists already scoped to one game. */
  hideGame?: boolean;
  /** The first row of a list sits under a header that already draws a line. */
  hideTopBorder?: boolean;
};

/**
 * The row's one summary for screen readers: author, time and text (and the status of an
 * activity). A post without text says how many images it has instead.
 */
function bodyLabel(post: Post, name: string, time: string): string {
  if (post.type !== 'activity') {
    if (post.content) return `Post de ${name}, ${time}: ${post.content}`;
    const count = post.images.length;
    if (count === 0) return `Post de ${name}, ${time}`;
    return `Post de ${name}, ${time}, ${count} ${count === 1 ? 'imagem' : 'imagens'}`;
  }
  const status = post.activityStatus ? statusLabel[post.activityStatus] : null;
  return [`${name} ${post.content}`, status, time].filter(Boolean).join(', ');
}

/**
 * A post as a full-width feed row: avatar column, meta line, text clamped to 25 lines, embeds
 * (images, quoted post, game) and the controls. A tap anywhere on the row that no link or
 * button inside takes opens the post. For screen readers the row itself is not a stop: the body
 * carries the one summary of the post, and every link and button stays reachable on its own.
 */
export function PostFeedItem({
  post,
  onPress,
  onDeleted,
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
  const summary = bodyLabel(post, name, time);
  // The body holds the text and an activity's status; without either it has nothing to show.
  const hasBody = post.content !== '' || status !== null;

  return (
    <Pressable
      testID="post-feed-item"
      accessible={false}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.outer,
        !hideTopBorder && styles.topBorder,
        !post.reason && styles.topWithoutReason,
      ]}
    >
      {post.reason ? (
        <View testID="post-reason" style={styles.reason}>
          <ProfileLink
            user={post.reason.by}
            hitSlop={undefined}
            accessibilityLabel={`Repostado por ${displayName(post.reason.by)}`}
            style={styles.reasonLink}
          >
            <Ionicons name="repeat" size={13} color={colors.textMedium} />
            <Text
              numberOfLines={1}
              size="sm"
              weight="medium"
              tone="medium"
              style={styles.shrink}
            >
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
        <View testID="post-content" style={styles.content}>
          {hasBody ? (
            <PostMeta author={post.author} createdAt={post.createdAt} />
          ) : (
            <View>
              <PostMeta author={post.author} createdAt={post.createdAt} />
              {/*
               * Without text the body would have no area, and TalkBack skips what has none: the
               * summary lies over the meta line instead. Touches pass through to the name link.
               */}
              <View
                testID="post-summary"
                accessible
                pointerEvents="none"
                accessibilityRole={onPress ? 'button' : undefined}
                accessibilityLabel={summary}
                accessibilityActions={onPress ? [{ name: 'activate' }] : undefined}
                onAccessibilityAction={
                  onPress
                    ? (event) => {
                        if (event.nativeEvent.actionName === 'activate') onPress();
                      }
                    : undefined
                }
                style={StyleSheet.absoluteFill}
              />
            </View>
          )}
          {hasBody ? (
            <Pressable
              accessibilityRole={onPress ? 'button' : undefined}
              accessibilityLabel={summary}
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
          ) : null}
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
          <PostControls post={post} onReply={onPress} onDeleted={onDeleted} />
        </View>
      </View>
    </Pressable>
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
    <View
      testID={testID}
      style={[
        styles.outer,
        styles.skeletonBottom,
        !hideTopBorder && styles.topBorder,
        styles.topWithoutReason,
      ]}
    >
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
  // No bottom padding: the controls' 48 dp touch boxes already leave the reference's space
  // under their icons.
  outer: { paddingLeft: 10, paddingRight: 15 },
  topBorder: { borderTopWidth: hairline, borderTopColor: colors.borderLow },
  topWithoutReason: { paddingTop: TOP_WITHOUT_REASON },
  // Aligned with the text column, past the avatar.
  reason: { paddingTop: space.sm, paddingLeft: TEXT_COLUMN_START, flexDirection: 'row' },
  // An inline text link, as in the design reference; the row and the avatar are the large targets.
  reasonLink: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1 },
  shrink: { flexShrink: 1 },
  layout: { flexDirection: 'row' },
  avatarColumn: { paddingLeft: AVATAR_COLUMN_LEFT, paddingRight: AVATAR_COLUMN_RIGHT },
  // 48 dp of touch around the 42 dp avatar, inside the column's padding (so within its bounds).
  avatarLink: {
    width: AVATAR_BOX,
    height: AVATAR_BOX,
    marginHorizontal: -AVATAR_OVERHANG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Starts level with the avatar inside its touch box.
  content: { flex: 1, paddingTop: AVATAR_OVERHANG },
  body: { gap: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  showMore: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center' },
  embeds: { marginTop: space.sm, gap: space.sm },
  skeletonBottom: { paddingBottom: space.sm },
  skeletonMeta: { paddingBottom: space.xs },
});
