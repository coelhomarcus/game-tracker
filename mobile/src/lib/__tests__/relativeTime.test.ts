import { formatFullDate, formatRelativeTime, formatShortRelativeTime } from '../relativeTime';

// Local-time constructors keep the calendar-day rules independent of the machine time zone.
const now = new Date(2026, 9, 20, 12, 0, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe('formatRelativeTime', () => {
  it('says agora below 45 seconds and for future instants', () => {
    expect(formatRelativeTime(ago(0), now)).toBe('agora');
    expect(formatRelativeTime(ago(44 * SECOND), now)).toBe('agora');
    expect(formatRelativeTime(ago(-5 * MINUTE), now)).toBe('agora');
  });

  it('switches to minutes at 45 seconds and never shows 0 min', () => {
    expect(formatRelativeTime(ago(45 * SECOND), now)).toBe('há 1 min');
    expect(formatRelativeTime(ago(59 * MINUTE + 59 * SECOND), now)).toBe('há 59 min');
  });

  it('shows whole hours up to 23 h', () => {
    expect(formatRelativeTime(ago(60 * MINUTE), now)).toBe('há 1 h');
    expect(formatRelativeTime(ago(23 * HOUR + 59 * MINUTE), now)).toBe('há 23 h');
  });

  it('uses calendar days from 24 h: ontem is the previous calendar day', () => {
    const early = new Date(2026, 9, 20, 0, 1);
    expect(formatRelativeTime(new Date(2026, 9, 19, 0, 1), early)).toBe('ontem');
    // 24 h 2 min apart, but two calendar days.
    expect(formatRelativeTime(new Date(2026, 9, 18, 23, 59), early)).toBe('há 2 dias');
    // Almost 48 h apart, but still the previous calendar day.
    expect(formatRelativeTime(new Date(2026, 9, 19, 0, 1), new Date(2026, 9, 20, 23, 59))).toBe(
      'ontem',
    );
  });

  it('shows há <n> dias up to 6 days', () => {
    expect(formatRelativeTime(new Date(2026, 9, 14, 12, 0), now)).toBe('há 6 dias');
    expect(formatRelativeTime(new Date(2026, 9, 17, 12, 0), now)).toBe('há 3 dias');
  });

  it('shows dd/mm from 7 days within the same year', () => {
    expect(formatRelativeTime(new Date(2026, 9, 13, 12, 0), now)).toBe('13/10');
    expect(formatRelativeTime(new Date(2026, 0, 5, 9, 0), now)).toBe('05/01');
  });

  it('shows dd/mm/aaaa for a previous year', () => {
    expect(formatRelativeTime(new Date(2025, 11, 31, 23, 0), now)).toBe('31/12/2025');
  });

  it('defaults now to the current time', () => {
    expect(formatRelativeTime(new Date())).toBe('agora');
  });
});

describe('formatFullDate', () => {
  it('writes the local day, short month, year and time', () => {
    expect(formatFullDate(new Date(2026, 9, 26, 14, 5))).toBe('26 de out de 2026 às 14:05');
  });

  it('pads the time but not the day', () => {
    expect(formatFullDate(new Date(2027, 0, 3, 9, 0))).toBe('3 de jan de 2027 às 09:00');
    expect(formatFullDate(new Date(2026, 11, 31, 0, 59))).toBe('31 de dez de 2026 às 00:59');
  });
});

describe('formatShortRelativeTime', () => {
  it('counts minutes and hours without "há"', () => {
    expect(formatShortRelativeTime(ago(10 * SECOND), now)).toBe('agora');
    expect(formatShortRelativeTime(ago(45 * SECOND), now)).toBe('1 min');
    expect(formatShortRelativeTime(ago(5 * MINUTE), now)).toBe('5 min');
    expect(formatShortRelativeTime(ago(2 * HOUR), now)).toBe('2 h');
    expect(formatShortRelativeTime(ago(23 * HOUR + 59 * MINUTE), now)).toBe('23 h');
  });

  it('says Ontem for the previous calendar day past 24 h, then the day and month', () => {
    const early = new Date(2026, 9, 20, 0, 1);
    expect(formatShortRelativeTime(new Date(2026, 9, 19, 0, 0), early)).toBe('Ontem');
    expect(formatShortRelativeTime(new Date(2026, 9, 18, 23, 0), early)).toBe('18 out');
    expect(formatShortRelativeTime(new Date(2026, 9, 12, 9, 0), now)).toBe('12 out');
  });

  it('adds the year outside the current one', () => {
    expect(formatShortRelativeTime(new Date(2025, 11, 3, 9, 0), now)).toBe('3 dez 2025');
  });
});
