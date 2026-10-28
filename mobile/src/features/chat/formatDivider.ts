import { localDayNumber, pad, WEEKDAYS } from './formatConversationTime';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * The date divider between messages: "Hoje às 15:41", "Ontem às 09:02", the weekday within the
 * last 7 days ("Segunda às 15:41") and the full date before that ("12 de out de 2026 às 15:41").
 * Local time; a time ahead of the clock counts as today.
 */
export function formatDivider(at: Date, now: Date = new Date()): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = localDayNumber(now) - localDayNumber(at);
  if (days <= 0) return `Hoje às ${time}`;
  if (days === 1) return `Ontem às ${time}`;
  if (days < 7) return `${WEEKDAYS[at.getDay()]} às ${time}`;
  return `${at.getDate()} de ${MONTHS[at.getMonth()]} de ${at.getFullYear()} às ${time}`;
}
