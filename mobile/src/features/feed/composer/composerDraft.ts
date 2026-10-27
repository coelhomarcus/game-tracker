import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { registerBeforeSignOut, useSession } from '@/features/auth';
import type { Game } from '@/features/games/types';

import type { PostImageInput } from '../api';

/**
 * Which composer a draft belongs to: a plain post, a quote of a post, or a post opened from a
 * game's page. Each keeps its own draft, so a quote draft never shows up in a plain post.
 */
export type ComposerKind = 'plain' | `quote:${string}` | `game:${number}`;

export function composerKind({
  quoteId,
  igdbId,
}: {
  quoteId: string | null;
  igdbId: number | null;
}): ComposerKind {
  if (quoteId !== null) return `quote:${quoteId}`;
  if (igdbId !== null) return `game:${igdbId}`;
  return 'plain';
}

export type ComposerDraft = {
  text: string;
  /**
   * The game the user chose, or `{ game: null }` when they removed the link. `null` when they
   * never touched it, so the game of the address (if any) applies again.
   */
  link: { game: Game | null } | null;
  /** The playthrough of the linked game the post is about. */
  entryId: string | null;
  /** The quoted post (the kind already says it; kept so a draft is complete on its own). */
  quotedPostId: string | null;
  /** Only images that finished uploading; the rest cannot be sent again. */
  images: PostImageInput[];
  savedAt: number;
};

/** Whether a draft holds anything the user wrote or chose (a quote alone comes from the address). */
export function draftHasContent(draft: Pick<ComposerDraft, 'text' | 'link' | 'images'>): boolean {
  return draft.text.trim().length > 0 || draft.images.length > 0 || Boolean(draft.link?.game);
}

/** The most the server takes in an image description. */
export const ALT_MAX_LENGTH = 1000;

/** A draft untouched for this long is forgotten. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type UserDrafts = Partial<Record<ComposerKind, ComposerDraft>>;

type DraftsState = {
  /** The drafts of each account by user id, so one account never sees another's. */
  drafts: Record<string, UserDrafts>;
  saveDraft(userId: string, kind: ComposerKind, draft: ComposerDraft): void;
  clearDraft(userId: string, kind: ComposerKind): void;
  /** Forgets every draft of one account (sign-out, expired session). */
  clearUser(userId: string): void;
};

function isFresh(draft: ComposerDraft, now: number): boolean {
  return now - draft.savedAt <= DRAFT_MAX_AGE_MS;
}

/** The draft to restore: one this account saved for this kind, with content, not older than 7 days. */
export function findDraft(
  drafts: DraftsState['drafts'],
  userId: string,
  kind: ComposerKind,
  now = Date.now(),
): ComposerDraft | null {
  const draft = drafts[userId]?.[kind];
  return draft && draftHasContent(draft) && isFresh(draft, now) ? draft : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isImage(value: unknown): value is PostImageInput {
  return (
    isObject(value) &&
    typeof value.url === 'string' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

/** The image as a draft keeps it: the description only when it is a usable one (1 to 1000). */
function toImage(value: PostImageInput): PostImageInput {
  const { url, width, height } = value;
  const alt = typeof value.alt === 'string' ? value.alt.trim() : '';
  return alt.length > 0 && alt.length <= ALT_MAX_LENGTH
    ? { url, width, height, alt }
    : { url, width, height };
}

function isGame(value: unknown): value is Game {
  return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

/** A stored draft, or `null` when it is not one (an older shape, a hand edit). */
function parseDraft(value: unknown): ComposerDraft | null {
  if (!isObject(value) || typeof value.text !== 'string') return null;
  const link = isObject(value.link)
    ? { game: isGame(value.link.game) ? value.link.game : null }
    : null;
  return {
    text: value.text,
    link,
    entryId: typeof value.entryId === 'string' ? value.entryId : null,
    quotedPostId: typeof value.quotedPostId === 'string' ? value.quotedPostId : null,
    images: Array.isArray(value.images) ? value.images.filter(isImage).map(toImage) : [],
    savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
  };
}

/**
 * Set once the stored drafts have been read, or reading them failed: either way the composer can
 * open (with nothing to restore after a failure).
 */
const useHydration = create<{ done: boolean }>(() => ({ done: false }));

/** Composer drafts, one per composer kind, kept on the device. */
export const useComposerDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      saveDraft: (userId, kind, draft) =>
        set((state) => ({
          drafts: { ...state.drafts, [userId]: { ...state.drafts[userId], [kind]: draft } },
        })),
      clearDraft: (userId, kind) =>
        set((state) => {
          const mine = state.drafts[userId];
          if (!mine || !(kind in mine)) return state;
          const rest = { ...mine };
          delete rest[kind];
          const drafts = { ...state.drafts, [userId]: rest };
          if (Object.keys(rest).length === 0) delete drafts[userId];
          return { drafts };
        }),
      clearUser: (userId) =>
        set((state) => {
          if (!(userId in state.drafts)) return state;
          const drafts = { ...state.drafts };
          delete drafts[userId];
          return { drafts };
        }),
    }),
    {
      name: 'composer-drafts',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ drafts: state.drafts }),
      onRehydrateStorage: () => () => useHydration.setState({ done: true }),
      merge: (persisted, current) => {
        const stored = isObject(persisted) && isObject(persisted.drafts) ? persisted.drafts : {};
        const now = Date.now();
        const drafts: DraftsState['drafts'] = {};
        // An older build kept one flat list for the device (kind -> draft); it cannot be tied to
        // an account, so it reads as nothing here and is dropped.
        for (const [userId, perKind] of Object.entries(stored)) {
          if (!isObject(perKind)) continue;
          const mine: UserDrafts = {};
          for (const [kind, value] of Object.entries(perKind)) {
            const draft = parseDraft(value);
            if (draft && isFresh(draft, now)) mine[kind as ComposerKind] = draft;
          }
          if (Object.keys(mine).length > 0) drafts[userId] = mine;
        }
        // Anything saved in this session before the storage was read wins over the stored copy.
        const merged = { ...drafts };
        for (const [userId, mine] of Object.entries(current.drafts)) {
          merged[userId] = { ...merged[userId], ...mine };
        }
        return { ...current, drafts: merged };
      },
    },
  ),
);

/** Whether the stored drafts have been read; until then there is nothing to restore. */
export function useDraftsHydrated(): boolean {
  return useHydration((state) => state.done);
}

/**
 * Forgets an account's drafts when it signs out on purpose (before the session is cleared) and
 * whenever the session ends, expiry included. Returns the stop function.
 */
export function watchSessionForDrafts(): () => void {
  const stopHook = registerBeforeSignOut(async () => {
    const id = useSession.getState().user?.id;
    if (id) useComposerDrafts.getState().clearUser(id);
  });
  const stopWatch = useSession.subscribe((state, previous) => {
    if (previous.user && state.status === 'signedOut') {
      useComposerDrafts.getState().clearUser(previous.user.id);
    }
  });
  return () => {
    stopHook();
    stopWatch();
  };
}
