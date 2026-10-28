import { Ionicons } from '@expo/vector-icons';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';

import { colors } from '@/theme/tokens';

import { groupNotifications, type NotificationGroup } from '../groupNotifications';
import { NotificationRow } from '../NotificationRow';
import type { AppNotification, NotificationType } from '../types';

const now = new Date(2026, 9, 28, 15, 0);
const MINUTE = 60_000;

function person(id: string, name: string | null = id.charAt(0).toUpperCase() + id.slice(1)) {
  return { id, username: id, name, avatarUrl: null };
}

let seq = 0;
function n(type: NotificationType, overrides: Partial<AppNotification> = {}): AppNotification {
  seq += 1;
  return {
    id: `n${seq}`,
    type,
    actor: person('ana'),
    postId: type === 'follow' ? null : 'p1',
    commentId: null,
    excerpt: null,
    postImageUrl: null,
    read: true,
    createdAt: new Date(now.getTime() - 5 * MINUTE),
    ...overrides,
  };
}

function only(items: AppNotification[]): NotificationGroup {
  const groups = groupNotifications(items);
  expect(groups).toHaveLength(1);
  return groups[0]!;
}

const onNavigate = jest.fn();

/** The row with its expanded state held like the list holds it. */
function Harness({ group }: { group: NotificationGroup }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <NotificationRow
      group={group}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((value) => !value)}
      onNavigate={onNavigate}
      now={now}
    />
  );
}

function renderRow(group: NotificationGroup) {
  return render(<Harness group={group} />);
}

function glyph(name: keyof typeof Ionicons.glyphMap): string {
  return String.fromCodePoint(Number(Ionicons.glyphMap[name]));
}

beforeEach(() => jest.clearAllMocks());

describe('texts', () => {
  it.each<[NotificationType, Partial<AppNotification>, string]>([
    ['like', {}, 'Ana curtiu seu post'],
    ['repost', {}, 'Ana repostou seu post'],
    ['follow', {}, 'Ana começou a seguir você'],
    ['reply', { excerpt: 'Concordo totalmente' }, 'Ana respondeu: Concordo totalmente'],
    ['reply', {}, 'Ana respondeu seu comentário'],
    ['comment', { excerpt: 'Que jogo!' }, 'Ana comentou: Que jogo!'],
    ['comment', {}, 'Ana comentou no seu post'],
    ['mention', {}, 'Ana mencionou você'],
    ['quote', {}, 'Ana citou seu post'],
  ])('%s %j reads "%s"', async (type, overrides, text) => {
    await renderRow(only([n(type, overrides)]));
    expect(screen.getByText(text)).toBeOnTheScreen();
    expect(screen.getByText('5 min')).toBeOnTheScreen();
  });

  it('counts the others of a group and uses the plural', async () => {
    const actors = ['ana', 'bia', 'caio', 'dani'];
    await renderRow(only(actors.map((id) => n('like', { actor: person(id) }))));
    expect(screen.getByText('Ana e mais 3 curtiram seu post')).toBeOnTheScreen();
  });

  it.each<[NotificationType, string]>([
    ['repost', 'Ana e mais 1 repostaram seu post'],
    ['follow', 'Ana e mais 1 começaram a seguir você'],
  ])('a grouped %s reads "%s"', async (type, text) => {
    await renderRow(only([n(type, { actor: person('ana') }), n(type, { actor: person('bia') })]));
    expect(screen.getByText(text)).toBeOnTheScreen();
  });

  it('shows the post excerpt under likes, reposts, mentions and quotes, not twice for replies', async () => {
    await renderRow(only([n('like', { excerpt: 'Zerei Hollow Knight' })]));
    expect(screen.getByText('Zerei Hollow Knight')).toBeOnTheScreen();
    await screen.unmount();

    await renderRow(only([n('reply', { excerpt: 'Concordo' })]));
    expect(screen.queryByText('Concordo')).toBeNull();
    expect(screen.getByText('Ana respondeu: Concordo')).toBeOnTheScreen();
  });

  it('says an unread row is unread', async () => {
    await renderRow(only([n('like', { read: false })]));
    expect(screen.getByRole('button', { name: 'Não lida. Ana curtiu seu post, 5 min' })).toHaveStyle({
      backgroundColor: colors.bgContrast25,
    });
    await screen.unmount();

    await renderRow(only([n('like', { read: true })]));
    expect(screen.getByRole('button', { name: 'Ana curtiu seu post, 5 min' })).not.toHaveStyle({
      backgroundColor: colors.bgContrast25,
    });
  });
});

describe('badge', () => {
  it.each<[NotificationType, keyof typeof Ionicons.glyphMap, string]>([
    ['like', 'heart', colors.like],
    ['repost', 'repeat', colors.repost],
    ['follow', 'person-add', colors.primary],
    ['reply', 'chatbubble', colors.replyBadge],
    ['comment', 'chatbubble', colors.replyBadge],
    ['mention', 'at', colors.replyBadge],
    ['quote', 'chatbox-ellipses', colors.replyBadge],
  ])('%s shows %s on its color', async (type, icon, color) => {
    await renderRow(only([n(type)]));
    const badge = screen.getByTestId('notification-badge', { includeHiddenElements: true });
    expect(badge).toHaveStyle({ backgroundColor: color, width: 24, height: 24, borderWidth: 2, borderColor: colors.bg });
    expect(within(badge).getByText(glyph(icon), { includeHiddenElements: true })).toBeTruthy();
  });

  it('uses the replyBadge token', () => {
    expect(colors.replyBadge).toBe('#8679FC');
  });
});

describe('thumbnail', () => {
  it('shows the post image when there is one', async () => {
    await renderRow(only([n('like', { postImageUrl: 'https://img/p1.jpg' })]));
    const thumbnail = screen.getByTestId('notification-thumbnail');
    expect(thumbnail).toHaveProp('source', { uri: 'https://img/p1.jpg' });
    expect(thumbnail).toHaveStyle({ width: 60, height: 60, borderRadius: 8 });
  });

  it('shows none without an image', async () => {
    await renderRow(only([n('like')]));
    expect(screen.queryByTestId('notification-thumbnail')).toBeNull();
  });
});

describe('grouped rows', () => {
  const seven = ['ana', 'bia', 'caio', 'dani', 'edu', 'fabi', 'gui'];

  it('stacks up to five faces and counts the rest', async () => {
    await renderRow(only(seven.map((id) => n('like', { actor: person(id) }))));
    const stack = screen.getByTestId('notification-avatar-stack');
    expect(within(stack).getAllByText(/^[A-Z]$/)).toHaveLength(5);
    expect(within(stack).getByText('+2')).toBeOnTheScreen();
    expect(stack).toHaveStyle({ minHeight: 48 });
  });

  it('a single notification has no stack', async () => {
    await renderRow(only([n('like')]));
    expect(screen.queryByTestId('notification-avatar-stack')).toBeNull();
  });

  it('the chevron expands everyone, each opening their profile, and the row still opens the post', async () => {
    await renderRow(only(seven.map((id) => n('like', { actor: person(id) }))));
    expect(screen.queryByTestId('notification-actor-list')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar as 7 pessoas' }));
    const list = screen.getByTestId('notification-actor-list');
    expect(within(list).getAllByRole('button')).toHaveLength(7);
    expect(onNavigate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Ver perfil de Gui' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/users/gui');

    await fireEvent.press(screen.getByText('Ana e mais 6 curtiram seu post'));
    expect(onNavigate).toHaveBeenLastCalledWith('/posts/p1');

    await fireEvent.press(screen.getByRole('button', { name: 'Ocultar pessoas' }));
    expect(screen.queryByTestId('notification-actor-list')).toBeNull();
  });

  it('pressing a grouped follow row shows the people instead of opening one profile', async () => {
    await renderRow(only([n('follow', { actor: person('ana') }), n('follow', { actor: person('bia') })]));
    await fireEvent.press(screen.getByText('Ana e mais 1 começaram a seguir você'));
    expect(onNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Ver perfil de Bia' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Ver perfil de Bia' }));
    expect(onNavigate).toHaveBeenLastCalledWith('/users/bia');
  });
});
