import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ConfirmDialog, OptionSheet, Text } from '@/components';
import { useSession } from '@/features/auth';
import type { IoniconName } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { colors, space } from '@/theme/tokens';

import { CountWheel } from './CountWheel';
import { formatCount } from './formatCount';
import { LikeIcon } from './LikeIcon';
import {
  useDeletePost,
  useTogglePostBookmark,
  useTogglePostLike,
  useTogglePostRepost,
} from './queries';
import { displayName, type Post } from './types';

const ICON_SIZE = 18;
/** The icons of the big variant, under the post on its own page. */
const BIG_ICON_SIZE = 22;
/** A real 48 dp touch box: Android ignores hit slop beyond the parent's bounds. */
const TOUCH = 48;
/**
 * Below this window width three 48 dp buttons on the right would leave the left slots under
 * 48 dp, so "Compartilhar" moves into the "…" sheet.
 */
export const NARROW_WINDOW = 380;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Where the composer opens to quote `post`. */
export function quoteHref(post: Pick<Post, 'id'>): Href {
  return `/posts/new?quote=${post.id}` as Href;
}

type RepostChoice = 'repost' | 'quote' | 'cancel';
type MoreChoice = 'share' | 'copy' | 'delete';

export type PostControlsProps = {
  /** The post as the parent read it from the cache, so a toggle never works on a stale copy. */
  post: Post;
  /** Opens the post to comment. Without it the comment counter is plain, e.g. on the post's own page. */
  onReply?: () => void;
  /** Runs once the post is deleted, e.g. to leave the post's own page. */
  onDeleted?: () => void;
  /** Larger icons and counts, for the post on its own page. */
  big?: boolean;
};

/**
 * The action bar of a post: comment, repost (or quote), like on the left; save, share and more on
 * the right. Toggles are optimistic in every cached copy of the post.
 */
export function PostControls({ post, onReply, onDeleted, big = false }: PostControlsProps) {
  const iconSize = big ? BIG_ICON_SIZE : ICON_SIZE;
  const countSize = big ? 'md' : 'sm';
  const router = useRouter();
  const narrow = useWindowDimensions().width < NARROW_WINDOW;
  const isMine = useSession((state) => state.user?.id === post.author.id);
  const toggleLike = useTogglePostLike();
  const toggleRepost = useTogglePostRepost();
  const toggleBookmark = useTogglePostBookmark();
  const deletePost = useDeletePost();
  const [likeToggled, setLikeToggled] = useState(false);
  const [sheet, setSheet] = useState<'repost' | 'more' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A feed has many rows and most never open a menu: the sheets mount on first use, then stay
  // so they can animate out.
  const [menusUsed, setMenusUsed] = useState(false);
  const openSheet = (which: 'repost' | 'more') => {
    setMenusUsed(true);
    setSheet(which);
  };

  const liked = post.likedByMe;
  const reposted = post.repostedByMe;
  const bookmarked = post.bookmarkedByMe;
  // Quotes are reposts with a comment: the counter counts both.
  const repostCount = post.repostCount + post.quoteCount;

  const comments = plural(post.commentCount, 'comentário', 'comentários');
  const likes = plural(post.likeCount, 'curtida', 'curtidas');
  const reposts = plural(repostCount, 'repost', 'reposts');

  const quote = () => router.push(quoteHref(post));

  const share = async () => {
    const name = displayName(post.author);
    try {
      await Share.share({ message: post.content ? `${name}: ${post.content}` : name });
    } catch {
      // Dismissing or failing to open the share sheet needs no message.
    }
  };

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(post.content);
      showToast('Texto copiado');
    } catch {
      showToast('Não foi possível copiar o texto.');
    }
  };

  const moreOptions: { value: MoreChoice; label: string; icon: IoniconName }[] = [];
  if (narrow) moreOptions.push({ value: 'share', label: 'Compartilhar', icon: 'share-outline' });
  if (post.content) moreOptions.push({ value: 'copy', label: 'Copiar texto', icon: 'copy-outline' });
  if (isMine) moreOptions.push({ value: 'delete', label: 'Apagar post', icon: 'trash-outline' });

  return (
    <View testID="post-controls" style={[styles.bar, big && styles.bigBar]}>
      <View style={styles.primary}>
        <View style={styles.slot}>
          {onReply ? (
            <ControlButton
              label={`Comentar, ${comments}`}
              onPress={onReply}
              style={[styles.slotButton, styles.replyButton, big && styles.bigReplyButton]}
            >
              <Ionicons name="chatbubble-outline" size={iconSize} color={colors.textMedium} />
              <Count count={post.commentCount} size={countSize} />
            </ControlButton>
          ) : (
            <View
              accessible
              accessibilityLabel={comments}
              style={[
                styles.button,
                styles.slotButton,
                styles.replyButton,
                big && styles.bigReplyButton,
              ]}
            >
              <Ionicons name="chatbubble-outline" size={iconSize} color={colors.textMedium} />
              <Count count={post.commentCount} size={countSize} />
            </View>
          )}
        </View>
        <View style={styles.slot}>
          <ControlButton
            testID="repost-button"
            label={`${reposted ? 'Desfazer repost' : 'Repostar'}, ${reposts}`}
            onPress={() => openSheet('repost')}
            onLongPress={quote}
            style={styles.slotButton}
          >
            <Ionicons
              name="repeat"
              size={iconSize}
              color={reposted ? colors.repost : colors.textMedium}
            />
            <Count
              count={repostCount}
              size={countSize}
              color={reposted ? colors.repost : undefined}
              active={reposted}
            />
          </ControlButton>
        </View>
        <View style={styles.slot}>
          <ControlButton
            testID="like-button"
            label={`${liked ? 'Descurtir' : 'Curtir'} post, ${likes}`}
            onPress={() => {
              setLikeToggled(true);
              toggleLike.mutate(post);
            }}
            style={styles.slotButton}
          >
            <LikeIcon liked={liked} size={iconSize} hasBeenToggled={likeToggled} />
            <CountWheel
              count={post.likeCount}
              toggled={liked}
              hasBeenToggled={likeToggled}
              renderCount={(count) => (
                <Count
                  count={count}
                  size={countSize}
                  color={liked ? colors.like : undefined}
                  active={liked}
                />
              )}
            />
          </ControlButton>
        </View>
      </View>
      <View style={styles.secondary}>
        <ControlButton
          label={bookmarked ? 'Remover dos salvos' : 'Salvar post'}
          onPress={() => {
            showToast(bookmarked ? 'Removido dos salvos' : 'Salvo');
            toggleBookmark.mutate(post);
          }}
          style={styles.iconButton}
        >
          <Ionicons
            name={bookmarked ? 'bookmark' : 'bookmark-outline'}
            size={iconSize}
            color={bookmarked ? colors.primary : colors.textMedium}
          />
        </ControlButton>
        {narrow ? null : (
          <ControlButton label="Compartilhar" onPress={() => void share()} style={styles.iconButton}>
            <Ionicons name="share-outline" size={iconSize} color={colors.textMedium} />
          </ControlButton>
        )}
        <ControlButton
          label="Mais opções"
          disabled={moreOptions.length === 0}
          onPress={() => openSheet('more')}
          style={styles.iconButton}
        >
          <Ionicons name="ellipsis-horizontal" size={iconSize} color={colors.textMedium} />
        </ControlButton>
      </View>

      {menusUsed ? (
        <>
          <OptionSheet<RepostChoice>
            visible={sheet === 'repost'}
            title={reposted ? 'Desfazer repost ou citar' : 'Repostar ou citar'}
            options={[
              {
                value: 'repost',
                label: reposted ? 'Desfazer repost' : 'Repostar',
                icon: 'repeat',
              },
              { value: 'quote', label: 'Citar', icon: 'chatbox-ellipses-outline' },
              { value: 'cancel', label: 'Cancelar', icon: 'close' },
            ]}
            onSelect={(choice) => {
              if (choice === 'repost') {
                if (!reposted) haptic('confirm');
                toggleRepost.mutate(post);
              } else if (choice === 'quote') {
                haptic('confirm');
                quote();
              }
            }}
            onClose={() => setSheet(null)}
          />
          <OptionSheet<MoreChoice>
            visible={sheet === 'more'}
            title="Opções do post"
            options={moreOptions}
            onSelect={(choice) => {
              if (choice === 'share') void share();
              else if (choice === 'copy') void copy();
              else setConfirmDelete(true);
            }}
            onClose={() => setSheet(null)}
          />
          <ConfirmDialog
            visible={confirmDelete}
            title="Apagar post?"
            message="Isso não pode ser desfeito."
            confirmLabel="Apagar"
            cancelLabel="Cancelar"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              deletePost.mutate(post, { onSuccess: () => onDeleted?.() });
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      ) : null}
    </View>
  );
}

export type ControlButtonProps = {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
};

/** One control: a 48 dp tall touch box with a light tap haptic (a heavier one on long press). */
export function ControlButton({
  label,
  onPress,
  onLongPress,
  disabled = false,
  style,
  testID,
  children,
}: ControlButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      onLongPress={
        onLongPress
          ? () => {
              haptic('longPress');
              onLongPress();
            }
          : undefined
      }
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

export type CountProps = {
  count: number;
  color?: string;
  active?: boolean;
  size?: 'sm' | 'md';
};

/** The counter beside an icon: hidden at 0, compact, semibold while the control is active. */
export function Count({ count, color, active = false, size = 'sm' }: CountProps) {
  if (count <= 0) return null;
  return (
    <Text
      size={size}
      tone="medium"
      weight={active ? 'semibold' : 'normal'}
      numberOfLines={1}
      style={[styles.count, color ? { color } : null]}
    >
      {formatCount(count)}
    </Text>
  );
}

const styles = StyleSheet.create({
  // No gap: `space-between` already parts the groups, and narrow screens need every dp.
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space._2xs,
  },
  primary: { flexDirection: 'row', flex: 1, maxWidth: 320 },
  slot: { flex: 1, minWidth: TOUCH, alignItems: 'flex-start' },
  // A long count is cut inside its slot instead of running under the next icon.
  slotButton: { maxWidth: '100%' },
  // The design reference pulls the comment button 6 dp left so its icon lines up with the text;
  // here the button drops its left padding instead, which keeps the touch box inside the column.
  replyButton: { paddingLeft: 0 },
  // Big, the design reference pulls the bar 5 dp left and the comment button 2 dp: the page pulls
  // the bar, and the button keeps 3 dp of its padding so its icon lands where the reference's does.
  bigReplyButton: { paddingLeft: 3 },
  bigBar: { paddingTop: 0 },
  secondary: { flexDirection: 'row', justifyContent: 'flex-end' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: TOUCH,
    minWidth: TOUCH,
    paddingHorizontal: 5,
  },
  iconButton: { justifyContent: 'center', width: TOUCH, paddingHorizontal: 0 },
  pressed: { opacity: 0.6 },
  count: { flexShrink: 1, includeFontPadding: false, textAlignVertical: 'center' },
});
