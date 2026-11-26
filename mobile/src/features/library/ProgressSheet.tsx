import { useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, SheetModal, Text, TextField } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { formatDate, formatDateInput, todayDate } from '@/lib/dateOnly';
import { showToast } from '@/lib/toast';
import { colors, hairline, radii, space } from '@/theme/tokens';

import { useUpdateEntry } from './queries';
import { initialValues, toDraft, validate, type FormValues } from './rules';
import { statusLabel } from './status';
import type { GameEntry } from './types';

type ProgressAction = 'playing' | 'completed' | 'hours';
type Editor = { action: ProgressAction; value: string };

const ACTIONS = {
  playing: { title: 'Começar', label: 'Data de início', field: 'startedAt', icon: 'play-outline' },
  completed: { title: 'Marcar como zerado', label: 'Data de conclusão', field: 'finishedAt', icon: 'flag-outline' },
  hours: { title: 'Registrar horas', label: 'Horas jogadas', field: 'hours', icon: 'time-outline' },
} as const;

function editorFor(entry: GameEntry, action: ProgressAction): Editor {
  const existing = initialValues(entry.game, entry)[ACTIONS[action].field];
  return { action, value: existing || (action === 'hours' ? '' : formatDate(todayDate())) };
}

type Props = {
  entries: readonly GameEntry[];
  initialAction?: Exclude<ProgressAction, 'hours'>;
  onClose: () => void;
};

export function ProgressSheet({ entries, initialAction, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const update = useUpdateEntry();
  const saving = useRef(false);
  const [pending, setPending] = useState(false);
  const [entryId, setEntryId] = useState(entries.length === 1 ? entries[0]?.id : undefined);
  const [editor, setEditor] = useState<Editor | null>(() =>
    initialAction && entries[0] ? editorFor(entries[0], initialAction) : null,
  );
  const [error, setError] = useState<string>();

  const entry = entries.find((item) => item.id === entryId);
  const field = editor && ACTIONS[editor.action];
  const title = field?.title ?? (entry ? 'Atualizar progresso' : 'Escolher registro');

  function dismiss() {
    if (saving.current) return;
    Keyboard.dismiss();
    onClose();
  }

  async function save() {
    if (!entry || !editor || !field || saving.current) return;
    if (editor.action !== 'hours' && editor.value.trim() === '') {
      setError('Informe uma data.');
      return;
    }

    const values: FormValues = {
      ...initialValues(entry.game, entry),
      status: editor.action === 'hours' ? entry.status : editor.action,
      [field.field]: editor.value,
    };
    const errors = validate(values, todayDate());
    const validationError = errors[field.field] ?? errors.startedAt ?? errors.finishedAt ?? errors.hours;
    if (validationError) {
      setError(validationError);
      return;
    }

    saving.current = true;
    setPending(true);
    setError(undefined);
    Keyboard.dismiss();
    try {
      await update.mutateAsync({ original: entry, edited: toDraft(values) });
      onClose();
      showToast(editor.action === 'hours' ? 'Horas atualizadas' : 'Status alterado');
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }

  return (
    <SheetModal visible avoidKeyboard onRequestClose={dismiss} testID="progress-modal">
      <View accessibilityViewIsModal style={[styles.sheet, { maxHeight: height * 0.65 }]}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: space.lg + insets.bottom }]}
        >
          <View style={styles.heading}>
            <Text accessibilityRole="header" size="xl" weight="bold" tone="high">{title}</Text>
            <Text size="sm" tone="medium">
              {entry ? `${entry.game.name} · ${entry.platform}` : entries[0]?.game.name}
            </Text>
          </View>
          {editor && field ? (
            <>
              <TextField
                label={field.label}
                value={editor.value}
                onChangeText={(value) => {
                  setError(undefined);
                  setEditor({ ...editor, value: editor.action === 'hours' ? value : formatDateInput(value, editor.value) });
                }}
                keyboardType={editor.action === 'hours' ? 'decimal-pad' : 'numeric'}
                placeholder={editor.action === 'hours' ? 'Ex. 12,5' : 'dd/mm/aaaa'}
                helper={editor.action === 'hours' ? 'Informe o total de horas deste registro.' : undefined}
                error={error}
                editable={!pending}
              />
              <Button label="Salvar progresso" loading={pending} onPress={() => void save()} />
            </>
          ) : entry ? (
            <>
              {entry.status !== 'playing' && entry.status !== 'completed' ? (
                <Button label={ACTIONS.playing.title} icon={ACTIONS.playing.icon} color="secondary" onPress={() => setEditor(editorFor(entry, 'playing'))} />
              ) : null}
              <Button label={ACTIONS.hours.title} icon={ACTIONS.hours.icon} color="secondary" onPress={() => setEditor(editorFor(entry, 'hours'))} />
              {entry.status !== 'completed' || entry.finishedAt === null ? (
                <Button label={ACTIONS.completed.title} icon={ACTIONS.completed.icon} color="secondary" onPress={() => setEditor(editorFor(entry, 'completed'))} />
              ) : null}
              {entries.length > 1 ? <Button label="Trocar registro" variant="ghost" onPress={() => setEntryId(undefined)} /> : null}
            </>
          ) : entries.map((record, index) => (
            <Button
              key={record.id}
              label={`${record.platform} · ${statusLabel[record.status]} · ${formatDate(todayDate(record.createdAt))}`}
              accessibilityLabel={`Registro ${index + 1}, ${record.platform}, ${statusLabel[record.status]}, adicionado em ${formatDate(todayDate(record.createdAt))}`}
              color="secondary"
              onPress={() => setEntryId(record.id)}
            />
          ))}
          <Button label="Cancelar" color="secondary" variant="ghost" disabled={pending} onPress={dismiss} />
        </ScrollView>
      </View>
    </SheetModal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.bgContrast50,
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
    borderTopWidth: hairline,
    borderColor: colors.borderMedium,
  },
  content: { gap: space.sm, paddingTop: space.lg, paddingHorizontal: space.lg },
  heading: { gap: space.xs, marginBottom: space.xs },
});
