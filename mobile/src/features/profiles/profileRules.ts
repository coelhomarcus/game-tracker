import { usernameError } from '@/features/auth/validation';
import { countCodePoints, countGraphemes } from '@/lib/graphemes';

import type { ProfileChanges } from './api';

/** Limits in graphemes (user-perceived characters), as the server counts them. */
export const NAME_MAX = 64;
export const BIO_MAX = 256;
/** The server also caps code points (4 per grapheme), so a few huge graphemes are refused too. */
export const NAME_MAX_CODE_POINTS = 256;
export const BIO_MAX_CODE_POINTS = 1024;
const TOO_MANY_SYMBOLS = 'Há símbolos combinados demais; encurte o texto';
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ProfileFields = { name: string; username: string; bio: string };
export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

function nameError(name: string): string | undefined {
  if (name.length === 0) return 'Informe seu nome';
  if (countGraphemes(name) > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres`;
  if (countCodePoints(name) > NAME_MAX_CODE_POINTS) return TOO_MANY_SYMBOLS;
  return undefined;
}

function bioError(bio: string): string | undefined {
  if (countGraphemes(bio) > BIO_MAX) return `Use no máximo ${BIO_MAX} caracteres`;
  if (countCodePoints(bio) > BIO_MAX_CODE_POINTS) return TOO_MANY_SYMBOLS;
  return undefined;
}

export function validateProfile(input: ProfileFields): ProfileErrors {
  const checks = {
    name: nameError(input.name.trim()),
    username: usernameError(input.username.trim()),
    bio: bioError(input.bio.trim()),
  };
  const errors: ProfileErrors = {};
  for (const [field, message] of Object.entries(checks)) {
    if (message) errors[field as keyof ProfileFields] = message;
  }
  return errors;
}

/** The fields whose trimmed value differs from the initial one; a blank bio is sent as `''`. */
export function profileChanges(initial: ProfileFields, current: ProfileFields): ProfileChanges {
  const changes: ProfileChanges = {};
  for (const field of ['name', 'username', 'bio'] as const) {
    const next = current[field].trim();
    if (next !== initial[field].trim()) changes[field] = next;
  }
  return changes;
}

/** A size that is not known cannot be refused here; the server enforces the limit too. */
export function exceedsImageLimit(size: number | null): boolean {
  return size !== null && size > MAX_IMAGE_BYTES;
}
