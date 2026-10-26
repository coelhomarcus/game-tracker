import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Share } from 'react-native';

import { Button, OptionSheet, type OptionSheetOption } from '@/components';
import { showToast } from '@/lib/toast';

type Choice = 'copy' | 'share';

const OPTIONS: OptionSheetOption<Choice>[] = [
  { value: 'copy', label: 'Copiar @usuário', icon: 'copy-outline' },
  { value: 'share', label: 'Compartilhar perfil', icon: 'share-outline' },
];

export type ProfileMenuProps = { username: string };

/** The "…" beside a profile's buttons: copy the handle or share the profile. */
export function ProfileMenu({ username }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const handle = `@${username}`;

  const choose = async (choice: Choice) => {
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
        options={OPTIONS}
        onSelect={(value) => void choose(value)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
