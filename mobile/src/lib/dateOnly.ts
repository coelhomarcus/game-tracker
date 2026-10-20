export type DateOnly = { year: number; month: number; day: number };

const API_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;
const DISPLAY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function utcMs(d: DateOnly): number {
  return Date.UTC(d.year, d.month - 1, d.day);
}

/**
 * Reads the calendar date from `YYYY-MM-DD` or an ISO timestamp. The backend emits progress
 * dates as UTC midnight instants, so the date part is read as-is, never shifted to local time.
 */
export function parseApiDate(value: string): DateOnly {
  const match = API_DATE.exec(value);
  if (!match) throw new Error(`Invalid API date: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function toApiDate(d: DateOnly): string {
  return `${pad(d.year, 4)}-${pad(d.month, 2)}-${pad(d.day, 2)}`;
}

/** `dd/mm/aaaa`. */
export function formatDate(d: DateOnly): string {
  return `${pad(d.day, 2)}/${pad(d.month, 2)}/${pad(d.year, 4)}`;
}

/** Parses `dd/mm/aaaa`; returns null for malformed text or dates that do not exist. */
export function parseDisplayDate(text: string): DateOnly | null {
  const match = DISPLAY_DATE.exec(text.trim());
  if (!match) return null;
  const date = { year: Number(match[3]), month: Number(match[2]), day: Number(match[1]) };
  const check = new Date(utcMs(date));
  if (
    check.getUTCFullYear() !== date.year ||
    check.getUTCMonth() !== date.month - 1 ||
    check.getUTCDate() !== date.day
  ) {
    return null;
  }
  return date;
}

/** The local calendar day. */
export function todayDate(now: Date = new Date()): DateOnly {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function compareDates(a: DateOnly, b: DateOnly): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

/** Calendar days from `start` to `end`, counting both ends (1 when equal, <= 0 when reversed). */
export function daysThrough(start: DateOnly, end: DateOnly): number {
  return Math.round((utcMs(end) - utcMs(start)) / MS_PER_DAY) + 1;
}
