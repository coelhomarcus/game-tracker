import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmDialog, OptionSheet } from '@/components';
import { useSession } from '@/features/auth';
import type { IoniconName } from '@/features/library/status';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { CountWheel } from '../CountWheel';
import { LikeIcon } from '../LikeIcon';
import { ControlButton, Count } from '../PostControls';
import { displayName, type Comment } from '../types';

const ICON_SIZE = 18;
const TOUCH = 48;

type MoreChoice = 'copy' | 'delete';

export type CommentControlsProps = {
  /** The comment as the parent read it from the cache, so a toggle never works on a stale copy. */
  comment: Comment;
  onReply: (comment: Comment) => void;
  onToggleLike: (comment: Comment) => void;
  /** Runs once the user confirmed deleting their own comment. */
  onDelete: (comment: Comment) => void;
  /**
   * Tree rows: reply and like sit side by side at the left instead of lining up with a post's
   * controls, which a nested row has no room for.
   */
  compact?: boolean;
};

/**
 * The action bar of a comment: reply and like on the left (the like animates as on posts), and
 * "…" on the right with "Copiar texto" and, on the user's own comment, "Apagar comentário".
 */
export function CommentControls({
  comment,
  onReply,
  onToggleLike,
  onDelete,
  compact = false,
}: CommentControlsProps) {
  const isMine = useSession((state) => state.user?.id === comment.author.id);
  const [likeToggled, setLikeToggled] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Most comments never open their menu: the sheet mounts on first use, then stays to animate out.
  const [menuUsed, setMenuUsed] = useState(false);

  const liked = comment.likedByMe;
  const likes = `${comment.likeCount} ${comment.likeCount === 1 ? 'curtida' : 'curtidas'}`;

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(comment.content);
      showToast('Texto copiado');
    } catch {
      showToast('Não foi possível copiar o texto.');
    }
  };

  const options: { value: MoreChoice; label: string; icon: IoniconName }[] = [];
  if (comment.content) options.push({ value: 'copy', label: 'Copiar texto', icon: 'copy-outline' });
  if (isMine) options.push({ value: 'delete', label: 'Apagar comentário', icon: 'trash-outline' });

  return (
    <View testID="comment-controls" style={styles.bar}>
      <View style={compact ? styles.primaryCompact : styles.primary}>
        <View style={compact ? styles.slotCompact : styles.slot}>
          <ControlButton
            label={`Responder a ${displayName(comment.author)}`}
            onPress={() => onReply(comment)}
            style={[styles.slotButton, styles.replyButton]}
          >
            <Ionicons name="chatbubble-outline" size={ICON_SIZE} color={colors.textMedium} />
          </ControlButton>
        </View>
        <View style={compact ? styles.slotCompact : styles.slot}>
          <ControlButton
            testID="comment-like-button"
            label={`${liked ? 'Descurtir' : 'Curtir'} comentário, ${likes}`}
            onPress={() => {
              setLikeToggled(true);
              onToggleLike(comment);
            }}
            style={styles.slotButton}
          >
            <LikeIcon liked={liked} size={ICON_SIZE} hasBeenToggled={likeToggled} />
            <CountWheel
              count={comment.likeCount}
              toggled={liked}
              hasBeenToggled={likeToggled}
              renderCount={(count) => (
                <Count count={count} color={liked ? colors.like : undefined} active={liked} />
              )}
            />
          </ControlButton>
        </View>
      </View>
      <ControlButton
        label="Mais opções do comentário"
        disabled={options.length === 0}
        onPress={() => {
          setMenuUsed(true);
          setSheetOpen(true);
        }}
        style={styles.iconButton}
      >
        <Ionicons name="ellipsis-horizontal" size={ICON_SIZE} color={colors.textMedium} />
      </ControlButton>

      {menuUsed ? (
        <>
          <OptionSheet<MoreChoice>
            visible={sheetOpen}
            title="Opções do comentário"
            options={options}
            onSelect={(choice) => {
              if (choice === 'copy') void copy();
              else setConfirmDelete(true);
            }}
            onClose={() => setSheetOpen(false)}
          />
          <ConfirmDialog
            visible={confirmDelete}
            title="Apagar comentário?"
            message="As respostas a ele também serão apagadas. Isso não pode ser desfeito."
            confirmLabel="Apagar"
            cancelLabel="Cancelar"
            destructive
            onConfirm={() => {
              setConfirmDelete(false);
              onDelete(comment);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // The first two of the post controls' three slots (320 dp), so reply and like line up with a
  // post's comment and repost buttons.
  primary: { flexDirection: 'row', flex: 1, maxWidth: 214 },
  slot: { flex: 1, minWidth: TOUCH, alignItems: 'flex-start' },
  // The 48 dp boxes already keep the icons apart, and a deep row has little room.
  primaryCompact: { flexDirection: 'row', flex: 1 },
  slotCompact: { minWidth: TOUCH, alignItems: 'flex-start' },
  slotButton: { maxWidth: '100%' },
  replyButton: { paddingLeft: 0 },
  iconButton: { justifyContent: 'center', width: TOUCH, paddingHorizontal: 0 },
});
