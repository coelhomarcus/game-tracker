import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** How a post page lays out its replies: one line per branch, or nested as a tree. */
export type ThreadView = 'linear' | 'tree';
/** The order of a post's replies: most liked, oldest or newest first. */
export type ThreadSort = 'top' | 'oldest' | 'newest';

const THREAD_VIEWS: readonly ThreadView[] = ['linear', 'tree'];
const THREAD_SORTS: readonly ThreadSort[] = ['top', 'oldest', 'newest'];

type StoredPreferences = {
  hapticsEnabled: boolean;
  /** Asks for a description before publishing a post whose images have none. */
  requireAltText: boolean;
  threadView: ThreadView;
  threadSort: ThreadSort;
};

type PreferencesState = StoredPreferences & {
  setHapticsEnabled(enabled: boolean): void;
  setRequireAltText(required: boolean): void;
  setThreadView(view: ThreadView): void;
  setThreadSort(sort: ThreadSort): void;
};

const DEFAULTS: StoredPreferences = {
  hapticsEnabled: true,
  requireAltText: false,
  threadView: 'linear',
  threadSort: 'oldest',
};

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setRequireAltText: (requireAltText) => set({ requireAltText }),
      setThreadView: (threadView) => set({ threadView }),
      setThreadSort: (threadSort) => set({ threadSort }),
    }),
    {
      name: 'preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): StoredPreferences => ({
        hapticsEnabled: state.hapticsEnabled,
        requireAltText: state.requireAltText,
        threadView: state.threadView,
        threadSort: state.threadSort,
      }),
      // Anything missing or unknown in storage (an older version, a hand edit) keeps its default.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<Record<keyof StoredPreferences, unknown>>;
        return {
          ...current,
          hapticsEnabled:
            typeof stored.hapticsEnabled === 'boolean' ? stored.hapticsEnabled : DEFAULTS.hapticsEnabled,
          requireAltText:
            typeof stored.requireAltText === 'boolean' ? stored.requireAltText : DEFAULTS.requireAltText,
          threadView: oneOf(stored.threadView, THREAD_VIEWS, DEFAULTS.threadView),
          threadSort: oneOf(stored.threadSort, THREAD_SORTS, DEFAULTS.threadSort),
        };
      },
    },
  ),
);
