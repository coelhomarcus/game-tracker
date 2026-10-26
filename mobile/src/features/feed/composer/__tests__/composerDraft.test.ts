import AsyncStorage from '@react-native-async-storage/async-storage';

import { composerKind, draftHasContent, useComposerDrafts, type ComposerDraft } from '../composerDraft';

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

function makeDraft(overrides: Partial<ComposerDraft> = {}): ComposerDraft {
  return { text: 'Oi', link: null, entryId: null, quotedPostId: null, images: [], savedAt: 1, ...overrides };
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
    saveDraft('plain', makeDraft({ text: 'A' }));
    saveDraft('quote:p1', makeDraft({ text: 'B' }));

    clearDraft('plain');

    expect(useComposerDrafts.getState().drafts).toEqual({ 'quote:p1': makeDraft({ text: 'B' }) });
  });

  it('keeps drafts on the device', async () => {
    useComposerDrafts.getState().saveDraft('game:11', makeDraft({ link: { game } }));

    const stored = JSON.parse((await AsyncStorage.getItem('composer-drafts')) ?? '{}');
    expect(stored.state.drafts['game:11']).toMatchObject({ text: 'Oi', link: { game: { id: 'g1' } } });
  });

  it('drops stored drafts it cannot read and fills missing fields', async () => {
    useComposerDrafts.setState({ drafts: {} });
    await AsyncStorage.setItem(
      'composer-drafts',
      JSON.stringify({
        state: {
          drafts: {
            plain: { text: 'Antigo', images: [{ url: 'u', width: 1, height: 1 }, { url: 2 }] },
            'quote:p1': { text: 42 },
            'game:11': 'lixo',
          },
        },
        version: 0,
      }),
    );

    await useComposerDrafts.persist.rehydrate();

    expect(useComposerDrafts.getState().drafts).toEqual({
      plain: {
        text: 'Antigo',
        link: null,
        entryId: null,
        quotedPostId: null,
        images: [{ url: 'u', width: 1, height: 1 }],
        savedAt: 0,
      },
    });
  });
});
