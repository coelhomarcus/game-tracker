import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';

import { ConfirmDialog, OptionSheet, type OptionSheetOption } from '@/components';
import { useSession } from '@/features/auth';
import { useModerationMenu, type ModerationChoice } from '@/features/profiles/moderationMenu';
import type { UserProfile } from '@/features/profiles/types';
import { queryClient } from '@/lib/queryClient';
import { showToast } from '@/lib/toast';

import { useDeletePost } from './queries';
import type { Post } from './types';

type Choice = 'share' | 'copy' | 'delete' | ModerationChoice;

export type PostMoreMenuProps = {
  post: Post;
  visible: boolean;
  /** The window is too narrow for the share button on the bar, so the sheet offers it. */
  narrow: boolean;
  onShare: () => void;
  onClose: () => void;
  /** Runs once the post is deleted or its author blocked, e.g. to leave the post's own page. */
  onDone?: () => void;
};

/**
 * The "…" sheet of a post: share (on narrow windows), copy the text, delete (own posts) and mute
 * or block the author (other people's posts). Mounted on first use, so a feed pays for it only
 * on the rows whose menu opens.
 */
export function PostMoreMenu({ post, visible, narrow, onShare, onClose, onDone }: PostMoreMenuProps) {
  const isMine = useSession((state) => state.user?.id === post.author.id);
  const deletePost = useDeletePost();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A profile in the cache knows whether the author is already muted or blocked; without one the
  // sheet offers the plain actions.
  const profile = queryClient.getQueryData<UserProfile>(['profile', post.author.id]);
  const moderation = useModerationMenu(
    post.author,
    { muted: profile?.isMutedByMe, blocked: profile?.isBlockedByMe },
    onDone,
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(post.content);
      showToast('Texto copiado');
    } catch {
      showToast('Não foi possível copiar o texto.');
    }
  };

  const options: OptionSheetOption<Choice>[] = [];
  if (narrow) options.push({ value: 'share', label: 'Compartilhar', icon: 'share-outline' });
  if (post.content) options.push({ value: 'copy', label: 'Copiar texto', icon: 'copy-outline' });
  if (isMine) options.push({ value: 'delete', label: 'Apagar post', icon: 'trash-outline' });
  else options.push(...moderation.options);

  return (
    <>
      <OptionSheet<Choice>
        visible={visible}
        title="Opções do post"
        options={options}
        onSelect={(choice) => {
          if (choice === 'share') onShare();
          else if (choice === 'copy') void copy();
          else if (choice === 'delete') setConfirmDelete(true);
          else moderation.select(choice);
        }}
        onClose={onClose}
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
          deletePost.mutate(post, { onSuccess: () => onDone?.() });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
      {isMine ? null : moderation.dialog}
    </>
  );
}
