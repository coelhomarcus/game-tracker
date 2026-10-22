import { mergeIntoPages, mergeMessages } from '../mergeMessages';
import type { Message, MessagePage } from '../types';

function message(id: string, minute: number, clientMessageId: string | null = null): Message {
  return {
    id,
    conversationId: 'c1',
    senderId: 'u1',
    content: `text ${id}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 12, minute)),
    clientMessageId,
    sender: { id: 'u1', username: 'ana', name: null, avatarUrl: null },
  };
}

const ids = (list: Message[]) => list.map((item) => item.id);

describe('mergeMessages', () => {
  it('sorts newest first by createdAt, then by id', () => {
    const merged = mergeMessages([message('a', 1), message('c', 3)], [message('b', 3)]);

    expect(ids(merged)).toEqual(['c', 'b', 'a']);
  });

  it('keeps one copy of a message that arrives twice by id', () => {
    const merged = mergeMessages([message('m1', 1)], [message('m1', 1), message('m1', 1)]);

    expect(ids(merged)).toEqual(['m1']);
  });

  it('dedupes the event echo and the ack of the same send by clientMessageId', () => {
    const echo = message('m1', 2, 'cid-1');
    const ack = { ...message('m1-copy', 2, 'cid-1'), content: 'from the ack' };

    const merged = mergeMessages([message('m0', 1), echo], [ack]);

    expect(merged).toHaveLength(2);
    expect(merged[0].content).toBe('from the ack');
  });

  it('does not treat messages without clientMessageId as duplicates of each other', () => {
    const merged = mergeMessages([message('a', 1)], [message('b', 2)]);

    expect(ids(merged)).toEqual(['b', 'a']);
  });

  it('does not change its inputs', () => {
    const server = [message('a', 1)];
    mergeMessages(server, [message('b', 2)]);

    expect(ids(server)).toEqual(['a']);
  });
});

describe('mergeIntoPages', () => {
  const pages = (...lists: Message[][]) => ({
    pages: lists.map((items, index): MessagePage => ({ items, nextCursor: `cursor-${index}` })),
    pageParams: lists.map((_, index) => (index === 0 ? undefined : `cursor-${index - 1}`)),
  });

  it('adds new messages to the newest page', () => {
    const data = pages([message('b', 2)], [message('a', 1)]);

    const merged = mergeIntoPages(data, [message('c', 3)]);

    expect(ids(merged.pages[0].items)).toEqual(['c', 'b']);
    expect(merged.pages[1]).toBe(data.pages[1]);
    expect(merged.pages[0].nextCursor).toBe('cursor-0');
    expect(merged.pageParams).toBe(data.pageParams);
  });

  it('replaces a copy already on an older page instead of adding another', () => {
    const data = pages([message('b', 2)], [message('a', 1)]);

    const merged = mergeIntoPages(data, [{ ...message('a', 1), content: 'edited' }]);

    expect(ids(merged.pages[0].items)).toEqual(['b']);
    expect(merged.pages[1].items).toEqual([{ ...message('a', 1), content: 'edited' }]);
  });

  it('returns the same data when there is nothing to merge', () => {
    const data = pages([message('a', 1)]);

    expect(mergeIntoPages(data, [])).toBe(data);
  });
});
