import type { Game } from '@/features/games/types';
import { compareDates, formatDate, parseDisplayDate, type DateOnly } from '@/lib/dateOnly';
import { MAX_HOURS, formatHours, hoursInputText, maxPlausibleHours, parseHours } from '@/lib/hours';
import type { GameStatus } from '@/theme/tokens';

import type { EntryDraft, GameEntry } from './types';

export const MAX_NOTES_LENGTH = 2000;

/** Dates and hours are kept as typed text until the form is validated. */
export type FormValues = {
  status: GameStatus;
  platform: string;
  startedAt: string;
  finishedAt: string;
  hours: string;
  rating: number | null;
  notes: string;
};

export type FormField = 'platform' | 'startedAt' | 'finishedAt' | 'hours' | 'notes';
export type FormErrors = Partial<Record<FormField, string>>;

export function initialValues(game: Game, entry?: GameEntry): FormValues {
  if (entry) {
    return {
      status: entry.status,
      platform: entry.platform,
      startedAt: entry.startedAt ? formatDate(entry.startedAt) : '',
      finishedAt: entry.finishedAt ? formatDate(entry.finishedAt) : '',
      hours: entry.hoursPlayed === null ? '' : hoursInputText(entry.hoursPlayed),
      rating: entry.rating,
      notes: entry.notes ?? '',
    };
  }
  return {
    status: 'backlog',
    platform: game.platforms.length === 1 ? game.platforms[0] : '',
    startedAt: '',
    finishedAt: '',
    hours: '',
    rating: null,
    notes: '',
  };
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

function hoursError(text: string, start: DateOnly | null, end: DateOnly | null, today: DateOnly) {
  const value = parseHours(text);
  if (value === null) return 'Use só números, como 12 ou 12,5.';
  if (value > MAX_HOURS) return `O máximo é ${formatHours(MAX_HOURS)} horas.`;
  const ceiling = Math.floor(maxPlausibleHours(start, end, today));
  if (value > ceiling) {
    const span = end ? 'entre início e fim' : 'entre o início e hoje';
    return `Isso passa das ${ceiling} h possíveis ${span}. Confira as datas.`;
  }
  return undefined;
}

export function validate(v: FormValues, today: DateOnly): FormErrors {
  const errors: FormErrors = {};

  if (isBlank(v.platform)) errors.platform = 'Informe a plataforma';

  const start = isBlank(v.startedAt) ? null : parseDisplayDate(v.startedAt);
  const end = isBlank(v.finishedAt) ? null : parseDisplayDate(v.finishedAt);
  const dateFormat = 'Use o formato dd/mm/aaaa.';
  const badStart = !isBlank(v.startedAt) && !start;
  const badEnd = !isBlank(v.finishedAt) && !end;
  if (badStart) errors.startedAt = dateFormat;
  if (badEnd) errors.finishedAt = dateFormat;
  if (start && end && compareDates(start, end) > 0) {
    errors.finishedAt = 'O fim não pode ser antes do início.';
  }

  if (!isBlank(v.hours)) {
    const datesOk = !badStart && !badEnd;
    const error = hoursError(v.hours, datesOk ? start : null, datesOk ? end : null, today);
    if (error) errors.hours = error;
  }

  if (v.notes.trim().length > MAX_NOTES_LENGTH) {
    errors.notes = `Use no máximo ${MAX_NOTES_LENGTH} caracteres.`;
  }

  return errors;
}

/** Builds the API payload. Call it only with values that passed `validate`. */
export function toDraft(v: FormValues): EntryDraft {
  const notes = v.notes.trim();
  return {
    platform: v.platform.trim(),
    status: v.status,
    startedAt: isBlank(v.startedAt) ? null : parseDisplayDate(v.startedAt),
    finishedAt: isBlank(v.finishedAt) ? null : parseDisplayDate(v.finishedAt),
    hoursPlayed: isBlank(v.hours) ? null : parseHours(v.hours),
    rating: v.rating,
    notes: notes === '' ? null : notes,
  };
}

export function isDirty(initial: FormValues, current: FormValues): boolean {
  return (
    initial.status !== current.status ||
    initial.rating !== current.rating ||
    initial.platform.trim() !== current.platform.trim() ||
    initial.startedAt.trim() !== current.startedAt.trim() ||
    initial.finishedAt.trim() !== current.finishedAt.trim() ||
    initial.hours.trim() !== current.hours.trim() ||
    initial.notes.trim() !== current.notes.trim()
  );
}
