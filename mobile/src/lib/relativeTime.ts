const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const MS_PER_DAY = 24 * HOUR;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Calendar-day number of a local date, so DST shifts never skew the day difference. */
function localDayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/**
 * Relative time in Portuguese for instants (posts, comments). Up to 24 h it counts elapsed
 * time; after that it compares calendar days in local time.
 */
export function formatRelativeTime(at: Date, now: Date = new Date()): string {
  const diff = now.getTime() - at.getTime();

  if (diff < 45 * SECOND) return 'agora';
  if (diff < HOUR) return `há ${Math.min(59, Math.max(1, Math.floor(diff / MINUTE)))} min`;
  if (diff < 24 * HOUR) return `há ${Math.floor(diff / HOUR)} h`;

  const days = localDayNumber(now) - localDayNumber(at);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;

  const dayMonth = `${pad(at.getDate())}/${pad(at.getMonth() + 1)}`;
  return at.getFullYear() === now.getFullYear() ? dayMonth : `${dayMonth}/${at.getFullYear()}`;
}
