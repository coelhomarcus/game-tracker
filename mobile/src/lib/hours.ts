import { type DateOnly, daysThrough } from './dateOnly';

export const MAX_HOURS = 99999;

const HOURS_PATTERN = /^\d+(\.\d+)?$/;

/** Parses user input such as `12,5` or `12.5` into hours rounded to one decimal; null if invalid. */
export function parseHours(input: string): number | null {
  const text = input.trim().replace(',', '.');
  if (!HOURS_PATTERN.test(text)) return null;
  return Math.round(Number(text) * 10) / 10;
}

/** One decimal with a comma, e.g. `20,0`. */
export function formatHours(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** Text for an input field: `20` for whole numbers, otherwise `12,5`. */
export function hoursInputText(value: number): string {
  return Number.isInteger(value) ? String(value) : formatHours(value);
}

/** Upper bound of hours that fit between the start and end (or today) dates, 24 per day. */
export function maxPlausibleHours(
  start: DateOnly | null,
  end: DateOnly | null,
  today: DateOnly,
): number {
  if (!start) return MAX_HOURS;
  const days = daysThrough(start, end ?? today);
  if (days <= 0) return MAX_HOURS;
  return Math.min(days * 24, MAX_HOURS);
}
