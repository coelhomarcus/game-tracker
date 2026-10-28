import { groupNotifications, sectionGroups } from '../groupNotifications';
import type { AppNotification, NotificationType } from '../types';

const HOUR = 60 * 60 * 1000;
// Local-time constructors keep the day rules independent of the machine time zone.
const now = new Date(2026, 9, 28, 15, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * HOUR);

function person(id: string) {
  return { id, username: id, name: id.toUpperCase(), avatarUrl: null };
}

let seq = 0;
function n(
  type: NotificationType,
  actor: string,
  createdAt: Date,
  overrides: Partial<AppNotification> = {},
): AppNotification {
  seq += 1;
  return {
    id: `n${seq}`,
    type,
    actor: person(actor),
    postId: type === 'follow' ? null : 'p1',
    commentId: null,
    excerpt: null,
    postImageUrl: null,
    read: false,
    createdAt,
    ...overrides,
  };
}

/** Each group as its type and the actor ids, for compact assertions. */
function shape(items: AppNotification[]) {
  return groupNotifications(items).map((group) => `${group.type}:${group.actors.map((a) => a.id).join(',')}`);
}

describe('groupNotifications', () => {
  it('collapses likes of the same post within 48 h, newest first', () => {
    const items = [
      n('like', 'ana', hoursAgo(1)),
      n('like', 'bia', hoursAgo(5)),
      n('like', 'caio', hoursAgo(40)),
      n('like', 'dani', hoursAgo(49)),
    ];
    const [group] = groupNotifications(items);
    expect(shape(items)).toEqual(['like:ana,bia,caio,dani']);
    expect(group!.key).toBe(items[0]!.id);
    expect(group!.first).toBe(items[0]);
    expect(group!.items).toHaveLength(4);
  });

  it('starts a new group past 48 h of the group\'s newest like', () => {
    const items = [
      n('like', 'ana', hoursAgo(1)),
      n('like', 'bia', new Date(hoursAgo(49).getTime() - 1)),
      n('like', 'caio', hoursAgo(60)),
    ];
    expect(shape(items)).toEqual(['like:ana', 'like:bia,caio']);
  });

  it('groups per post and per type, even when other rows sit between them', () => {
    const items = [
      n('like', 'ana', hoursAgo(1)),
      n('repost', 'bia', hoursAgo(2)),
      n('like', 'caio', hoursAgo(3), { postId: 'p2' }),
      n('comment', 'dani', hoursAgo(4)),
      n('like', 'edu', hoursAgo(5)),
      n('repost', 'fabi', hoursAgo(6)),
    ];
    expect(shape(items)).toEqual(['like:ana,edu', 'repost:bia,fabi', 'like:caio', 'comment:dani']);
  });

  it('collapses follows of the same local day only', () => {
    const items = [
      n('follow', 'ana', new Date(2026, 9, 28, 14, 0)),
      n('follow', 'bia', new Date(2026, 9, 28, 0, 5)),
      n('follow', 'caio', new Date(2026, 9, 27, 23, 55)),
      n('follow', 'dani', new Date(2026, 9, 27, 8, 0)),
    ];
    expect(shape(items)).toEqual(['follow:ana,bia', 'follow:caio,dani']);
  });

  it('never groups replies, comments, mentions, quotes or likes without a post', () => {
    const items = [
      n('reply', 'ana', hoursAgo(1)),
      n('reply', 'bia', hoursAgo(1)),
      n('comment', 'ana', hoursAgo(1)),
      n('comment', 'bia', hoursAgo(1)),
      n('mention', 'ana', hoursAgo(1)),
      n('mention', 'bia', hoursAgo(1)),
      n('quote', 'ana', hoursAgo(1)),
      n('quote', 'bia', hoursAgo(1)),
      n('like', 'ana', hoursAgo(1), { postId: null }),
      n('like', 'bia', hoursAgo(1), { postId: null }),
    ];
    expect(groupNotifications(items)).toHaveLength(10);
  });

  it('lists an actor once even with two of their notifications in the group', () => {
    const items = [n('follow', 'ana', hoursAgo(1)), n('follow', 'ana', hoursAgo(2)), n('follow', 'bia', hoursAgo(3))];
    const [group] = groupNotifications(items);
    expect(group!.items).toHaveLength(3);
    expect(group!.actors.map((a) => a.id)).toEqual(['ana', 'bia']);
  });

  it('is read only when every notification of the group is read', () => {
    const mixed = groupNotifications([
      n('like', 'ana', hoursAgo(1), { read: true }),
      n('like', 'bia', hoursAgo(2), { read: false }),
    ]);
    const allRead = groupNotifications([
      n('like', 'ana', hoursAgo(1), { read: true }),
      n('like', 'bia', hoursAgo(2), { read: true }),
    ]);
    expect(mixed[0]!.read).toBe(false);
    expect(allRead[0]!.read).toBe(true);
  });

  it('returns nothing for nothing', () => {
    expect(groupNotifications([])).toEqual([]);
  });
});

describe('sectionGroups', () => {
  it('splits Hoje and Antes at local midnight', () => {
    const groups = groupNotifications([
      n('comment', 'ana', new Date(2026, 9, 28, 14, 0)),
      n('comment', 'bia', new Date(2026, 9, 28, 0, 0)),
      n('comment', 'caio', new Date(2026, 9, 27, 23, 59, 59)),
    ]);
    const entries = sectionGroups(groups, now);
    expect(entries.map((entry) => (entry.kind === 'section' ? entry.title : entry.group.actors[0]!.id))).toEqual([
      'Hoje',
      'ana',
      'bia',
      'Antes',
      'caio',
    ]);
  });

  it('places a group by its newest notification', () => {
    const groups = groupNotifications([
      n('like', 'ana', new Date(2026, 9, 28, 1, 0)),
      n('like', 'bia', new Date(2026, 9, 27, 20, 0)),
    ]);
    const entries = sectionGroups(groups, now);
    expect(entries.map((entry) => entry.kind)).toEqual(['section', 'group']);
    expect(entries[0]).toMatchObject({ title: 'Hoje' });
  });

  it('leaves out an empty section', () => {
    const groups = groupNotifications([n('comment', 'ana', hoursAgo(48))]);
    const entries = sectionGroups(groups, now);
    expect(entries.map((entry) => (entry.kind === 'section' ? entry.title : 'row'))).toEqual(['Antes', 'row']);
    expect(sectionGroups([], now)).toEqual([]);
  });
});
