import { formatDivider } from '../formatDivider';

// Tuesday, 27 Oct 2026, 15:41 local time.
const now = new Date(2026, 9, 27, 15, 41);

describe('formatDivider', () => {
  it('says "Hoje às" with the time for today, a time ahead of the clock included', () => {
    expect(formatDivider(new Date(2026, 9, 27, 15, 41), now)).toBe('Hoje às 15:41');
    expect(formatDivider(new Date(2026, 9, 27, 0, 5), now)).toBe('Hoje às 00:05');
    expect(formatDivider(new Date(2026, 9, 27, 23, 0), now)).toBe('Hoje às 23:00');
  });

  it('says "Ontem às" for the day before, whatever the hour', () => {
    expect(formatDivider(new Date(2026, 9, 26, 9, 2), now)).toBe('Ontem às 09:02');
    expect(formatDivider(new Date(2026, 9, 26, 23, 59), now)).toBe('Ontem às 23:59');
    expect(formatDivider(new Date(2026, 9, 26, 0, 1), now)).toBe('Ontem às 00:01');
  });

  it('says the weekday within the last 7 days', () => {
    expect(formatDivider(new Date(2026, 9, 25, 18, 30), now)).toBe('Domingo às 18:30');
    expect(formatDivider(new Date(2026, 9, 22, 8, 0), now)).toBe('Quinta às 08:00');
    expect(formatDivider(new Date(2026, 9, 21, 9, 15), now)).toBe('Quarta às 09:15');
  });

  it('says the full date from 7 days ago on', () => {
    expect(formatDivider(new Date(2026, 9, 20, 15, 41), now)).toBe('20 de out de 2026 às 15:41');
    expect(formatDivider(new Date(2026, 9, 12, 7, 3), now)).toBe('12 de out de 2026 às 07:03');
    expect(formatDivider(new Date(2025, 2, 3, 21, 0), now)).toBe('3 de mar de 2025 às 21:00');
    expect(formatDivider(new Date(2025, 11, 31, 12, 0), now)).toBe('31 de dez de 2025 às 12:00');
  });

  it('names every month', () => {
    const months = Array.from({ length: 12 }, (_, month) =>
      formatDivider(new Date(2024, month, 1, 10, 0), now).split(' ')[2],
    );
    expect(months).toEqual(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']);
  });

  it('counts calendar days across a month and a year boundary', () => {
    const newYear = new Date(2027, 0, 1, 0, 30);
    expect(formatDivider(new Date(2026, 11, 31, 23, 50), newYear)).toBe('Ontem às 23:50');
    expect(formatDivider(new Date(2026, 11, 27, 10, 0), newYear)).toBe('Domingo às 10:00');
    expect(formatDivider(new Date(2026, 11, 25, 10, 0), newYear)).toBe('25 de dez de 2026 às 10:00');
  });
});
