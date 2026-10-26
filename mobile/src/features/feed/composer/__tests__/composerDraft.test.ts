import AsyncStorage from '@react-native-async-storage/async-storage';

import { registerBeforeSignOut, useSession } from '@/features/auth';
import { sessionManager } from '@/features/auth/client';

import {
  composerKind,
  DRAFT_MAX_AGE_MS,
  draftHasContent,
  findDraft,
  useComposerDrafts,
  watchSessionForDrafts,
  type ComposerDraft,
} from '../composerDraft';

const game = {
  id: 'g1',
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  summary: null,
  screenshots: [],
  platforms: ['PC'],
  genres: [],
  isFavoritedByMe: false,
};

const SAVED_AT = Date.now();

function makeDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return { text: 'Oi', link: null, entryId: null, quotedPostId: null, images: [], savedAt: SAVED_AT, ...overrides };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useComposerDrafts.setState({ drafts: {} });
  await useComposerDrafts.persist.rehydrate();
});

describe('composerKind', () => {
  it('names a plain post, a quote and a post from a game page apart', () => {
    expect(composerKind({ quoteId: null, igdbId: null })).toBe('plain');
    expect(composerKind({ quoteId: 'p1', igdbId: null })).toBe('quote:p1');
    expect(composerKind({ quoteId: null, igdbId: 11 })).toBe('game:11');
    expect(composerKind({ quoteId: 'p1', igdbId: 11 })).toBe('quote:p1');
  });
});

describe('draftHasContent', () => {
  it('counts text, images and a chosen game, not blank text or a removed link', () => {
    expect(draftHasContent(makeDraft())).toBe(true);
    expect(draftHasContent(makeDraft({ text: ' \n ' }))).toBe(false);
    expect(draftHasContent(makeDraft({ text: '', link: { game } }))).toBe(true);
    expect(draftHasContent(makeDraft({ text: '', link: { game: null } }))).toBe(false);
    expect(
      draftHasContent(makeDraft({ text: '', images: [{ url: 'https://x/i.jpg', width: 1, height: 1 }] })),
    ).toBe(true);
  });
});

describe('useComposerDrafts', () => {
  it('saves and clears one kind without touching the others', () => {
    const { saveDraft, clearDraft } = useComposerDrafts.getState();
    saveDraft('ana', 'plain', makeDraft({ text: 'A' }));
    saveDraft('ana', 'quote:p1', makeDraft({ text: 'B' }));

    clearDraft('ana', 'plain');

    expect(useComposerDrafts.getState().drafts).toEqual({ ana: { 'quote:p1': makeDraft({ text: 'B' }) } });
  });

  it("keeps one account's drafts apart from another's", () => {
    const { saveDraft, clearDraft, clearUser } = useComposerDrafts.getState();
    saveDraft('ana', 'plain', makeDraft({ text: 'Da Ana' }));
    saveDraft('bia', 'plain', makeDraft({ text: 'Da Bia' }));

    const { drafts } = useComposerDrafts.getState();
    expect(findDraft(drafts, 'ana', 'plain')?.text).toBe('Da Ana');
    expect(findDraft(drafts, 'bia', 'plain')?.text).toBe('Da Bia');
    expect(findDraft(drafts, 'cae', 'plain')).toBeNull();

    clearDraft('ana', 'plain');
    expect(useComposerDrafts.getState().drafts).toEqual({ bia: { plain: makeDraft({ text: 'Da Bia' }) } });
    saveDraft('ana', 'plain', makeDraft());
    clearUser('ana');
    expect(Object.keys(useComposerDrafts.getState().drafts)).toEqual(['bia']);
  });

  it('keeps drafts on the device', async () => {
    useComposerDrafts.getState().saveDraft('ana', 'game:11', makeDraft({ link: { game } }));

    const stored = JSON.parse((await AsyncStorage.getItem('composer-drafts')) ?? '{}');
    expect(stored.state.drafts.ana['game:11']).toMatchObject({ text: 'Oi', link: { game: { id: 'g1' } } });
  });

  it('drops stored drafts it cannot read and fills missing fields', async () => {
    const savedAt = Date.now();
    await AsyncStorage.setItem(
      'composer-drafts',
      JSON.stringify({
        state: {
          drafts: {
            ana: {
              plain: { text: 'Antigo', savedAt, images: [{ url: 'u', width: 1, height: 1 }, { url: 2 }] },
              'quote:p1': { text: 42 },
              'game:11': 'lixo',
            },
            bia: 'lixo',
          },
        },
        version: 0,
      }),
    );

    await useComposerDrafts.persist.rehydrate();

    expect(useComposerDrafts.getState().drafts).toEqual({
      ana: {
        plain: {
          text: 'Antigo',
          link: null,
          entryId: null,
          quotedPostId: null,
          images: [{ url: 'u', width: 1, height: 1 }],
          savedAt,
        },
      },
    });
  });

  it('forgets the one-list-per-device drafts of the older build', async () => {
    await AsyncStorage.setItem(
      'composer-drafts',
      JSON.stringify({
        state: { drafts: { plain: { text: 'Sem dono', savedAt: Date.now() } } },
        version: 0,
      }),
    );

    await useComposerDrafts.persist.rehydrate();

    expect(useComposerDrafts.getState().drafts).toEqual({});
  });
});

describe('draft age', () => {
  it('restores a draft up to 7 days old and no older', () => {
    const now = 1_000_000_000_000;
    const at = (age: number) => ({ ana: { plain: makeDraft({ savedAt: now - age }) } });

    expect(findDraft(at(DRAFT_MAX_AGE_MS), 'ana', 'plain', now)).not.toBeNull();
    expect(findDraft(at(DRAFT_MAX_AGE_MS + 1), 'ana', 'plain', now)).toBeNull();
  });

  it('drops drafts older than 7 days when the stored ones are read', async () => {
    const day = 24 * 60 * 60 * 1000;
    const stored = (age: number) => ({ ...makeDraft(), savedAt: Date.now() - age });
    await AsyncStorage.setItem(
      'composer-drafts',
      JSON.stringify({
        state: { drafts: { ana: { plain: stored(8 * day), 'quote:p1': stored(6 * day) }, bia: { plain: stored(30 * day) } } },
        version: 0,
      }),
    );

    await useComposerDrafts.persist.rehydrate();

    const { drafts } = useComposerDrafts.getState();
    expect(Object.keys(drafts)).toEqual(['ana']);
    expect(Object.keys(drafts.ana ?? {})).toEqual(['quote:p1']);
  });
});

describe('drafts and the session', () => {
  const ana = { id: 'ana', username: 'ana', name: 'Ana', email: 'a@x.com', avatarUrl: null, bannerUrl: null, bio: null };
  let stop: () => void;

  beforeEach(() => {
    useSession.setState({ status: 'signedIn', user: ana });
    useComposerDrafts.getState().saveDraft('ana', 'plain', makeDraft());
    useComposerDrafts.getState().saveDraft('bia', 'plain', makeDraft());
    stop = watchSessionForDrafts();
  });

  afterEach(() => {
    stop();
    useSession.setState({ status: 'signedOut', user: null });
  });

  it("clears the account's drafts, and only its own, when the session ends", () => {
    useSession.setState({ status: 'signedOut', user: null });

    expect(Object.keys(useComposerDrafts.getState().drafts)).toEqual(['bia']);
  });

  it('clears them on a sign-out the user asked for, before the session is cleared', async () => {
    jest.spyOn(sessionManager, 'clear').mockResolvedValue(null);
    const seen: string[][] = [];
    const unregister = registerBeforeSignOut(async () => {
      seen.push(Object.keys(useComposerDrafts.getState().drafts));
    });

    await useSession.getState().signOut();
    unregister();

    // The watcher's hook ran before this one reads (hooks run together), so ana was already gone
    // or going; either way nothing of ana's is left once the sign-out is over.
    expect(Object.keys(useComposerDrafts.getState().drafts)).toEqual(['bia']);
    expect(seen).toHaveLength(1);
  });

  it('keeps them while the session stays', () => {
    useSession.setState({ status: 'signedIn', user: { ...ana, name: 'Ana Souza' } });

    expect(Object.keys(useComposerDrafts.getState().drafts).sort()).toEqual(['ana', 'bia']);
  });

  it('stops watching once stopped', () => {
    stop();
    useSession.setState({ status: 'signedOut', user: null });

    expect(Object.keys(useComposerDrafts.getState().drafts).sort()).toEqual(['ana', 'bia']);
  });
});
