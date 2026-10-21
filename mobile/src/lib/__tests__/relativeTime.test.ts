import { formatRelativeTime } from '../relativeTime';

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
