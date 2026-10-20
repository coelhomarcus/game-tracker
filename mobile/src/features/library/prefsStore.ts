import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LibrarySort = 'recent' | 'oldest' | 'mostPlayed' | 'rating' | 'name';

const SORTS: readonly LibrarySort[] = ['recent', 'oldest', 'mostPlayed', 'rating', 'name'];

function parseSort(value: unknown): LibrarySort {
  return (SORTS as readonly unknown[]).includes(value) ? (value as LibrarySort) : 'recent';
}

type LibraryPrefsState = {
  sort: LibrarySort;
  setSort(sort: LibrarySort): void;
};

export const useLibraryPrefs = create<LibraryPrefsState>()(
  persist(
    (set) => ({
      sort: 'recent',
      setSort: (sort) => set({ sort }),
    }),
    {
      name: 'library.sort',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ sort: state.sort }),
      merge: (persisted, current) => ({
        ...current,
        sort: parseSort((persisted as { sort?: unknown } | undefined)?.sort),
      }),
    },
  ),
);
