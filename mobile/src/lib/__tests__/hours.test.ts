import { MAX_HOURS, formatHours, hoursInputText, maxPlausibleHours, parseHours } from '../hours';

describe('hours', () => {
  it('parses comma and dot decimals', () => {
    expect(parseHours('12,5')).toBe(12.5);
    expect(parseHours('12.5')).toBe(12.5);
    expect(parseHours('12')).toBe(12);
    expect(parseHours(' 7 ')).toBe(7);
  });

  it('rounds to one decimal', () => {
    expect(parseHours('1.26')).toBe(1.3);
  });

  it('rejects invalid input', () => {
    expect(parseHours('12h')).toBeNull();
    expect(parseHours('')).toBeNull();
    expect(parseHours('-1')).toBeNull();
  });

  it('formats with one decimal and a comma', () => {
    expect(formatHours(20)).toBe('20,0');
    expect(formatHours(12.5)).toBe('12,5');
  });

  it('produces input text without a useless decimal', () => {
    expect(hoursInputText(20)).toBe('20');
    expect(hoursInputText(12.5)).toBe('12,5');
  });

  describe('maxPlausibleHours', () => {
    const today = { year: 2026, month: 1, day: 10 };
    const jan1 = { year: 2026, month: 1, day: 1 };

    it('is unbounded without a start date', () => {
      expect(maxPlausibleHours(null, null, today)).toBe(99999);
      expect(maxPlausibleHours(null, jan1, today)).toBe(MAX_HOURS);
    });

    it('allows 24 hours per calendar day through the end date', () => {
      expect(maxPlausibleHours(jan1, { year: 2026, month: 1, day: 2 }, today)).toBe(48);
    });

    it('uses today when there is no end date', () => {
      expect(maxPlausibleHours(today, null, today)).toBe(24);
    });

    it('falls back to the maximum when the range is reversed', () => {
      expect(maxPlausibleHours(today, jan1, today)).toBe(MAX_HOURS);
    });

    it('caps at the maximum', () => {
      expect(maxPlausibleHours({ year: 2000, month: 1, day: 1 }, null, today)).toBe(MAX_HOURS);
    });
  });
});
