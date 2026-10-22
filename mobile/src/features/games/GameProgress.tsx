import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ConfirmDialog, EmptyState, OptionSheet } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { EntryCard } from '@/features/library/EntryCard';
import { useDeleteEntry, useUpdateEntry } from '@/features/library/queries';
import { STATUSES, statusIcon, statusLabel } from '@/features/library/status';
import type { EntryDraft, GameEntry } from '@/features/library/types';
import { showToast } from '@/lib/toast';
import { space, type GameStatus } from '@/theme/tokens';

type MenuAction = 'status' | 'edit' | 'remove';

const MENU_OPTIONS: { value: MenuAction; label: string }[] = [
  { value: 'status', label: 'Alterar status' },
  { value: 'edit', label: 'Editar' },
  { value: 'remove', label: 'Remover' },
];

const STATUS_OPTIONS = STATUSES.map((status) => ({
  value: status,
  label: statusLabel[status],
  icon: statusIcon[status],
}));

function draftOf(entry: GameEntry, status: GameStatus): EntryDraft {
  return {
    platform: entry.platform,
    status,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    hoursPlayed: entry.hoursPlayed,
    rating: entry.rating,
    notes: entry.notes,
  };
}

type Props = { igdbId: number; entries: GameEntry[]; onCreate: () => void };

export function GameProgress({ igdbId, entries, onCreate }: Props) {
  const router = useRouter();
  const update = useUpdateEntry();
  const remove = useDeleteEntry();
  const [menuEntry, setMenuEntry] = useState<GameEntry | null>(null);
  const [statusEntry, setStatusEntry] = useState<GameEntry | null>(null);
  const [removeEntry, setRemoveEntry] = useState<GameEntry | null>(null);

  if (entries.length === 0) {
    return (
      <EmptyState
        title="Você ainda não registrou este jogo"
        message="Crie um registro para acompanhar status, horas e nota."
        action={{ label: 'Novo registro', onPress: onCreate }}
      />
    );
  }

  function chooseAction(action: MenuAction) {
    if (!menuEntry) return;
    if (action === 'status') setStatusEntry(menuEntry);
    else if (action === 'remove') setRemoveEntry(menuEntry);
    else router.push(`/games/${igdbId}/playthroughs/${menuEntry.id}/edit` as Href);
  }

  async function changeStatus(status: GameStatus) {
    if (!statusEntry) return;
    const entry = statusEntry;
    try {
      await update.mutateAsync({ original: entry, edited: draftOf(entry, status) });
      showToast('Status alterado');
    } catch (error) {
      showToast(authErrorMessage(error));
    }
  }

  async function confirmRemoval() {
    if (!removeEntry) return;
    const entry = removeEntry;
    setRemoveEntry(null);
    try {
      await remove.mutateAsync(entry.id);
      showToast('Registro removido');
    } catch (error) {
      showToast(authErrorMessage(error));
    }
  }

  return (
    <View style={styles.root}>
      {entries.map((entry) => (
        <EntryCard key={entry.id} entry={entry} onOpenMenu={() => setMenuEntry(entry)} />
      ))}
      <Button color="secondary" label="Novo registro (replay)" onPress={onCreate} />

      <OptionSheet
        visible={menuEntry !== null}
        title="Ações do registro"
        options={MENU_OPTIONS}
        onSelect={chooseAction}
        onClose={() => setMenuEntry(null)}
      />
      <OptionSheet
        visible={statusEntry !== null}
        title="Alterar status"
        options={STATUS_OPTIONS}
        selected={statusEntry?.status}
        onSelect={(status) => void changeStatus(status)}
        onClose={() => setStatusEntry(null)}
      />
      <ConfirmDialog
        visible={removeEntry !== null}
        title="Remover registro?"
        message="Seus outros registros do jogo continuam."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        destructive
        onConfirm={() => void confirmRemoval()}
        onCancel={() => setRemoveEntry(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.md },
});
