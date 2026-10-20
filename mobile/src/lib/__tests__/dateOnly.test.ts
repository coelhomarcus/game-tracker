import {
  compareDates,
  daysThrough,
  formatDate,
  parseApiDate,
  parseDisplayDate,
  toApiDate,
  todayDate,
} from '../dateOnly';

describe('dateOnly', () => {
  it('parses plain and timestamp API dates using the date part', () => {
    expect(parseApiDate('2026-03-05')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseApiDate('2026-03-05T00:00:00.000Z')).toEqual({ year: 2026, month: 3, day: 5 });
  });

  it('round-trips through toApiDate', () => {
    expect(toApiDate(parseApiDate('2026-03-05'))).toBe('2026-03-05');
    expect(toApiDate({ year: 2026, month: 12, day: 31 })).toBe('2026-12-31');
  });

  it('formats as dd/mm/aaaa', () => {
    expect(formatDate({ year: 2026, month: 3, day: 5 })).toBe('05/03/2026');
  });

  it('parses display dates and rejects invalid ones', () => {
    expect(parseDisplayDate('05/03/2026')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDisplayDate('31/02/2026')).toBeNull();
    expect(parseDisplayDate('5/3/2026')).toBeNull();
    expect(parseDisplayDate('')).toBeNull();
    expect(parseDisplayDate('29/02/2028')).toEqual({ year: 2028, month: 2, day: 29 });
    expect(parseDisplayDate('29/02/2026')).toBeNull();
  });

  it('returns the local calendar day', () => {
    expect(todayDate(new Date(2026, 9, 20, 23, 59))).toEqual({ year: 2026, month: 10, day: 20 });
  });

  it('compares dates', () => {
    const a = { year: 2026, month: 1, day: 1 };
    const b = { year: 2026, month: 1, day: 2 };
    expect(compareDates(a, b)).toBeLessThan(0);
    expect(compareDates(b, a)).toBeGreaterThan(0);
    expect(compareDates(a, { ...a })).toBe(0);
  });

  it('counts inclusive calendar days', () => {
    const jan1 = { year: 2026, month: 1, day: 1 };
    expect(daysThrough(jan1, jan1)).toBe(1);
    expect(daysThrough(jan1, { year: 2026, month: 1, day: 3 })).toBe(3);
    expect(daysThrough({ year: 2026, month: 1, day: 3 }, jan1)).toBeLessThanOrEqual(0);
    expect(daysThrough({ year: 2026, month: 2, day: 28 }, { year: 2026, month: 3, day: 1 })).toBe(2);
  });
});
