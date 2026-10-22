import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, ChoiceChip, ConfirmDialog, GameCover, Screen, TextField } from '@/components';
import { authErrorMessage } from '@/features/auth';
import { gamesApi } from '@/features/games/api';
import { useGame } from '@/features/games/queries';
import type { Game } from '@/features/games/types';
import { useLibrary } from '@/features/library/queries';
import { statusLabel } from '@/features/library/status';
import { showToast } from '@/lib/toast';
import { colors, fontSize, space } from '@/theme/tokens';

import { GamePickerSheet } from './GamePickerSheet';
import { useCreatePost } from './queries';

const MAX_LENGTH = 500;

/** What the screen knows about the game of the post. */
type GameLink =
  | { kind: 'none' }
  | { kind: 'resolving' }
  | { kind: 'failed'; retry: () => void }
  | { kind: 'linked'; game: Game };

const NO_LINK: GameLink = { kind: 'none' };

function parseIgdbId(value: string | string[] | undefined): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Route entry: `?igdbId=` (from the game page) starts the post already linked to that game. */
export function CreatePostScreen() {
  const params = useLocalSearchParams<{ igdbId?: string | string[] }>();
  const igdbId = parseIgdbId(params.igdbId);
  return igdbId === null ? <Composer /> : <PrelinkedComposer igdbId={igdbId} />;
}

function PrelinkedComposer({ igdbId }: { igdbId: number }) {
  const game = useGame(igdbId);
  let link: GameLink = { kind: 'resolving' };
  if (game.data) link = { kind: 'linked', game: game.data };
  else if (game.isError) link = { kind: 'failed', retry: () => void game.refetch() };
  return <Composer prelink={link} />;
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

type PublishActionProps = { busy: boolean; enabled: boolean; onPress: () => void };

/** Text-style header action; it is rendered by the header, so it is built from the live form state. */
function PublishAction({ busy, enabled, onPress }: PublishActionProps) {
  const inactive = busy || !enabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Publicar"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={styles.publish}
    >
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={[styles.publishLabel, { color: enabled ? colors.accent : colors.textMuted }]}>
          Publicar
        </Text>
      )}
    </Pressable>
  );
}

function GameRow({ game, onRemove }: { game: Game; onRemove: () => void }) {
  return (
    <View style={styles.gameRow}>
      <GameCover decorative name={game.name} url={game.coverUrl} width={GAME_COVER_WIDTH} />
      <Text numberOfLines={2} style={styles.gameName}>
        {game.name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remover vínculo com o jogo"
        onPress={onRemove}
        style={styles.remove}
      >
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const GAME_COVER_WIDTH = 36;

type ComposerProps = { prelink?: GameLink };

function Composer({ prelink = NO_LINK }: ComposerProps) {
  const router = useRouter();
  const create = useCreatePost();
  const library = useLibrary();

  const [text, setText] = useState('');
  // What the user chose or cleared; until then the game of the address (if any) applies.
  const [override, setOverride] = useState<GameLink | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  // A newer choice or a removal makes the answer of an older lookup stale.
  const lookup = useRef(0);

  const link = override ?? prelink;
  const linkedGame = link.kind === 'linked' ? link.game : null;
  const records = (library.data ?? []).filter(
    (entry) => linkedGame !== null && entry.game.id === linkedGame.id,
  );
  const chosenRecord = records.find((entry) => entry.id === entryId);

  const trimmed = text.trim();
  const ready = link.kind === 'none' || link.kind === 'linked';
  const canPublish = trimmed.length >= 1 && text.length <= MAX_LENGTH && !publishing && ready;

  const disablePrevention = usePreventRemove(trimmed.length > 0 && !published, ({ repeat }) => {
    setLeave(() => repeat);
  });

  function setLink(next: GameLink | null) {
    lookup.current += 1;
    setEntryId(null);
    setOverride(next);
  }

  async function resolve(igdbId: number) {
    const current = ++lookup.current;
    setEntryId(null);
    setOverride({ kind: 'resolving' });
    try {
      const game = await gamesApi.byIgdbId(igdbId);
      if (lookup.current === current) setOverride({ kind: 'linked', game });
    } catch {
      if (lookup.current === current) {
        setOverride({ kind: 'failed', retry: () => void resolve(igdbId) });
      }
    }
  }

  function discard() {
    const repeat = leave;
    setLeave(null);
    setPublished(true);
    repeat?.();
  }

  async function publish() {
    if (!canPublish) return;
    setApiError(null);
    setPublishing(true);
    try {
      await create.mutateAsync({
        content: trimmed,
        ...(linkedGame ? { gameId: linkedGame.id } : {}),
        ...(chosenRecord ? { gameEntryId: chosenRecord.id } : {}),
      });
    } catch (error) {
      setApiError(authErrorMessage(error));
      setPublishing(false);
      return;
    }
    setPublished(true);
    disablePrevention();
    showToast('Publicado');
    router.back();
  }

  return (
    <Screen scroll>
      <Stack.Screen
        options={{
          headerRight: () => (
            <PublishAction busy={publishing} enabled={canPublish} onPress={() => void publish()} />
          ),
        }}
      />
      <View style={styles.form}>
        {apiError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {apiError}
          </Text>
        ) : null}

        <View style={styles.composer}>
          <TextField
            label="O que você quer compartilhar?"
            multiline
            maxLength={MAX_LENGTH}
            value={text}
            onChangeText={setText}
          />
          <Text
            style={[styles.counter, { color: text.length > MAX_LENGTH ? colors.danger : colors.textMuted }]}
          >
            {`${text.length}/${MAX_LENGTH}`}
          </Text>
        </View>

        <Section title="Jogo (opcional)">
          {link.kind === 'linked' ? (
            <GameRow game={link.game} onRemove={() => setLink(NO_LINK)} />
          ) : link.kind === 'resolving' ? (
            <View style={styles.linking}>
              <ActivityIndicator accessibilityLabel="Carregando" color={colors.textMuted} />
              <Text style={styles.linkingLabel}>Vinculando ao jogo…</Text>
            </View>
          ) : link.kind === 'failed' ? (
            <View style={styles.failure}>
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                Não foi possível vincular ao jogo.
              </Text>
              <Button label="Tentar de novo" variant="secondary" onPress={link.retry} />
              <Button label="Publicar sem vínculo" variant="text" onPress={() => setLink(NO_LINK)} />
            </View>
          ) : (
            <Button label="Vincular um jogo" variant="secondary" onPress={() => setPickerOpen(true)} />
          )}
        </Section>

        {linkedGame && records.length > 0 ? (
          <Section title="Registro (opcional)">
            <View style={styles.chips}>
              <ChoiceChip label="Nenhum" selected={chosenRecord === undefined} onPress={() => setEntryId(null)} />
              {records.map((entry) => (
                <ChoiceChip
                  key={entry.id}
                  label={`${statusLabel[entry.status]} · ${entry.platform}`}
                  selected={entry.id === chosenRecord?.id}
                  onPress={() => setEntryId(entry.id)}
                />
              ))}
            </View>
          </Section>
        ) : null}
      </View>

      <GamePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(game) => {
          setPickerOpen(false);
          void resolve(game.igdbId);
        }}
      />
      <ConfirmDialog
        visible={leave !== null}
        title="Descartar publicação?"
        message="O texto que você escreveu não foi publicado."
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
  form: { padding: space.lg, gap: space.xl },
  composer: { gap: space.xs },
  counter: { alignSelf: 'flex-end', fontSize: fontSize.xs },
  section: { gap: space.md },
  sectionTitle: { color: colors.textStrong, fontSize: fontSize.lg, fontWeight: 'bold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  gameRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md },
  gameName: { flex: 1, color: colors.text, fontSize: fontSize.md },
  remove: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  linking: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md },
  linkingLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  failure: { gap: space.sm },
  error: { color: colors.danger, fontSize: fontSize.sm },
  publish: { minWidth: 48, minHeight: 48, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  publishLabel: { fontSize: fontSize.md, fontWeight: '600' },
});
