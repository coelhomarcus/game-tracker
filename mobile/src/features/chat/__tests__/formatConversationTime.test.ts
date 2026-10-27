import { formatConversationTime } from '../formatConversationTime';

// Tuesday, 27 Oct 2026, 15:41 local time.
const now = new Date(2026, 9, 27, 15, 41);

describe('formatConversationTime', () => {
  it('shows the time for a message from today', () => {
    expect(formatConversationTime(new Date(2026, 9, 27, 15, 41), now)).toBe('15:41');
    expect(formatConversationTime(new Date(2026, 9, 27, 0, 5), now)).toBe('00:05');
  });

  it('counts a time ahead of the clock as today', () => {
    expect(formatConversationTime(new Date(2026, 9, 27, 16, 2), now)).toBe('16:02');
  });

  it('says "Ontem" for the day before, whatever the hour', () => {
    expect(formatConversationTime(new Date(2026, 9, 26, 23, 59), now)).toBe('Ontem');
    expect(formatConversationTime(new Date(2026, 9, 26, 0, 1), now)).toBe('Ontem');
  });

  it('shows the weekday within the last 7 days', () => {
    expect(formatConversationTime(new Date(2026, 9, 25, 9, 0), now)).toBe('Domingo');
    expect(formatConversationTime(new Date(2026, 9, 24, 9, 0), now)).toBe('Sábado');
    expect(formatConversationTime(new Date(2026, 9, 21, 9, 0), now)).toBe('Quarta');
  });

  it('shows the day and month from 7 days ago on', () => {
    expect(formatConversationTime(new Date(2026, 9, 20, 9, 0), now)).toBe('20/10');
    expect(formatConversationTime(new Date(2026, 9, 12, 9, 0), now)).toBe('12/10');
    expect(formatConversationTime(new Date(2025, 2, 3, 9, 0), now)).toBe('03/03');
  });
});
