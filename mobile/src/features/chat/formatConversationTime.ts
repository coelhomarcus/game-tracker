const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Calendar-day number of a local date, so DST shifts never skew the day difference. */
export function localDayNumber(date: Date): number {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
}

/**
 * When a conversation's last message came, for the list: "15:41" today, "Ontem", the weekday
 * within the last 7 days ("Segunda") and the date ("12/10") before that. Local time; a time
 * ahead of the clock counts as today.
 */
export function formatConversationTime(at: Date, now: Date = new Date()): string {
  const days = localDayNumber(now) - localDayNumber(at);
  if (days <= 0) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  if (days === 1) return 'Ontem';
  if (days < 7) return WEEKDAYS[at.getDay()];
  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)}`;
}
