import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, StatusIcon, Text } from '@/components';
import { useSession } from '@/features/auth';
import { statusLabel } from '@/features/library/status';
import { FollowButton } from '@/features/profiles/FollowButton';
import { ProfileLink } from '@/features/profiles/ProfileLink';
import { useProfile } from '@/features/profiles/queries';
import { resolveImageUrl } from '@/lib/imageUrl';
import { formatFullDate, formatRelativeTime } from '@/lib/relativeTime';
import { colors, hairline, space } from '@/theme/tokens';

import { GameEmbed } from '../embeds/GameEmbed';
import { ImageGrid } from '../embeds/ImageGrid';
import { QuotedPost, RemovedQuote } from '../embeds/QuotedPost';
import { formatCount } from '../formatCount';
import { PostControls } from '../PostControls';
import { postSummaryLabel } from '../PostFeedItem';
import { displayName, type Post } from '../types';

const AVATAR_SIZE = 42;
/** The real touch box around the avatar: Android ignores hit slop beyond the parent's bounds. */
const AVATAR_BOX = 48;
const OVERHANG = (AVATAR_BOX - AVATAR_SIZE) / 2;
const OUTER_SPACE = space.lg;

export type ThreadAnchorProps = {
  /** The post as the page read it from the cache. */
  post: Post;
  /** The comment counter's action: write a comment on the post. Without it the counter is plain. */
  onReply?: () => void;
  /** Runs once the user deleted the post from its controls. */
  onDeleted?: () => void;
};

/**
 * The post a thread is about, as the design reference shows it on its own page: the author with a
 * follow button, the text in a larger size, the embeds, the full date, the counters spelled out
 * and the big controls.
 */
export function ThreadAnchor({ post, onReply, onDeleted }: ThreadAnchorProps) {
  const name = displayName(post.author);
  const status = post.type === 'activity' ? post.activityStatus : null;
  const hasBody = post.content !== '' || status !== null;
  const summary = postSummaryLabel(post, name, formatRelativeTime(post.createdAt));
  const hasEmbeds =
    post.images.length > 0 ||
    post.quotedPost !== null ||
    post.quotedPostRemoved ||
    post.game !== null;
  const date = formatFullDate(post.createdAt);

  return (
    <View testID="thread-anchor" style={styles.outer}>
      <View style={styles.header}>
        <ProfileLink
          user={post.author}
          hitSlop={undefined}
          touchOnly
          testID="author-avatar-link"
          style={styles.avatarLink}
        >
          <Avatar uri={resolveImageUrl(post.author.avatarUrl)} name={name} size={AVATAR_SIZE} />
        </ProfileLink>
        <ProfileLink user={post.author} hitSlop={undefined} style={styles.who}>
          <Text numberOfLines={1} size="lg" weight="semibold" tone="high">
            {name}
          </Text>
          <Text numberOfLines={1} tone="medium">
            {`@${post.author.username}`}
          </Text>
        </ProfileLink>
        <AnchorFollowButton authorId={post.author.id} name={name} />
      </View>

      <View style={styles.main}>
        {hasBody ? (
          <View accessible accessibilityLabel={summary} style={styles.body}>
            {post.content ? (
              <Text testID="anchor-text" size="lg" selectable>
                {post.content}
              </Text>
            ) : null}
            {status ? (
              <View testID="activity-status" style={styles.status}>
                <StatusIcon status={status} />
                <Text style={{ color: colors.status[status] }}>{statusLabel[status]}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {hasEmbeds ? (
          <View style={[styles.embeds, hasBody && styles.embedsAfterText]}>
            {post.images.length > 0 ? <ImageGrid images={post.images} /> : null}
            {post.quotedPost ? <QuotedPost post={post.quotedPost} /> : null}
            {post.quotedPost === null && post.quotedPostRemoved ? <RemovedQuote /> : null}
            {post.game ? <GameEmbed game={post.game} platform={post.entry?.platform} /> : null}
          </View>
        ) : null}
        {/* A post without text says who wrote it and when here instead. */}
        <View
          accessible={!hasBody}
          accessibilityLabel={hasBody ? undefined : `${summary}, ${date}`}
          style={styles.date}
        >
          <Text testID="anchor-date" size="sm" tone="medium">
            {date}
          </Text>
        </View>
        <AnchorStats post={post} />
        <View style={styles.controls}>
          <PostControls big post={post} onReply={onReply} onDeleted={onDeleted} />
        </View>
      </View>
    </View>
  );
}

/**
 * The design reference shows the follow button only to someone not yet following the author when
 * the page opened; once shown it stays, so a follow can be undone right there.
 */
function AnchorFollowButton({ authorId, name }: { authorId: string; name: string }) {
  const isMe = useSession((state) => state.user?.id === authorId);
  const profile = useProfile(isMe ? undefined : authorId);
  const following = profile.data?.isFollowedByMe;
  const [followingAtOpen, setFollowingAtOpen] = useState<boolean | undefined>(undefined);
  if (followingAtOpen === undefined && following !== undefined) setFollowingAtOpen(following);

  if (isMe || following === undefined || followingAtOpen !== false) return null;
  return (
    <View style={styles.follow}>
      <FollowButton userId={authorId} following={following} name={name} size="small" />
    </View>
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** The counters spelled out ("12 curtidas"), each hidden at 0, the row too when all are. */
function AnchorStats({ post }: { post: Post }) {
  const stats = [
    { key: 'reposts', count: post.repostCount, word: plural(post.repostCount, 'repost', 'reposts') },
    { key: 'quotes', count: post.quoteCount, word: plural(post.quoteCount, 'citação', 'citações') },
    { key: 'likes', count: post.likeCount, word: plural(post.likeCount, 'curtida', 'curtidas') },
    { key: 'saves', count: post.bookmarkCount, word: plural(post.bookmarkCount, 'salvo', 'salvos') },
  ].filter((stat) => stat.count > 0);
  if (stats.length === 0) return null;

  return (
    <View testID="anchor-stats" style={styles.stats}>
      {stats.map((stat) => (
        <Text key={stat.key} testID={`anchor-stat-${stat.key}`} tone="medium">
          <Text weight="bold">{formatCount(stat.count)}</Text>
          {` ${stat.word}`}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: OUTER_SPACE, paddingTop: OUTER_SPACE },
  // Starts 3 dp up and left so the avatar's 48 dp touch box lies inside the row, in the page's
  // padding; the gap and the bottom padding give those 3 dp back.
  header: {
    flexDirection: 'row',
    gap: space.md - OVERHANG,
    marginLeft: -OVERHANG,
    marginTop: -OVERHANG,
    paddingBottom: space.md - OVERHANG,
  },
  avatarLink: {
    width: AVATAR_BOX,
    height: AVATAR_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  who: { flex: 1, alignItems: 'flex-start', paddingTop: OVERHANG },
  // A 48 dp tall box: the small button's hit slop only counts inside it.
  follow: { alignSelf: 'center', minHeight: AVATAR_BOX, justifyContent: 'center' },
  main: { paddingBottom: space.sm },
  body: { gap: space.sm },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  embeds: { gap: space.sm },
  embedsAfterText: { paddingVertical: space.xs },
  date: { paddingTop: space.md, alignItems: 'flex-start' },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: space.sm,
    columnGap: space.lg,
    borderTopWidth: hairline,
    borderTopColor: colors.borderLow,
    marginTop: space.md,
    paddingVertical: space.sm,
  },
  // The design reference pulls the big controls 5 dp left, into the page's padding.
  controls: { marginLeft: -5, paddingBottom: space._2xs },
});
