import { usernameError } from '@/features/auth/validation';

import type { ProfileChanges } from './api';

export const NAME_MAX = 50;
export const BIO_MAX = 280;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ProfileFields = { name: string; username: string; bio: string };
export type ProfileErrors = Partial<Record<keyof ProfileFields, string>>;

function nameError(name: string): string | undefined {
  if (name.length === 0) return 'Informe seu nome';
  if (name.length > NAME_MAX) return 'Use no máximo 50 caracteres';
  return undefined;
}

function bioError(bio: string): string | undefined {
  return bio.length > BIO_MAX ? 'Use no máximo 280 caracteres' : undefined;
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
