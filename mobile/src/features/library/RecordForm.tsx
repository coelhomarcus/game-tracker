import { useLocalSearchParams, usePreventRemove, useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button, ChoiceChip, ConfirmDialog, EmptyState, Screen, TextField } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { useGame } from '@/features/games/queries';
import type { Game } from '@/features/games/types';
import { todayDate, formatDate } from '@/lib/dateOnly';
import { ApiError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';
import { colors, fontSize, space } from '@/theme/tokens';

import { useCreateEntry, useLibrary, useUpdateEntry } from './queries';
import {
  MAX_NOTES_LENGTH,
  initialValues,
  isDirty,
  toDraft,
  validate,
  type FormErrors,
  type FormField,
  type FormValues,
} from './rules';
import { STATUSES, statusIcon, statusLabel } from './status';
import type { GameEntry } from './types';

const MAX_PLATFORM_LENGTH = 50;
const DATE_INPUT_LENGTH = 8;
const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseIgdbId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Keeps digits only and inserts the `/` separators of `dd/mm/aaaa` while the user types. */
function formatDateInput(text: string, previous: string): string {
  const digits = text.replace(/\D/g, '').slice(0, DATE_INPUT_LENGTH);
  let formatted = digits.slice(0, 2);
  if (digits.length > 2) formatted += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) formatted += `/${digits.slice(4)}`;
  // The separator is added only when typing forward, so backspace can delete it.
  const typingForward = text.length > previous.length;
  if (typingForward && (digits.length === 2 || digits.length === 4)) formatted += '/';
  return formatted;
}

function replayNote(count: number): string {
  const records = count === 1 ? '1 registro' : `${count} registros`;
  return `Você já tem ${records} deste jogo. Este será um novo registro.`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator accessibilityLabel="Carregando" size="large" color={colors.accent} />
    </View>
  );
}

function CenteredEmptyState(props: Parameters<typeof EmptyState>[0]) {
  return (
    <Screen>
      <View style={styles.center}>
        <EmptyState {...props} />
      </View>
    </Screen>
  );
}

function GameNotFound() {
  const router = useRouter();
  return (
    <CenteredEmptyState
      title="Jogo não encontrado"
      message="O endereço deste jogo não é válido."
      action={{ label: 'Ir para a Biblioteca', onPress: () => router.replace('/library') }}
    />
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <CenteredEmptyState
      title="Não foi possível carregar"
      message="Verifique a conexão e tente de novo."
      action={{ label: 'Tentar novamente', onPress: onRetry }}
    />
  );
}

/** Route entry: validates the address, then waits for the game (and the record when editing). */
export function RecordForm() {
  const params = useLocalSearchParams<{ igdbId?: string | string[]; entryId?: string | string[] }>();
  const igdbId = parseIgdbId(firstParam(params.igdbId));
  if (igdbId === null) return <GameNotFound />;
  return <RecordLoader igdbId={igdbId} entryId={firstParam(params.entryId)} />;
}

function RecordLoader({ igdbId, entryId }: { igdbId: number; entryId?: string }) {
  const router = useRouter();
  const game = useGame(igdbId);
  const library = useLibrary();

  if (game.isError) {
    if (game.error instanceof ApiError && game.error.status === 404) return <GameNotFound />;
    return <LoadError onRetry={() => void game.refetch()} />;
  }
  if (!game.data) return <Loading />;

  let entry: GameEntry | undefined;
  if (entryId !== undefined) {
    if (library.isError) return <LoadError onRetry={() => void library.refetch()} />;
    if (!library.data) return <Loading />;
    entry = library.data.find((item) => item.id === entryId);
    if (!entry) {
      return (
        <CenteredEmptyState
          title="Registro não encontrado"
          message="Ele pode ter sido removido."
          action={{
            label: 'Voltar ao jogo',
            onPress: () => router.replace(`/games/${igdbId}` as Href),
          }}
        />
      );
    }
  }

  const replayCount =
    entry === undefined
      ? (library.data?.filter((item) => item.game.igdbId === igdbId).length ?? 0)
      : 0;
  return <RecordFormBody key={entry?.id ?? 'new'} game={game.data} entry={entry} replayCount={replayCount} />;
}

type BodyProps = { game: Game; entry?: GameEntry; replayCount: number };

function RecordFormBody({ game, entry, replayCount }: BodyProps) {
  const router = useRouter();
  const create = useCreateEntry();
  const update = useUpdateEntry();

  const [initial] = useState(() => initialValues(game, entry));
  const [values, setValues] = useState<FormValues>(initial);
  const [customPlatform, setCustomPlatform] = useState(() =>
    initial.platform === ''
      ? game.platforms.length === 0
      : !game.platforms.includes(initial.platform),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [released, setReleased] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);

  const dirty = isDirty(initial, values);
  const disablePrevention = usePreventRemove(dirty && !released, ({ repeat }) => {
    setLeave(() => repeat);
  });

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!(key in current)) return current;
      const { [key as FormField]: _cleared, ...rest } = current;
      return rest;
    });
  }

  function changeDate(key: 'startedAt' | 'finishedAt', text: string) {
    change(key, formatDateInput(text, values[key]));
  }

  function choosePlatform(platform: string) {
    setCustomPlatform(false);
    change('platform', platform);
  }

  function chooseOtherPlatform() {
    if (customPlatform) return;
    setCustomPlatform(true);
    change('platform', '');
  }

  function toggleRating(rating: number) {
    change('rating', values.rating === rating ? null : rating);
  }

  function discard() {
    const repeat = leave;
    setLeave(null);
    setReleased(true);
    repeat?.();
  }

  async function save() {
    if (saving) return;
    if (entry && !dirty) {
      router.back();
      return;
    }
    setApiError(null);
    const found = validate(values, todayDate());
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const draft = toDraft(values);
    setSaving(true);
    try {
      if (entry) await update.mutateAsync({ original: entry, edited: draft });
      else await create.mutateAsync({ igdbId: game.igdbId, draft });
    } catch (error) {
      setApiError(authErrorMessage(error));
      setSaving(false);
      return;
    }
    setReleased(true);
    disablePrevention();
    showToast(entry ? 'Registro atualizado' : 'Registro criado');
    router.back();
  }

  const showPlatformField = customPlatform;

  return (
    <Screen scroll>
      <View style={styles.form}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.gameName}>
            {game.name}
          </Text>
          {replayCount > 0 ? <Text style={styles.note}>{replayNote(replayCount)}</Text> : null}
        </View>

        <Section title="Status">
          <View style={styles.chips}>
            {STATUSES.map((status) => (
              <ChoiceChip
                key={status}
                label={statusLabel[status]}
                icon={statusIcon[status]}
                selected={values.status === status}
                onPress={() => change('status', status)}
              />
            ))}
          </View>
        </Section>

        <Section title="Plataforma">
          <View style={styles.chips}>
            {game.platforms.map((platform) => (
              <ChoiceChip
                key={platform}
                label={platform}
                selected={!customPlatform && values.platform === platform}
                onPress={() => choosePlatform(platform)}
              />
            ))}
            <ChoiceChip
              label="Outra"
              icon="create-outline"
              selected={customPlatform}
              onPress={chooseOtherPlatform}
            />
          </View>
          {showPlatformField ? (
            <TextField
              label="Plataforma"
              placeholder="Ex.: PC"
              maxLength={MAX_PLATFORM_LENGTH}
              value={values.platform}
              onChangeText={(text) => change('platform', text)}
              error={errors.platform}
            />
          ) : errors.platform ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {errors.platform}
            </Text>
          ) : null}
        </Section>

        <Section title="Progresso">
          <View style={styles.dates}>
            <View style={styles.date}>
              <TextField
                label="Início"
                placeholder="dd/mm/aaaa"
                keyboardType="numeric"
                value={values.startedAt}
                onChangeText={(text) => changeDate('startedAt', text)}
                error={errors.startedAt}
              />
              <Button
                label="Hoje"
                accessibilityLabel="Preencher início com hoje"
                variant="text"
                onPress={() => change('startedAt', formatDate(todayDate()))}
              />
            </View>
            <View style={styles.date}>
              <TextField
                label="Fim"
                placeholder="dd/mm/aaaa"
                keyboardType="numeric"
                value={values.finishedAt}
                onChangeText={(text) => changeDate('finishedAt', text)}
                error={errors.finishedAt}
              />
              <Button
                label="Hoje"
                accessibilityLabel="Preencher fim com hoje"
                variant="text"
                onPress={() => change('finishedAt', formatDate(todayDate()))}
              />
            </View>
          </View>
          <TextField
            label="Horas jogadas"
            helper="Opcional. Aceita 12 ou 12,5."
            keyboardType="decimal-pad"
            value={values.hours}
            onChangeText={(text) => change('hours', text)}
            error={errors.hours}
          />
        </Section>

        <Section title="Sua avaliação">
          <View style={styles.ratingHeader}>
            <Text style={styles.ratingLabel}>Nota</Text>
            <Text style={styles.ratingValue}>
              {values.rating === null ? 'Sem nota' : `${values.rating}/10`}
            </Text>
          </View>
          <View style={styles.chips}>
            {RATINGS.map((rating) => (
              <ChoiceChip
                key={rating}
                label={String(rating)}
                accessibilityLabel={`Nota ${rating} de 10`}
                selected={values.rating === rating}
                onPress={() => toggleRating(rating)}
              />
            ))}
          </View>
          {values.rating !== null ? (
            <Button label="Sem nota" variant="text" onPress={() => change('rating', null)} />
          ) : null}
        </Section>

        <TextField
          label="Notas pessoais"
          helper="Só você vê."
          multiline
          maxLength={MAX_NOTES_LENGTH}
          value={values.notes}
          onChangeText={(text) => change('notes', text)}
          error={errors.notes}
        />

        {apiError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {apiError}
          </Text>
        ) : null}
        <Button label="Salvar registro" loading={saving} onPress={() => void save()} />
      </View>

      <ConfirmDialog
        visible={leave !== null}
        title="Descartar alterações?"
        message="O que você preencheu não foi salvo."
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        destructive
        onConfirm={discard}
        onCancel={() => setLeave(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  form: { padding: space.lg, gap: space.xl },
  heading: { gap: space.xs },
  gameName: { color: colors.textStrong, fontSize: fontSize.xl, fontWeight: 'bold' },
  note: { color: colors.textMuted, fontSize: fontSize.sm },
  section: { gap: space.md },
  sectionTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dates: { flexDirection: 'row', gap: space.md },
  date: { flex: 1, gap: space.xs },
  ratingHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  ratingLabel: { color: colors.text, fontSize: fontSize.sm },
  ratingValue: { color: colors.textStrong, fontSize: fontSize.md, fontWeight: 'bold' },
  error: { color: colors.danger, fontSize: fontSize.sm },
});
