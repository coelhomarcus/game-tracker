import AsyncStorage from '@react-native-async-storage/async-storage';

import { registerBeforeSignOut, useSession } from '@/features/auth';
import { sessionManager } from '@/features/auth/client';

import {
  RECENT_LIMIT,
  useRecentSearches,
  watchSessionForRecents,
  type RecentPerson,
} from '../recentSearches';

function person(id: string, overrides: Partial<RecentPerson> = {}): RecentPerson {
  return { id, username: id, name: null, avatarUrl: null, ...overrides };
}

const store = () => useRecentSearches.getState();

beforeEach(async () => {
  await AsyncStorage.clear();
  useRecentSearches.setState({ recents: {} });
  await useRecentSearches.persist.rehydrate();
});

describe('useRecentSearches', () => {
  it('puts the newest term first and ignores blank ones', () => {
    store().addTerm('ana', 'hades');
    store().addTerm('ana', '  celeste  ');
    store().addTerm('ana', '   ');

    expect(store().recents.ana.terms).toEqual(['celeste', 'hades']);
  });

  it('keeps one copy of a term whatever its case, moved to the top with the new spelling', () => {
    store().addTerm('ana', 'Hades');
    store().addTerm('ana', 'celeste');
    store().addTerm('ana', 'hADES');

    expect(store().recents.ana.terms).toEqual(['hADES', 'celeste']);
  });

  it('keeps at most 10 terms, dropping the oldest', () => {
    for (let index = 0; index < RECENT_LIMIT + 2; index += 1) store().addTerm('ana', `termo ${index}`);

    const { terms } = store().recents.ana;
    expect(RECENT_LIMIT).toBe(10);
    expect(terms).toHaveLength(10);
    expect(terms[0]).toBe('termo 11');
    expect(terms).not.toContain('termo 0');
    expect(terms).not.toContain('termo 1');
  });

  it('keeps one copy of a person, newest first, at most 10', () => {
    store().addPerson('ana', person('u1'));
    store().addPerson('ana', person('u2'));
    store().addPerson('ana', person('u1', { name: 'Novo nome' }));

    expect(store().recents.ana.people.map((p) => p.id)).toEqual(['u1', 'u2']);
    expect(store().recents.ana.people[0].name).toBe('Novo nome');

    for (let index = 3; index <= 12; index += 1) store().addPerson('ana', person(`u${index}`));
    const ids = store().recents.ana.people.map((p) => p.id);
    expect(ids).toHaveLength(10);
    expect(ids[0]).toBe('u12');
    expect(ids).not.toContain('u1');
    expect(ids).not.toContain('u2');
  });

  it('stores only the fields the row needs', () => {
    store().addPerson('ana', { ...person('u1'), bio: 'longa', isFollowedByMe: true } as RecentPerson);

    expect(store().recents.ana.people[0]).toEqual(person('u1'));
  });

  it('removes one term (any case) or one person and keeps the rest', () => {
    store().addTerm('ana', 'hades');
    store().addTerm('ana', 'celeste');
    store().addPerson('ana', person('u1'));
    store().addPerson('ana', person('u2'));

    store().removeTerm('ana', 'HADES');
    store().removePerson('ana', 'u2');

    expect(store().recents.ana).toEqual({ terms: ['celeste'], people: [person('u1')] });
  });

  it("keeps each account's recents apart", () => {
    store().addTerm('ana', 'hades');
    store().addPerson('bia', person('u1'));
    store().removeTerm('bia', 'hades');

    expect(store().recents).toEqual({
      ana: { terms: ['hades'], people: [] },
      bia: { terms: [], people: [person('u1')] },
    });

    store().clearUser('ana');
    expect(Object.keys(store().recents)).toEqual(['bia']);
  });

  it('keeps recents on the device and reads back only valid entries', async () => {
    store().addTerm('ana', 'hades');
    const stored = JSON.parse((await AsyncStorage.getItem('recent-searches')) ?? '{}');
    expect(stored.state.recents.ana.terms).toEqual(['hades']);

    // Emptied first: the store writes itself back to the storage on every change.
    useRecentSearches.setState({ recents: {} });
    await AsyncStorage.setItem(
      'recent-searches',
      JSON.stringify({
        state: {
          recents: {
            ana: {
              terms: ['hades', 'HADES', 42, ' ', ' Celeste', 'celeste ', 'Zelda'],
              people: [person('u1'), { id: 'u2' }, person('u1'), 'lixo'],
            },
            bia: 'lixo',
          },
        },
        version: 0,
      }),
    );
    await useRecentSearches.persist.rehydrate();

    expect(store().recents).toEqual({
      ana: { terms: ['hades', 'Celeste', 'Zelda'], people: [person('u1')] },
    });
  });
});

describe('recents and the session', () => {
  const ana = {
    id: 'ana',
    username: 'ana',
    name: 'Ana',
    email: 'a@x.com',
    avatarUrl: null,
    bannerUrl: null,
    bio: null,
    dmPolicy: 'everyone' as const,
  };
  let stop: () => void;

  beforeEach(() => {
    useSession.setState({ status: 'signedIn', user: ana });
    store().addTerm('ana', 'hades');
    store().addTerm('bia', 'celeste');
    stop = watchSessionForRecents();
  });

  afterEach(() => {
    stop();
    useSession.setState({ status: 'signedOut', user: null });
  });

  it("clears the account's recents, and only its own, when the session ends", () => {
    useSession.setState({ status: 'signedOut', user: null });

    expect(Object.keys(store().recents)).toEqual(['bia']);
  });

  it('clears them on a sign-out the user asked for', async () => {
    jest.spyOn(sessionManager, 'clear').mockResolvedValue(null);
    const unregister = registerBeforeSignOut(async () => undefined);

    await useSession.getState().signOut();
    unregister();

    expect(Object.keys(store().recents)).toEqual(['bia']);
  });

  it('keeps them while the session stays, and stops watching once stopped', () => {
    useSession.setState({ status: 'signedIn', user: { ...ana, name: 'Ana Souza' } });
    expect(Object.keys(store().recents).sort()).toEqual(['ana', 'bia']);

    stop();
    useSession.setState({ status: 'signedOut', user: null });
    expect(Object.keys(store().recents).sort()).toEqual(['ana', 'bia']);
  });
});
