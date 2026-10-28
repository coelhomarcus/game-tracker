import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { registerBeforeSignOut, useSession } from '@/features/auth';

/** The most terms and the most people kept per account. */
export const RECENT_LIMIT = 10;

/** A person opened from the search, as the results showed them (the row needs no fetch). */
export type RecentPerson = {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
};

export type UserRecents = { terms: string[]; people: RecentPerson[] };

type RecentsState = {
  /** The recents of each account by user id, so one account never sees another's. */
  recents: Record<string, UserRecents>;
  /** Puts the term first; the same term in another case is replaced. Blank terms are ignored. */
  addTerm(userId: string, term: string): void;
  /** Puts the person first, replacing an older entry of theirs. */
  addPerson(userId: string, person: RecentPerson): void;
  removeTerm(userId: string, term: string): void;
  removePerson(userId: string, personId: string): void;
  /** Forgets every recent of one account (sign-out, expired session). */
  clearUser(userId: string): void;
};

const EMPTY: UserRecents = { terms: [], people: [] };

const sameTerm = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePerson(value: unknown): RecentPerson | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.username !== 'string') {
    return null;
  }
  return {
    id: value.id,
    username: value.username,
    name: typeof value.name === 'string' ? value.name : null,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
  };
}

/** A stored entry, or `null` when it is not one (an older shape, a hand edit). */
function parseRecents(value: unknown): UserRecents | null {
  if (!isObject(value)) return null;
  const terms: string[] = [];
  for (const term of Array.isArray(value.terms) ? value.terms : []) {
    if (typeof term !== 'string') continue;
    const clean = term.trim();
    if (clean === '') continue;
    if (!terms.some((kept) => sameTerm(kept, clean))) terms.push(clean);
  }
  const people: RecentPerson[] = [];
  for (const item of Array.isArray(value.people) ? value.people : []) {
    const person = parsePerson(item);
    if (person && !people.some((kept) => kept.id === person.id)) people.push(person);
  }
  return { terms: terms.slice(0, RECENT_LIMIT), people: people.slice(0, RECENT_LIMIT) };
}

function withUser(
  recents: RecentsState['recents'],
  userId: string,
  change: (mine: UserRecents) => UserRecents,
): RecentsState['recents'] {
  const next = change(recents[userId] ?? EMPTY);
  const all = { ...recents };
  if (next.terms.length === 0 && next.people.length === 0) delete all[userId];
  else all[userId] = next;
  return all;
}

/** The terms the user searched and the people they opened from the search, kept on the device. */
export const useRecentSearches = create<RecentsState>()(
  persist(
    (set) => ({
      recents: {},
      addTerm: (userId, term) => {
        const clean = term.trim();
        if (clean === '') return;
        set((state) => ({
          recents: withUser(state.recents, userId, (mine) => ({
            ...mine,
            terms: [clean, ...mine.terms.filter((kept) => !sameTerm(kept, clean))].slice(0, RECENT_LIMIT),
          })),
        }));
      },
      addPerson: (userId, person) =>
        set((state) => ({
          recents: withUser(state.recents, userId, (mine) => ({
            ...mine,
            people: [
              { id: person.id, username: person.username, name: person.name, avatarUrl: person.avatarUrl },
              ...mine.people.filter((kept) => kept.id !== person.id),
            ].slice(0, RECENT_LIMIT),
          })),
        })),
      removeTerm: (userId, term) =>
        set((state) => {
          const mine = state.recents[userId];
          if (!mine?.terms.some((kept) => sameTerm(kept, term))) return state;
          return {
            recents: withUser(state.recents, userId, (current) => ({
              ...current,
              terms: current.terms.filter((kept) => !sameTerm(kept, term)),
            })),
          };
        }),
      removePerson: (userId, personId) =>
        set((state) => {
          const mine = state.recents[userId];
          if (!mine?.people.some((kept) => kept.id === personId)) return state;
          return {
            recents: withUser(state.recents, userId, (current) => ({
              ...current,
              people: current.people.filter((kept) => kept.id !== personId),
            })),
          };
        }),
      clearUser: (userId) =>
        set((state) => {
          if (!(userId in state.recents)) return state;
          const recents = { ...state.recents };
          delete recents[userId];
          return { recents };
        }),
    }),
    {
      name: 'recent-searches',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ recents: state.recents }),
      merge: (persisted, current) => {
        const stored = isObject(persisted) && isObject(persisted.recents) ? persisted.recents : {};
        const recents: RecentsState['recents'] = {};
        for (const [userId, value] of Object.entries(stored)) {
          const mine = parseRecents(value);
          if (mine && (mine.terms.length > 0 || mine.people.length > 0)) recents[userId] = mine;
        }
        // Anything saved in this session before the storage was read comes first.
        for (const [userId, mine] of Object.entries(current.recents)) {
          const older = recents[userId] ?? EMPTY;
          recents[userId] =
            parseRecents({
              terms: [...mine.terms, ...older.terms],
              people: [...mine.people, ...older.people],
            }) ?? mine;
        }
        return { ...current, recents };
      },
    },
  ),
);

/** The signed-in account's recents (none while signed out). */
export function useMyRecents(): UserRecents {
  const userId = useSession((state) => state.user?.id);
  return useRecentSearches((state) => (userId === undefined ? EMPTY : (state.recents[userId] ?? EMPTY)));
}

/**
 * Forgets an account's recents when it signs out on purpose (before the session is cleared) and
 * whenever the session ends, expiry included, as the composer drafts do. Returns the stop function.
 */
export function watchSessionForRecents(): () => void {
  const stopHook = registerBeforeSignOut(async () => {
    const id = useSession.getState().user?.id;
    if (id) useRecentSearches.getState().clearUser(id);
  });
  const stopWatch = useSession.subscribe((state, previous) => {
    if (previous.user && state.status === 'signedOut') {
      useRecentSearches.getState().clearUser(previous.user.id);
    }
  });
  return () => {
    stopHook();
    stopWatch();
  };
}
