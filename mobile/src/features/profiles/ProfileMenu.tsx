import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share } from 'react-native';

import { Button, OptionSheet, type OptionSheetOption } from '@/components';
import { showToast } from '@/lib/toast';

import { useModerationMenu, type ModerationChoice } from './moderationMenu';
import type { UserProfile } from './types';

type Choice = 'copy' | 'share' | ModerationChoice;

const OPTIONS: OptionSheetOption<Choice>[] = [
  { value: 'copy', label: 'Copiar @usuário', icon: 'copy-outline' },
  { value: 'share', label: 'Compartilhar perfil', icon: 'share-outline' },
];

export type ProfileMenuProps = {
  profile: Pick<UserProfile, 'id' | 'username' | 'name' | 'avatarUrl' | 'isMutedByMe' | 'isBlockedByMe'>;
  /** The own profile: nobody to mute or block. */
  own?: boolean;
};

/**
 * The "…" beside a profile's buttons: copy the handle, share the profile and, on somebody
 * else's, mute and block them.
 */
export function ProfileMenu({ profile, own = false }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const { id, username, name, avatarUrl } = profile;
  const handle = `@${username}`;
  const moderation = useModerationMenu(
    { id, username, name, avatarUrl },
    { muted: profile.isMutedByMe, blocked: profile.isBlockedByMe },
  );
  const options: OptionSheetOption<Choice>[] = own ? OPTIONS : [...OPTIONS, ...moderation.options];

  const choose = async (choice: Choice) => {
    if (choice === 'mute' || choice === 'block') {
      moderation.select(choice);
      return;
    }
    if (choice === 'copy') {
      try {
        await Clipboard.setStringAsync(handle);
        showToast(`${handle} copiado`);
      } catch {
        showToast('Não foi possível copiar.');
      }
      return;
    }
    try {
      await Share.share({ message: `${handle} no GameTracker` });
    } catch {
      // Dismissing or failing to open the share sheet needs no message.
    }
  };

  return (
    <>
      <Button
        icon="ellipsis-horizontal"
        shape="round"
        size="small"
        color="secondary"
        accessibilityLabel="Mais opções do perfil"
        onPress={() => setOpen(true)}
      />
      <OptionSheet<Choice>
        visible={open}
        title="Opções do perfil"
        options={options}
        onSelect={(value) => void choose(value)}
        onClose={() => setOpen(false)}
      />
      {own ? null : moderation.dialog}
    </>
  );
}
