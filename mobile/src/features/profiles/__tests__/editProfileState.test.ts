import {
  canRemove,
  canSave,
  completeStep,
  currentFields,
  editField,
  EMPTY_EDITS,
  fieldErrors,
  isDirty,
  pickImageEdit,
  previewUri,
  removeImageEdit,
  savePlan,
  type EditProfileState,
  type SavedProfile,
} from '../edit/editProfileState';
import type { PickedImage } from '../types';

const photo: PickedImage = { uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileName: 'a.jpg', size: 10 };
const other: PickedImage = { uri: 'file:///b.jpg', mimeType: 'image/jpeg', fileName: 'b.jpg', size: 10 };

const saved: SavedProfile = {
  fields: { name: 'Ana', username: 'ana', bio: 'Gosto de RPG' },
  images: { avatar: 'https://img.test/avatar.jpg', banner: null },
};

function withFields(fields: EditProfileState['fields']): EditProfileState {
  return { ...EMPTY_EDITS, fields };
}

describe('isDirty and canSave', () => {
  it.each<[string, EditProfileState, boolean]>([
    ['nothing edited', EMPTY_EDITS, false],
    ['a field typed back to its value', withFields({ name: 'Ana' }), false],
    ['only trailing spaces', withFields({ name: 'Ana  ', bio: ' Gosto de RPG\n' }), false],
    ['a changed name', withFields({ name: 'Ana Maria' }), true],
    ['a picked avatar', pickImageEdit(EMPTY_EDITS, 'avatar', photo), true],
    ['a removed avatar', removeImageEdit(EMPTY_EDITS, 'avatar'), true],
    // There is no banner to remove, so "removing" it changes nothing.
    ['a removal of an image that is not set', removeImageEdit(EMPTY_EDITS, 'banner'), false],
  ])('%s', (_label, state, dirty) => {
    expect(isDirty(state, saved)).toBe(dirty);
    expect(canSave(state, saved, false)).toBe(dirty);
  });

  it('never saves while saving', () => {
    expect(canSave(withFields({ name: 'Outro' }), saved, true)).toBe(false);
  });

  it.each<[string, EditProfileState['fields']]>([
    ['a name over 64 characters', { name: 'a'.repeat(65) }],
    ['a bio over 256 characters', { bio: 'a'.repeat(257) }],
    ['an empty name', { name: '   ' }],
    ['an invalid username', { username: 'a-b' }],
  ])('does not save %s', (_label, fields) => {
    const state = withFields(fields);
    expect(isDirty(state, saved)).toBe(true);
    expect(Object.keys(fieldErrors(state, saved))).toHaveLength(1);
    expect(canSave(state, saved, false)).toBe(false);
  });

  it('counts the limit in visible characters', () => {
    const state = withFields({ name: '👍🏽'.repeat(64) });
    expect(fieldErrors(state, saved)).toEqual({});
    expect(fieldErrors(withFields({ name: '👍🏽'.repeat(65) }), saved).name).toBe(
      'Use no máximo 64 caracteres',
    );
  });

  it('never blocks a save on a field the user did not touch', () => {
    const legacy: SavedProfile = { ...saved, fields: { ...saved.fields, name: 'a'.repeat(70) } };
    const state = withFields({ bio: 'Outra bio' });
    expect(fieldErrors(state, legacy)).toEqual({});
    expect(canSave(state, legacy, false)).toBe(true);
  });

  it('shows the saved values under the edits', () => {
    expect(currentFields(withFields({ bio: 'x' }), saved)).toEqual({
      name: 'Ana',
      username: 'ana',
      bio: 'x',
    });
  });
});

describe('image edits', () => {
  it('offers Remover only when the preview shows an image', () => {
    expect(canRemove(EMPTY_EDITS, saved, 'avatar')).toBe(true);
    expect(canRemove(EMPTY_EDITS, saved, 'banner')).toBe(false);
    expect(canRemove(pickImageEdit(EMPTY_EDITS, 'banner', photo), saved, 'banner')).toBe(true);
    expect(canRemove(removeImageEdit(EMPTY_EDITS, 'avatar'), saved, 'avatar')).toBe(false);
  });

  it('previews the picked file, nothing after a removal, or the saved URL', () => {
    expect(previewUri(EMPTY_EDITS, saved, 'avatar')).toBe('https://img.test/avatar.jpg');
    expect(previewUri(pickImageEdit(EMPTY_EDITS, 'avatar', photo), saved, 'avatar')).toBe(
      'file:///a.jpg',
    );
    expect(previewUri(removeImageEdit(EMPTY_EDITS, 'avatar'), saved, 'avatar')).toBeNull();
  });

  it('restores the saved image when a picked one that was never saved is removed', () => {
    const state = removeImageEdit(pickImageEdit(EMPTY_EDITS, 'avatar', photo), 'avatar');

    expect(previewUri(state, saved, 'avatar')).toBe('https://img.test/avatar.jpg');
    expect(isDirty(state, saved)).toBe(false);
    expect(savePlan(state, saved)).toEqual([]);
  });

  it('sends only the upload after removing and picking again', () => {
    const state = pickImageEdit(removeImageEdit(EMPTY_EDITS, 'avatar'), 'avatar', other);

    expect(savePlan(state, saved)).toEqual([{ type: 'upload', kind: 'avatar', image: other }]);
  });

  it('sends the latest pick after picking twice', () => {
    const state = pickImageEdit(pickImageEdit(EMPTY_EDITS, 'banner', photo), 'banner', other);

    expect(savePlan(state, saved)).toEqual([{ type: 'upload', kind: 'banner', image: other }]);
  });

  type Action = 'pick' | 'remove';
  it.each<[string, Action[], string | null, { type: string; kind: string }[]]>([
    ['pick → remove', ['pick', 'remove'], 'https://img.test/avatar.jpg', []],
    ['remove → pick', ['remove', 'pick'], 'file:///a.jpg', [{ type: 'upload', kind: 'avatar' }]],
    // The removal chosen before the pick comes back, not the image the user removed.
    ['remove → pick → remove', ['remove', 'pick', 'remove'], null, [{ type: 'remove', kind: 'avatar' }]],
    ['remove → pick → pick → remove', ['remove', 'pick', 'pick', 'remove'], null, [{ type: 'remove', kind: 'avatar' }]],
    ['pick → pick → remove', ['pick', 'pick', 'remove'], 'https://img.test/avatar.jpg', []],
    ['pick → remove → remove', ['pick', 'remove', 'remove'], null, [{ type: 'remove', kind: 'avatar' }]],
  ])('%s on a saved avatar', (_label, actions, preview, plan) => {
    let state = EMPTY_EDITS;
    for (const action of actions) {
      state =
        action === 'pick' ? pickImageEdit(state, 'avatar', photo) : removeImageEdit(state, 'avatar');
    }

    expect(previewUri(state, saved, 'avatar')).toBe(preview);
    expect(
      savePlan(state, saved).map((step) => ({ type: step.type, kind: 'kind' in step ? step.kind : null })),
    ).toEqual(plan);
    expect(canRemove(state, saved, 'avatar')).toBe(preview !== null);
  });

  it('empties an unset banner again when its pick is removed', () => {
    const state = removeImageEdit(pickImageEdit(EMPTY_EDITS, 'banner', photo), 'banner');

    expect(previewUri(state, saved, 'banner')).toBeNull();
    expect(isDirty(state, saved)).toBe(false);
    expect(savePlan(state, saved)).toEqual([]);
  });
});

describe('savePlan', () => {
  it('uploads first, then removes, then sends the trimmed changed fields', () => {
    const both: SavedProfile = { ...saved, images: { avatar: 'a', banner: 'b' } };
    let state = editField(EMPTY_EDITS, 'name', '  Ana Maria  ');
    state = editField(state, 'username', 'ana ');
    state = removeImageEdit(state, 'avatar');
    state = pickImageEdit(state, 'banner', photo);

    expect(savePlan(state, both)).toEqual([
      { type: 'upload', kind: 'banner', image: photo },
      { type: 'remove', kind: 'avatar' },
      { type: 'patch', changes: { name: 'Ana Maria' } },
    ]);
  });

  it('sends a blank bio as an empty string', () => {
    expect(savePlan(withFields({ bio: '   ' }), saved)).toEqual([
      { type: 'patch', changes: { bio: '' } },
    ]);
  });

  it('leaves the completed steps out on a retry', () => {
    let state = pickImageEdit(withFields({ name: 'Outro' }), 'avatar', photo);
    state = pickImageEdit(state, 'banner', other);
    const [first, second, patch] = savePlan(state, saved);

    // The avatar went through, then the banner failed: the retry starts at the banner.
    state = completeStep(state, first!);
    expect(savePlan(state, saved)).toEqual([second, patch]);

    // The banner went through, then the fields failed: only the fields are sent again.
    state = completeStep(state, second!);
    expect(savePlan(state, saved)).toEqual([patch]);

    state = completeStep(state, patch!);
    expect(savePlan(state, saved)).toEqual([]);
  });

  it('drops a removal once the server holds it', () => {
    const state = completeStep(removeImageEdit(EMPTY_EDITS, 'avatar'), {
      type: 'remove',
      kind: 'avatar',
    });
    const afterRemoval: SavedProfile = { ...saved, images: { avatar: null, banner: null } };

    expect(savePlan(state, afterRemoval)).toEqual([]);
    expect(isDirty(state, afterRemoval)).toBe(false);
  });

  it('keeps an edit typed after the fields were sent', () => {
    const state = completeStep(withFields({ name: 'Mais novo', bio: 'Outra ' }), {
      type: 'patch',
      changes: { name: 'Novo', bio: 'Outra' },
    });

    expect(state.fields).toEqual({ name: 'Mais novo' });
  });
});
