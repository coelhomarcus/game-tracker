import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type LibrarySort = 'recent' | 'oldest' | 'mostPlayed' | 'rating' | 'name';

/** The sorts in display order, with the label every picker shows. */
export const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Adicionados recentemente' },
  { value: 'oldest', label: 'Adicionados há mais tempo' },
  { value: 'mostPlayed', label: 'Mais horas registradas' },
  { value: 'rating', label: 'Minha nota' },
  { value: 'name', label: 'Nome A–Z' },
];

const SORTS: readonly LibrarySort[] = SORT_OPTIONS.map((option) => option.value);

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
