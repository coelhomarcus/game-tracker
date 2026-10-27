import { useState, type ReactElement } from 'react';

import { ConfirmDialog, type OptionSheetOption } from '@/components';
import type { UserSummary } from '@/features/games/types';
import { showToast } from '@/lib/toast';

import { useSetModeration } from './queries';

export type ModerationChoice = 'mute' | 'block';

export type ModerationState = { muted?: boolean; blocked?: boolean };

export type ModerationMenu = {
  /** "Silenciar @x" and "Bloquear @x", or their undo, for the sheet that lists them. */
  options: OptionSheetOption<ModerationChoice>[];
  /** Runs the choice: a mute or an unblock at once, a block after the confirmation. */
  select: (choice: ModerationChoice) => void;
  /** The block confirmation; render it next to the sheet. */
  dialog: ReactElement;
};

/**
 * Mute and block for a person, shared by the profile's and the posts' "…" menus. Both are
 * optimistic (see `useSetModeration`); a block asks first.
 */
export function useModerationMenu(
  person: UserSummary,
  { muted = false, blocked = false }: ModerationState = {},
  /** Runs once a block is confirmed, e.g. to leave a page that shows the person's post. */
  onBlocked?: () => void,
): ModerationMenu {
  const mute = useSetModeration('mutes');
  const block = useSetModeration('blocks');
  const [confirming, setConfirming] = useState(false);
  const handle = `@${person.username}`;

  const options: OptionSheetOption<ModerationChoice>[] = [
    {
      value: 'mute',
      label: muted ? `Reativar ${handle}` : `Silenciar ${handle}`,
      icon: muted ? 'volume-high-outline' : 'volume-mute-outline',
    },
    {
      value: 'block',
      label: blocked ? `Desbloquear ${handle}` : `Bloquear ${handle}`,
      icon: blocked ? 'checkmark-circle-outline' : 'ban-outline',
      destructive: !blocked,
    },
  ];

  const select = (choice: ModerationChoice) => {
    if (choice === 'mute') {
      mute.mutate({ person, on: !muted });
      showToast(muted ? `${handle} reativado` : `${handle} silenciado`);
    } else if (blocked) {
      block.mutate({ person, on: false });
      showToast(`${handle} desbloqueado`);
    } else {
      setConfirming(true);
    }
  };

  const dialog = (
    <ConfirmDialog
      visible={confirming}
      title={`Bloquear ${handle}?`}
      message={`Vocês não verão os posts um do outro e ${handle} não poderá te seguir nem mandar mensagem.`}
      confirmLabel="Bloquear"
      cancelLabel="Cancelar"
      destructive
      onConfirm={() => {
        setConfirming(false);
        block.mutate({ person, on: true });
        showToast(`${handle} bloqueado`);
        onBlocked?.();
      }}
      onCancel={() => setConfirming(false)}
    />
  );

  return { options, select, dialog };
}
