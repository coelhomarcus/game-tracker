import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Avatar, Button, ChoiceChip, GameCover, Screen, Text } from '@/components';
import { fontFamily } from '@/components/Text';
import { authErrorMessage, useSession } from '@/features/auth';
import { gamesApi } from '@/features/games/api';
import { useGame } from '@/features/games/queries';
import type { Game } from '@/features/games/types';
import type { IoniconName } from '@/features/library/status';
import { useLibrary } from '@/features/library/queries';
import { statusLabel } from '@/features/library/status';
import { haptic } from '@/lib/haptics';
import { ApiError } from '@/lib/http/errors';
import { resolveImageUrl } from '@/lib/imageUrl';
import { showToast } from '@/lib/toast';
import { colors, hairline, lineHeight, radii, space, type } from '@/theme/tokens';

import { QuotedPost, RemovedQuote } from '../embeds/QuotedPost';
import { GamePickerSheet } from '../GamePickerSheet';
import { useCreatePost, usePost } from '../queries';
import { displayName, isPostId, toQuotedPost, type QuotedPost as QuotedPostData } from '../types';
import { measurePost, POST_MAX_LENGTH } from './CharProgress';
import { ComposerFooter } from './ComposerFooter';
import { ComposerTopBar } from './ComposerTopBar';
import {
  composerKind,
  draftHasContent,
  useComposerDrafts,
  useDraftsHydrated,
  type ComposerDraft,
  type ComposerKind,
} from './composerDraft';
import { DiscardDraftPrompt } from './DiscardDraftPrompt';

const AVATAR_SIZE = 42;
const GAME_COVER_WIDTH = 36;
const AUTOSAVE_DELAY_MS = 500;
const INPUT_SIZE = type.size.lg;

/** What the composer knows about the game of the post. */
type GameLink =
  | { kind: 'none' }
  | { kind: 'resolving' }
  | { kind: 'failed'; retry: () => void }
  | { kind: 'linked'; game: Game };

const NO_LINK: GameLink = { kind: 'none' };

/** The post being quoted, from `?quote=`. */
type Quote =
  | { kind: 'loading' }
  | { kind: 'failed'; retry: () => void }
  | { kind: 'removed' }
  | { kind: 'ready'; post: QuotedPostData };

function parseIgdbId(value: string | string[] | undefined): number | null {
  const text = Array.isArray(value) ? value[0] : value;
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parsePostId(value: string | string[] | undefined): string | null {
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text !== undefined && isPostId(text) ? text : null;
}

/**
 * The post composer (route `/posts/new`): `?igdbId=` (from the game page) starts the post already
 * linked to that game, and `?quote=<postId>` (from a post's repost button) makes it a quote of
 * that post. Each of these keeps its own local draft.
 */
export function Composer() {
  const params = useLocalSearchParams<{
    igdbId?: string | string[];
    quote?: string | string[];
  }>();
  const igdbId = parseIgdbId(params.igdbId);
  const quoteId = parsePostId(params.quote);
  const hydrated = useDraftsHydrated();

  // The drafts are read from the device once; until then there is nothing to restore from.
  if (!hydrated) return <Screen topInset>{null}</Screen>;

  const kind = composerKind({ quoteId, igdbId });
  const body = (quote?: Quote) =>
    igdbId === null ? (
      <ComposerBody kind={kind} quote={quote} quoteId={quoteId} />
    ) : (
      <PrelinkedBody kind={kind} igdbId={igdbId} quote={quote} quoteId={quoteId} />
    );
  return quoteId === null ? body() : <QuoteLoader postId={quoteId} render={body} />;
}

function QuoteLoader({
  postId,
  render,
}: {
  postId: string;
  render: (quote: Quote) => ReactNode;
}) {
  const post = usePost(postId);
  let quote: Quote = { kind: 'loading' };
  if (post.data) quote = { kind: 'ready', post: toQuotedPost(post.data) };
  else if (post.error instanceof ApiError && post.error.status === 404) quote = { kind: 'removed' };
  else if (post.isError) quote = { kind: 'failed', retry: () => void post.refetch() };
  return render(quote);
}

function PrelinkedBody({ igdbId, ...rest }: Omit<BodyProps, 'prelink'> & { igdbId: number }) {
  const game = useGame(igdbId);
  let link: GameLink = { kind: 'resolving' };
  if (game.data) link = { kind: 'linked', game: game.data };
  else if (game.isError) link = { kind: 'failed', retry: () => void game.refetch() };
  return <ComposerBody {...rest} prelink={link} />;
}

/** The quoted post under the editor, or why it is not there yet. */
function QuotePreview({ quote }: { quote: Quote }) {
  switch (quote.kind) {
    case 'ready':
      return <QuotedPost post={quote.post} onPress={null} />;
    case 'removed':
      return <RemovedQuote />;
    case 'failed':
      return (
        <View style={styles.failure}>
          <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
            Não foi possível carregar o post citado.
          </Text>
          <Button label="Tentar de novo" color="secondary" onPress={quote.retry} />
        </View>
      );
    case 'loading':
      return (
        <View style={styles.pending}>
          <ActivityIndicator accessibilityLabel="Carregando" color={colors.textMedium} />
          <Text size="sm" tone="medium">
            Carregando o post citado…
          </Text>
        </View>
      );
  }
}

/** The linked game under the editor, with the "x" that removes the link. */
function GameCard({ game, onRemove }: { game: Game; onRemove: () => void }) {
  const detail = game.platforms[0] ?? null;
  return (
    <View testID="composer-game-card" style={styles.gameCard}>
      <GameCover decorative name={game.name} url={game.coverUrl} width={GAME_COVER_WIDTH} />
      <View style={styles.gameText}>
        <Text numberOfLines={2} weight="semibold" tone="high">
          {game.name}
        </Text>
        {detail ? (
          <Text numberOfLines={1} size="sm" tone="medium">
            {detail}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remover vínculo com o jogo"
        onPress={onRemove}
        style={({ pressed }) => [styles.remove, pressed && styles.removePressed]}
      >
        <Ionicons name="close" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

/**
 * A secondary small pill. The visible pill is 34 dp tall; the pressable around it is the real
 * 48 dp touch box.
 */
function ComposerPill({
  icon,
  label,
  accessibilityLabel,
  trailingIcon,
  disabled = false,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  accessibilityLabel?: string;
  trailingIcon?: IoniconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptic('tap');
        onPress();
      }}
      style={[styles.pillBox, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <View style={[styles.pill, pressed && styles.pillPressed]}>
          <Ionicons name={icon} size={17} color={colors.text} />
          <Text numberOfLines={1} weight="medium" style={styles.pillLabel}>
            {label}
          </Text>
          {trailingIcon ? <Ionicons name={trailingIcon} size={17} color={colors.textMedium} /> : null}
        </View>
      )}
    </Pressable>
  );
}

type BodyProps = {
  kind: ComposerKind;
  prelink?: GameLink;
  quote?: Quote;
  quoteId: string | null;
};

/** The game link as a draft keeps it: untouched, a chosen game, or removed. */
function draftLink(override: GameLink | null): ComposerDraft['link'] {
  if (override === null) return null;
  return { game: override.kind === 'linked' ? override.game : null };
}

function ComposerBody({ kind, prelink = NO_LINK, quote, quoteId }: BodyProps) {
  const router = useRouter();
  const create = useCreatePost();
  const library = useLibrary();
  const user = useSession((state) => state.user);
  const saveDraft = useComposerDrafts((state) => state.saveDraft);
  const clearDraft = useComposerDrafts((state) => state.clearDraft);

  // The draft of this kind of composer, read once when it opens.
  const [restored] = useState(() => {
    const draft = useComposerDrafts.getState().drafts[kind];
    return draft && draftHasContent(draft) ? draft : null;
  });

  const [text, setText] = useState(restored?.text ?? '');
  // What the user chose or cleared; until then the game of the address (if any) applies.
  const [override, setOverride] = useState<GameLink | null>(() => {
    if (!restored?.link) return null;
    return restored.link.game ? { kind: 'linked', game: restored.link.game } : NO_LINK;
  });
  const [entryId, setEntryId] = useState<string | null>(restored?.entryId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  // Published, saved or discarded: the composer is closing and must not save or ask again.
  const [finished, setFinished] = useState(false);
  const [leave, setLeave] = useState<(() => void) | null>(null);
  const [scrolled, setScrolled] = useState(false);
  // A newer choice or a removal makes the answer of an older lookup stale.
  const lookup = useRef(0);
  // Set synchronously, so a second tap before the next render does not publish twice.
  const sending = useRef(false);
  const done = useRef(false);

  const link = override ?? prelink;
  const linkedGame = link.kind === 'linked' ? link.game : null;
  const records = (library.data ?? []).filter(
    (entry) => linkedGame !== null && entry.game.id === linkedGame.id,
  );
  const chosenRecord = records.find((entry) => entry.id === entryId);

  const trimmed = text.trim();
  const { count, over } = measurePost(text);
  const quoted = quote?.kind === 'ready' ? quote.post : null;
  // A quote is only sent once the quoted post is known to exist.
  const ready =
    (link.kind === 'none' || link.kind === 'linked') && (quote === undefined || quoted !== null);
  const canPublish = trimmed.length >= 1 && !over && !publishing && ready;

  const draft: Omit<ComposerDraft, 'savedAt'> = {
    text,
    link: draftLink(override),
    entryId: linkedGame ? entryId : null,
    quotedPostId: quoteId,
    images: [],
  };
  const hasContent = draftHasContent(draft);

  // Keeps the latest draft for the timer and for leaving, which run after this render.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  const storeDraft = useCallback(() => {
    const current = latest.current;
    if (draftHasContent(current)) saveDraft(kind, { ...current, savedAt: Date.now() });
    else clearDraft(kind);
  }, [kind, saveDraft, clearDraft]);

  useEffect(() => {
    if (restored) showToast('Rascunho restaurado');
  }, [restored]);

  // Autosave: shortly after the last change, and once more when the composer goes away.
  const draftKey = JSON.stringify(draft);
  useEffect(() => {
    if (done.current) return;
    // The composer may close (published, discarded) while the timer runs, before it unmounts.
    const timer = setTimeout(() => {
      if (!done.current) storeDraft();
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draftKey, storeDraft]);
  useEffect(
    () => () => {
      if (!done.current) storeDraft();
    },
    [storeDraft],
  );

  const disablePrevention = usePreventRemove(hasContent && !finished, ({ repeat }) => {
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

  /** Leaves the composer after the prompt, keeping the draft or not. */
  function finish(keepDraft: boolean) {
    const repeat = leave;
    done.current = true;
    if (keepDraft) storeDraft();
    else clearDraft(kind);
    setLeave(null);
    setFinished(true);
    repeat?.();
  }

  async function publish() {
    if (!canPublish || sending.current) return;
    sending.current = true;
    setApiError(null);
    setPublishing(true);
    try {
      await create.mutateAsync({
        content: trimmed,
        ...(linkedGame ? { gameId: linkedGame.id } : {}),
        ...(chosenRecord ? { gameEntryId: chosenRecord.id } : {}),
        ...(quoted ? { quotedPostId: quoted.id } : {}),
      });
    } catch (error) {
      sending.current = false;
      setApiError(authErrorMessage(error));
      setPublishing(false);
      return;
    }
    done.current = true;
    clearDraft(kind);
    setFinished(true);
    disablePrevention();
    showToast('Publicado');
    router.back();
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = event.nativeEvent.contentOffset.y > 0;
    if (next !== scrolled) setScrolled(next);
  }

  return (
    <Screen topInset>
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ComposerTopBar
          canPublish={canPublish}
          publishing={publishing}
          scrolled={scrolled}
          onCancel={() => router.back()}
          onPublish={() => void publish()}
        >
          {apiError ? (
            <Text accessibilityLiveRegion="polite" size="sm" tone="danger" style={styles.error}>
              {apiError}
            </Text>
          ) : null}
        </ComposerTopBar>

        <ScrollView
          testID="composer-scroll"
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
          onScroll={onScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.editor}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.avatar}
            >
              <Avatar
                uri={resolveImageUrl(user?.avatarUrl)}
                name={user ? displayName(user) : '?'}
                size={AVATAR_SIZE}
              />
            </View>
            <TextInput
              accessibilityLabel="Escrever post"
              accessibilityHint={`Até ${POST_MAX_LENGTH} caracteres`}
              autoFocus
              multiline
              placeholder="E aí, jogando o quê?"
              placeholderTextColor={colors.textLow}
              cursorColor={colors.primary}
              selectionColor={colors.primary}
              value={text}
              onChangeText={setText}
              style={styles.input}
            />
          </View>

          <View style={styles.embeds}>
            {quote ? <QuotePreview quote={quote} /> : null}

            {link.kind === 'linked' ? (
              <GameCard game={link.game} onRemove={() => setLink(NO_LINK)} />
            ) : link.kind === 'resolving' ? (
              <View style={styles.pending}>
                <ActivityIndicator accessibilityLabel="Carregando" color={colors.textMedium} />
                <Text size="sm" tone="medium">
                  Vinculando ao jogo…
                </Text>
              </View>
            ) : link.kind === 'failed' ? (
              <View style={styles.failure}>
                <Text accessibilityLiveRegion="polite" size="sm" tone="danger">
                  Não foi possível vincular ao jogo.
                </Text>
                <Button label="Tentar de novo" color="secondary" onPress={link.retry} />
                <Button label="Publicar sem vínculo" variant="ghost" onPress={() => setLink(NO_LINK)} />
              </View>
            ) : null}

            {linkedGame && records.length > 0 ? (
              <View style={styles.records}>
                <Text accessibilityRole="header" size="sm" weight="semibold" tone="medium">
                  Registro (opcional)
                </Text>
                <View style={styles.chips}>
                  <ChoiceChip
                    label="Nenhum"
                    selected={chosenRecord === undefined}
                    onPress={() => setEntryId(null)}
                  />
                  {records.map((entry) => (
                    <ChoiceChip
                      key={entry.id}
                      label={`${statusLabel[entry.status]} · ${entry.platform}`}
                      selected={entry.id === chosenRecord?.id}
                      onPress={() => setEntryId(entry.id)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <ScrollView
          horizontal
          bounces={false}
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.pillsBar}
          contentContainerStyle={styles.pills}
        >
          {linkedGame ? (
            <ComposerPill
              icon="game-controller-outline"
              label={linkedGame.name}
              accessibilityLabel={`Desvincular ${linkedGame.name}`}
              trailingIcon="close"
              onPress={() => setLink(NO_LINK)}
            />
          ) : (
            <ComposerPill
              icon="game-controller-outline"
              label="Vincular jogo"
              disabled={link.kind === 'resolving'}
              onPress={() => setPickerOpen(true)}
            />
          )}
        </ScrollView>

        <ComposerFooter count={count} />
      </KeyboardAvoidingView>

      <GamePickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(game) => {
          setPickerOpen(false);
          void resolve(game.igdbId);
        }}
      />
      <DiscardDraftPrompt
        visible={leave !== null}
        onSave={() => finish(true)}
        onDiscard={() => finish(false)}
        onKeepEditing={() => setLeave(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: space.lg },
  error: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  editor: { flexDirection: 'row', gap: space.md, marginHorizontal: space.lg },
  avatar: { marginTop: space.xs },
  input: {
    flex: 1,
    minHeight: 60,
    paddingTop: space.xs,
    paddingBottom: 0,
    paddingHorizontal: 0,
    fontFamily: fontFamily.normal,
    fontSize: INPUT_SIZE,
    lineHeight: lineHeight(INPUT_SIZE, 'snug'),
    color: colors.text,
    textAlignVertical: 'top',
  },
  embeds: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.md },
  gameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.xs,
    paddingLeft: space.sm,
    borderRadius: radii.md,
    borderWidth: hairline,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast25,
  },
  gameText: { flex: 1, gap: space._2xs },
  remove: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  removePressed: { backgroundColor: colors.bgContrast50 },
  records: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pending: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.md },
  failure: { gap: space.sm },
  pillsBar: { flexGrow: 0 },
  // The pill's 48 dp touch box already holds 7 dp of space above and below the visible pill, so
  // the bar adds only the rest of the design reference's 8 dp padding.
  pills: { paddingHorizontal: space.sm, paddingVertical: 1, gap: space.sm },
  pillBox: { minHeight: 48, justifyContent: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 240,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.borderLow,
    backgroundColor: colors.bgContrast50,
  },
  pillPressed: { backgroundColor: colors.borderLow },
  pillLabel: { flexShrink: 1 },
  disabled: { opacity: 0.5 },
});
