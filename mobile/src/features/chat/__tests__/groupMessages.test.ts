import { groupMessages, type GroupableMessage, type GroupedItem } from '../groupMessages';

// Tuesday, 27 Oct 2026, 15:41 local time.
const now = new Date(2026, 9, 27, 15, 41);

type Row = GroupableMessage & { id: string };

function at(day: number, hours: number, minutes: number, seconds = 0): Date {
  return new Date(2026, 9, day, hours, minutes, seconds);
}

function row(id: string, senderId: string, createdAt: Date, status?: Row['status']): Row {
  return { id, key: `m-${id}`, senderId, createdAt, status };
}

/** Each item on one line, newest first: `[label]` for a divider, `id first/last` for a message. */
function describeItems(items: GroupedItem<Row>[]): string[] {
  return items.map((item) =>
    item.kind === 'divider'
      ? `[${item.label}]`
      : `${item.message.id}${item.isFirstInGroup ? ' first' : ''}${item.isLastInGroup ? ' last' : ''}`,
  );
}

describe('groupMessages', () => {
  it('returns nothing for no messages', () => {
    expect(groupMessages([], now)).toEqual([]);
  });

  it('puts one message alone in its group, under a divider', () => {
    expect(describeItems(groupMessages([row('a', 'u1', at(27, 15, 0))], now))).toEqual([
      'a first last',
      '[Hoje às 15:00]',
    ]);
  });

  it('groups the same sender under 5 minutes apart, newest first like the inverted list', () => {
    const items = groupMessages(
      [
        row('c', 'u1', at(27, 15, 8, 59)),
        row('b', 'u1', at(27, 15, 4)),
        row('a', 'u1', at(27, 15, 0)),
      ],
      now,
    );
    // On screen (bottom to top): c is the newest and closes the group, a opens it.
    expect(describeItems(items)).toEqual(['c last', 'b', 'a first', '[Hoje às 15:00]']);
  });

  it('starts a new group at exactly 5 minutes apart', () => {
    const items = groupMessages(
      [row('b', 'u1', at(27, 15, 5)), row('a', 'u1', at(27, 15, 0))],
      now,
    );
    expect(describeItems(items)).toEqual(['b first last', 'a first last', '[Hoje às 15:00]']);
  });

  it('keeps 4:59 apart in one group', () => {
    const items = groupMessages(
      [row('b', 'u1', at(27, 15, 4, 59)), row('a', 'u1', at(27, 15, 0))],
      now,
    );
    expect(describeItems(items)).toEqual(['b last', 'a first', '[Hoje às 15:00]']);
  });

  it('starts a new group when the sender changes, however close in time', () => {
    const items = groupMessages(
      [
        row('d', 'me', at(27, 15, 3)),
        row('c', 'me', at(27, 15, 2)),
        row('b', 'u1', at(27, 15, 1)),
        row('a', 'u1', at(27, 15, 0)),
      ],
      now,
    );
    expect(describeItems(items)).toEqual(['d last', 'c first', 'b last', 'a first', '[Hoje às 15:00]']);
  });

  it('puts a divider above a message more than 1 hour after the previous one', () => {
    const items = groupMessages(
      [
        row('d', 'u1', at(27, 15, 41)),
        row('c', 'u1', at(27, 14, 40)),
        row('b', 'u1', at(27, 13, 40)),
        row('a', 'u1', at(26, 9, 2)),
      ],
      now,
    );
    // 14:40 → 15:41 is over an hour: a divider. 13:40 → 14:40 is exactly an hour: none.
    expect(describeItems(items)).toEqual([
      'd first last',
      '[Hoje às 15:41]',
      'c first last',
      'b first last',
      '[Hoje às 13:40]',
      'a first last',
      '[Ontem às 09:02]',
    ]);
  });

  it('labels dividers with the weekday within a week and the date before that', () => {
    const items = groupMessages(
      [row('b', 'u1', at(26, 9, 0)), row('a', 'u1', at(22, 9, 0)), row('z', 'u1', at(12, 9, 0))],
      now,
    );
    expect(describeItems(items)).toEqual([
      'b first last',
      '[Ontem às 09:00]',
      'a first last',
      '[Quinta às 09:00]',
      'z first last',
      '[12 de out de 2026 às 09:00]',
    ]);
  });

  it('ends a group at a failed message, so its line shows under it', () => {
    const items = groupMessages(
      [
        row('c', 'me', at(27, 15, 2), 'sending'),
        row('b', 'me', at(27, 15, 1), 'failed'),
        row('a', 'me', at(27, 15, 0)),
      ],
      now,
    );
    expect(describeItems(items)).toEqual(['c first last', 'b last', 'a first', '[Hoje às 15:00]']);
  });

  it('groups pending messages placed below newer server ones (time going back)', () => {
    // A pending message waits below the server's even when a later one was already confirmed.
    const items = groupMessages(
      [row('p', 'me', at(27, 15, 0), 'sending'), row('s', 'me', at(27, 15, 1))],
      now,
    );
    expect(describeItems(items)).toEqual(['p last', 's first', '[Hoje às 15:01]']);
  });

  it('keys items by message, and dividers by the message under them', () => {
    const items = groupMessages([row('b', 'u1', at(27, 15, 41)), row('a', 'u1', at(26, 9, 0))], now);
    expect(items.map((item) => item.key)).toEqual(['m-b', 'divider-m-b', 'm-a', 'divider-m-a']);
  });
});
