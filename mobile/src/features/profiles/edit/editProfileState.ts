import type { ProfileChanges } from '../api';
import {
  profileChanges,
  validateProfile,
  type ProfileErrors,
  type ProfileFields,
} from '../profileRules';
import type { ImageKind, PickedImage } from '../types';

export const IMAGE_KINDS = ['avatar', 'banner'] as const satisfies readonly ImageKind[];

/** What the sheet does with one image when saving: keep it, send a new one, or remove it. */
export type ImageEdit = { kind: 'saved' } | { kind: 'picked'; image: PickedImage } | { kind: 'removed' };

/**
 * The sheet's edits. `fields` holds only what the user typed: a field they never touched follows
 * the profile as it loads (or as a save updates it).
 */
export type EditProfileState = {
  fields: Partial<ProfileFields>;
  images: Record<ImageKind, ImageEdit>;
};

/** What the server holds: the fields and each image's URL (null when none is set). */
export type SavedProfile = {
  fields: ProfileFields;
  images: Record<ImageKind, string | null>;
};

/** One request of a save, in the order `savePlan` gives them. */
export type SaveStep =
  | { type: 'upload'; kind: ImageKind; image: PickedImage }
  | { type: 'remove'; kind: ImageKind }
  | { type: 'patch'; changes: ProfileChanges };

const SAVED: ImageEdit = { kind: 'saved' };

export const EMPTY_EDITS: EditProfileState = {
  fields: {},
  images: { avatar: SAVED, banner: SAVED },
};

/** The fields as the sheet shows them. */
export function currentFields(state: EditProfileState, saved: SavedProfile): ProfileFields {
  return { ...saved.fields, ...state.fields };
}

/** The fields to send: those whose trimmed value differs from the saved one. */
export function fieldChanges(state: EditProfileState, saved: SavedProfile): ProfileChanges {
  return profileChanges(saved.fields, currentFields(state, saved));
}

/** Whether saving would change the image: a removal of an image that is not set changes nothing. */
function imageChanges(edit: ImageEdit, savedUrl: string | null): boolean {
  if (edit.kind === 'picked') return true;
  return edit.kind === 'removed' && savedUrl !== null;
}

export function isDirty(state: EditProfileState, saved: SavedProfile): boolean {
  return (
    Object.keys(fieldChanges(state, saved)).length > 0 ||
    IMAGE_KINDS.some((kind) => imageChanges(state.images[kind], saved.images[kind]))
  );
}

/** The problems of the changed fields only: a field the user did not touch never blocks a save. */
export function fieldErrors(state: EditProfileState, saved: SavedProfile): ProfileErrors {
  const found = validateProfile(currentFields(state, saved));
  const errors: ProfileErrors = {};
  for (const field of Object.keys(fieldChanges(state, saved)) as (keyof ProfileFields)[]) {
    if (found[field]) errors[field] = found[field];
  }
  return errors;
}

/** Something changed, nothing is being sent, and every changed field is valid. */
export function canSave(state: EditProfileState, saved: SavedProfile, saving: boolean): boolean {
  return (
    !saving && isDirty(state, saved) && Object.keys(fieldErrors(state, saved)).length === 0
  );
}

/** The requests that bring the server to the sheet's state: uploads, then removals, then the fields. */
export function savePlan(state: EditProfileState, saved: SavedProfile): SaveStep[] {
  const steps: SaveStep[] = [];
  for (const kind of IMAGE_KINDS) {
    const edit = state.images[kind];
    if (edit.kind === 'picked') steps.push({ type: 'upload', kind, image: edit.image });
  }
  for (const kind of IMAGE_KINDS) {
    if (state.images[kind].kind === 'removed' && saved.images[kind] !== null) {
      steps.push({ type: 'remove', kind });
    }
  }
  const changes = fieldChanges(state, saved);
  if (Object.keys(changes).length > 0) steps.push({ type: 'patch', changes });
  return steps;
}

/**
 * The state once the server accepted `step`: the image is the saved one now, and the sent fields
 * are no longer edits. A later plan leaves the step out, so a retry never sends it again.
 */
export function completeStep(state: EditProfileState, step: SaveStep): EditProfileState {
  if (step.type !== 'patch') {
    return { ...state, images: { ...state.images, [step.kind]: SAVED } };
  }
  const fields = { ...state.fields };
  for (const field of Object.keys(step.changes) as (keyof ProfileFields)[]) {
    // Only an edit that still matches what was sent; a newer one is kept.
    if (fields[field]?.trim() === step.changes[field]) delete fields[field];
  }
  return { ...state, fields };
}

export function editField(
  state: EditProfileState,
  field: keyof ProfileFields,
  value: string,
): EditProfileState {
  return { ...state, fields: { ...state.fields, [field]: value } };
}

/** A new image for `kind`, sent on save; it replaces a pending removal. */
export function pickImageEdit(
  state: EditProfileState,
  kind: ImageKind,
  image: PickedImage,
): EditProfileState {
  return { ...state, images: { ...state.images, [kind]: { kind: 'picked', image } } };
}

/**
 * "Remover": a picked image that was never saved is dropped, and the saved one shows again; a
 * saved image is marked for removal.
 */
export function removeImageEdit(state: EditProfileState, kind: ImageKind): EditProfileState {
  const edit = state.images[kind];
  const next: ImageEdit = edit.kind === 'picked' ? SAVED : { kind: 'removed' };
  return { ...state, images: { ...state.images, [kind]: next } };
}

/** "Remover" is offered only when the preview shows an image. */
export function canRemove(state: EditProfileState, saved: SavedProfile, kind: ImageKind): boolean {
  return previewUri(state, saved, kind) !== null;
}

/** What the preview shows: the picked file, nothing after a removal, or the saved URL. */
export function previewUri(
  state: EditProfileState,
  saved: SavedProfile,
  kind: ImageKind,
): string | null {
  const edit = state.images[kind];
  if (edit.kind === 'picked') return edit.image.uri;
  if (edit.kind === 'removed') return null;
  return saved.images[kind];
}
