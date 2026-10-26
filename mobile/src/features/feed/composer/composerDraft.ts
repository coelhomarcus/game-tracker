import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

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

type DraftsState = {
  drafts: Partial<Record<ComposerKind, ComposerDraft>>;
  saveDraft(kind: ComposerKind, draft: ComposerDraft): void;
  clearDraft(kind: ComposerKind): void;
};

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
    images: Array.isArray(value.images) ? value.images.filter(isImage) : [],
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
      saveDraft: (kind, draft) => set((state) => ({ drafts: { ...state.drafts, [kind]: draft } })),
      clearDraft: (kind) =>
        set((state) => {
          if (!(kind in state.drafts)) return state;
          const drafts = { ...state.drafts };
          delete drafts[kind];
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
        const drafts: DraftsState['drafts'] = {};
        for (const [kind, value] of Object.entries(stored)) {
          const draft = parseDraft(value);
          if (draft) drafts[kind as ComposerKind] = draft;
        }
        // Anything saved in this session before the storage was read wins over the stored copy.
        return { ...current, drafts: { ...drafts, ...current.drafts } };
      },
    },
  ),
);

/** Whether the stored drafts have been read; until then there is nothing to restore. */
export function useDraftsHydrated(): boolean {
  return useHydration((state) => state.done);
}
