import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import { Avatar, Button, ChoiceChip, Screen, Text } from '@/components';
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
import { usePreferences } from '@/lib/preferences';
import { showToast } from '@/lib/toast';
import { colors, lineHeight, radii, space, type } from '@/theme/tokens';

import { QuotedPost, RemovedQuote } from '../embeds/QuotedPost';
import { GamePickerSheet } from '../GamePickerSheet';
import { useCreatePost, usePost } from '../queries';
import { displayName, isPostId, toQuotedPost, type QuotedPost as QuotedPostData } from '../types';
import { measurePost, POST_MAX_LENGTH } from './CharProgress';
import { AltTextSheet } from './AltTextSheet';
import { ComposerFooter } from './ComposerFooter';
import { ComposerGallery } from './ComposerGallery';
import { ComposerGameCard } from './ComposerGameCard';
import { ComposerTopBar } from './ComposerTopBar';
import {
  composerKind,
  draftHasContent,
  findDraft,
  useComposerDrafts,
  useDraftsHydrated,
  type ComposerDraft,
  type ComposerKind,
} from './composerDraft';
import { DiscardDraftPrompt } from './DiscardDraftPrompt';
import { pickFromGallery, takePhoto, useComposerImages, type PickedAsset } from './ImagePicking';

const AVATAR_SIZE = 42;
const AUTOSAVE_DELAY_MS = 500;
const INPUT_SIZE = type.size.lg;
const MISSING_ALT_MESSAGE = 'Adicione uma descrição a todas as imagens.';

/** What the composer knows about the game of the post. */
type GameLink =
  | { kind: 'none' }
  | { kind: 'resolving'; previous?: Game }
  | { kind: 'failed'; retry: () => void }
  | { kind: 'linked'; game: Game };

const NO_LINK: GameLink = { kind: 'none' };

/** The post being quoted, from `?quote=`. */
type Quote =
  | { kind: 'loading' }
  | { kind: 'failed'; retry: () => void }
  | { kind: 'removed' }
  | { kind: 'activity' }
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
  if (post.data) quote = post.data.type === 'activity' ? { kind: 'activity' } : { kind: 'ready', post: toQuotedPost(post.data) };
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
    case 'activity':
      return <Text size="sm" tone="medium">As citações estão disponíveis para publicações.</Text>;
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

/**
 * A secondary small pill. The visible pill is 34 dp tall; the pressable around it is the real
 * 48 dp touch box.
 */
function ComposerPill({
  icon,
  label,
  trailingIcon,
  disabled = false,
  onPress,
}: {
  icon: IoniconName;
  label: string;
  trailingIcon?: IoniconName;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
  if (override.kind === 'linked') return { game: override.game };
  return { game: override.kind === 'resolving' ? (override.previous ?? null) : null };
}

function ComposerBody({ kind, prelink = NO_LINK, quote, quoteId }: BodyProps) {
  const router = useRouter();
  const create = useCreatePost();
  const library = useLibrary();
  const user = useSession((state) => state.user);
  const userId = user?.id ?? null;
  const saveDraftFor = useComposerDrafts((state) => state.saveDraft);
  const clearDraftFor = useComposerDrafts((state) => state.clearDraft);

  // The draft this account left in this kind of composer, read once when it opens.
  const [restored] = useState(() =>
    userId === null ? null : findDraft(useComposerDrafts.getState().drafts, userId, kind),
  );

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
  // The image whose description is being written, by id.
  const [altFor, setAltFor] = useState<{ id: string; notice: boolean } | null>(null);
  const requireAltText = usePreferences((state) => state.requireAltText);
  const images = useComposerImages(restored?.images ?? []);
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

  const altImage = images.items.find((item) => item.id === altFor?.id);
  const trimmed = text.trim();
  // The ring counts what is typed; the limit applies to what is sent (trimmed).
  const { count } = measurePost(text);
  const { over } = measurePost(trimmed);
  const quoted = quote?.kind === 'ready' ? quote.post : null;
  // A quote is only sent once the quoted post is known to exist.
  const ready =
    (link.kind === 'none' || link.kind === 'linked') && (quote === undefined || quoted !== null);
  // Text or at least one finished image; never while an image is still uploading or has failed.
  const canPublish =
    (trimmed.length >= 1 || images.uploaded.length > 0) &&
    !over &&
    !publishing &&
    !images.uploading &&
    !images.failed &&
    ready;

  const draft: Omit<ComposerDraft, 'savedAt'> = {
    text,
    link: draftLink(override),
    entryId: linkedGame || (link.kind === 'resolving' && link.previous) ? entryId : null,
    quotedPostId: quoteId,
    // Only what finished uploading can be sent again later.
    images: images.uploaded,
  };
  // An image still uploading or failed is not in the draft, but leaving would lose it.
  const hasContent = draftHasContent(draft) || images.items.length > 0;

  // Keeps the latest draft for the timer and for leaving, which run after this render.
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  });

  // Whether this account still owns the session: after a sign-out or an expiry nothing is saved.
  const sessionIsMine = useCallback(
    () => userId !== null && useSession.getState().user?.id === userId,
    [userId],
  );

  const clearDraft = useCallback(() => {
    if (userId !== null) clearDraftFor(userId, kind);
  }, [userId, kind, clearDraftFor]);

  const storeDraft = useCallback(() => {
    if (userId === null || !sessionIsMine()) return;
    const current = latest.current;
    if (draftHasContent(current)) saveDraftFor(userId, kind, { ...current, savedAt: Date.now() });
    else clearDraftFor(userId, kind);
  }, [userId, kind, sessionIsMine, saveDraftFor, clearDraftFor]);

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

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const disablePrevention = usePreventRemove(hasContent && !finished, ({ repeat }) => {
    // Android back while the post is going out: stay, the publish decides what happens next.
    if (sending.current) return;
    setLeave(() => repeat);
  });

  function setLink(next: GameLink | null) {
    lookup.current += 1;
    setEntryId(null);
    setOverride(next);
  }

  function openGamePicker() {
    Keyboard.dismiss();
    setPickerOpen(true);
  }

  async function resolve(igdbId: number, previous: Game | null = linkedGame) {
    const current = ++lookup.current;
    setOverride({ kind: 'resolving', previous: previous ?? undefined });
    try {
      const game = await gamesApi.byIgdbId(igdbId);
      if (mounted.current && lookup.current === current) {
        setEntryId(null);
        setOverride({ kind: 'linked', game });
      }
    } catch {
      if (!mounted.current || lookup.current !== current) return;
      if (previous) {
        setOverride({ kind: 'linked', game: previous });
        showToast('Não foi possível trocar de jogo. Tente novamente.');
      } else {
        setOverride({ kind: 'failed', retry: () => void resolve(igdbId, null) });
      }
    }
  }

  /** Leaves the composer after the prompt, keeping the draft or not. */
  function finish(keepDraft: boolean) {
    const repeat = leave;
    done.current = true;
    if (keepDraft) storeDraft();
    else clearDraft();
    setLeave(null);
    setFinished(true);
    repeat?.();
  }

  async function publish() {
    if (!canPublish || sending.current) return;
    if (images.uploading) {
      showToast('Aguarde o envio das imagens');
      return;
    }
    if (images.failed) {
      showToast('Remova ou tente de novo as imagens que falharam');
      return;
    }
    // With the preference on, every uploaded image needs a description before the post goes out.
    if (requireAltText) {
      const missing = images.items.find((item) => item.image && !item.image.alt);
      if (missing) {
        showToast(MISSING_ALT_MESSAGE);
        setAltFor({ id: missing.id, notice: true });
        return;
      }
    }
    sending.current = true;
    setApiError(null);
    setPublishing(true);
    try {
      await create.mutateAsync({
        content: trimmed,
        ...(linkedGame ? { gameId: linkedGame.id } : {}),
        ...(chosenRecord ? { gameEntryId: chosenRecord.id } : {}),
        ...(quoted ? { quotedPostId: quoted.id } : {}),
        ...(images.uploaded.length > 0 ? { images: images.uploaded } : {}),
      });
    } catch (error) {
      sending.current = false;
      setApiError(authErrorMessage(error));
      setPublishing(false);
      return;
    }
    // The composer may be gone already (left through the prompt, or unmounted): then there is
    // nothing to go back from.
    const closed = done.current || !mounted.current;
    done.current = true;
    clearDraft();
    showToast('Publicado');
    if (closed) return;
    setFinished(true);
    disablePrevention();
    router.back();
  }

  /** The system picker takes over the screen; one at a time. */
  const picking = useRef(false);
  async function pickImages(pick: () => Promise<PickedAsset[]>) {
    if (picking.current) return;
    picking.current = true;
    try {
      images.add(await pick());
    } catch {
      showToast('Não foi possível abrir as imagens. Tente de novo.');
    } finally {
      picking.current = false;
    }
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = event.nativeEvent.contentOffset.y > 0;
    if (next !== scrolled) setScrolled(next);
  }

  return (
    <Screen topInset>
      <KeyboardAvoidingView
        automaticOffset={Platform.OS === 'android'}
        behavior="padding"
        style={styles.fill}
        testID="composer-keyboard-avoider"
      >
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

          {images.items.length > 0 ? (
            <View style={styles.gallery}>
              <ComposerGallery
                images={images.items}
                onRemove={images.remove}
                onRetry={images.retry}
                onBroken={images.markBroken}
                onEditAlt={(id) => setAltFor({ id, notice: false })}
              />
            </View>
          ) : null}

          <View style={styles.embeds}>
            {quote ? <QuotePreview quote={quote} /> : null}

            {link.kind === 'linked' ? (
              <ComposerGameCard
                game={link.game}
                platform={chosenRecord?.platform ?? link.game.platforms[0]}
                onRemove={() => setLink(NO_LINK)}
              >
                {records.length > 0 ? (
                  <>
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
                  </>
                ) : null}
              </ComposerGameCard>
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
              label="Trocar jogo"
              trailingIcon="chevron-down"
              onPress={openGamePicker}
            />
          ) : (
            <ComposerPill
              icon="game-controller-outline"
              label="Vincular jogo"
              disabled={link.kind === 'resolving'}
              onPress={openGamePicker}
            />
          )}
        </ScrollView>

        <ComposerFooter
          count={count}
          imagesFull={images.full}
          onPickImages={() => void pickImages(() => pickFromGallery(images.remaining))}
          onTakePhoto={() => void pickImages(takePhoto)}
        />
      </KeyboardAvoidingView>

      <GamePickerSheet
        visible={pickerOpen}
        entries={library.data}
        selectedIgdbId={linkedGame?.igdbId}
        onClose={() => setPickerOpen(false)}
        onSelect={(game) => {
          setPickerOpen(false);
          if (game.igdbId !== linkedGame?.igdbId) void resolve(game.igdbId);
        }}
      />
      <AltTextSheet
        visible={altImage !== undefined}
        imageUri={altImage?.uri ?? ''}
        initialAlt={altImage?.image?.alt ?? ''}
        notice={altFor?.notice ? MISSING_ALT_MESSAGE : undefined}
        onSave={(alt) => {
          if (altFor !== null) images.setAlt(altFor.id, alt);
          setAltFor(null);
        }}
        onCancel={() => setAltFor(null)}
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
  gallery: { marginHorizontal: space.lg, marginTop: space.md },
  embeds: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pending: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
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
