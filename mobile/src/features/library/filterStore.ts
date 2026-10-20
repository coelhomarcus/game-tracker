import { create } from 'zustand';

import { useSession } from '@/features/auth';
import type { GameStatus } from '@/theme/tokens';

type LibraryFilterState = {
  query: string;
  status: GameStatus | null;
  platformKey: string | null;
  setQuery(query: string): void;
  setStatus(status: GameStatus | null): void;
  setPlatform(platformKey: string | null): void;
  clear(): void;
};

const EMPTY = { query: '', status: null, platformKey: null } as const;

/** In-memory only: filters are not persisted and are dropped on sign-out. */
export const useLibraryFilter = create<LibraryFilterState>((set) => ({
  ...EMPTY,
  setQuery: (query) => set({ query }),
  setStatus: (status) => set({ status }),
  setPlatform: (platformKey) => set({ platformKey }),
  clear: () => set(EMPTY),
}));

useSession.subscribe((state, previous) => {
  if (state.status === 'signedOut' && previous.status !== 'signedOut') {
    useLibraryFilter.getState().clear();
  }
});
