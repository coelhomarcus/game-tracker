import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { colors } from '@/theme/tokens';

import type { Comment } from '../../types';
import type { ThreadCommentRow, ThreadReadMoreRow } from '../buildThread';
import { ThreadItemTree } from '../ThreadItemTree';
import { ThreadReadMore } from '../ThreadReadMore';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// The avatar link is hidden from screen readers on purpose; touch still reaches it.
const HIDDEN = { includeHiddenElements: true };

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const bia = { id: 'u2', username: 'bia', name: null, avatarUrl: null };
const onReply = jest.fn();
const onToggleLike = jest.fn();
const onDelete = jest.fn();

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c2',
    postId: 'p1',
    author: bia,
    content: 'Concordo!',
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    parentCommentId: 'c1',
    likeCount: 2,
    likedByMe: false,
    replies: [],
    ...overrides,
  };
}

/** A reply on the third level: its grandparent still has a later sibling, its parent not. */
function makeRow(overrides: Partial<ThreadCommentRow> = {}): ThreadCommentRow {
  return {
    type: 'comment',
    key: 'comment:c2',
    comment: makeComment(),
    branchId: 'c0',
    depth: 2,
    branchStart: false,
    hasParentLine: true,
    hasChildLine: false,
    replyingTo: null,
    rails: [true, false],
    isLastChild: true,
    ...overrides,
  };
}

function item(row: ThreadCommentRow): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThreadItemTree row={row} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} />
    </SafeAreaProvider>
  );
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-20T12:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
  });
  jest.clearAllMocks();
  useSession.setState({
    status: 'signedIn',
    user: { id: 'someone-else' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => useSession.setState({ status: 'signedOut', user: null }));
});

describe('ThreadItemTree', () => {
  it('shows the author, the time and the text, with one summary for screen readers', async () => {
    await render(item(makeRow()));

    expect(screen.getByText('bia')).toBeOnTheScreen();
    expect(screen.getByText('· há 5 min')).toBeOnTheScreen();
    expect(screen.getByTestId('comment-text')).toHaveTextContent('Concordo!');
    expect(screen.getByLabelText('Comentário de bia, há 5 min: Concordo!')).toBeOnTheScreen();
  });

  it('sits in one 28 dp indent per level, with a rail only where a later sibling follows', async () => {
    await render(item(makeRow()));

    const rail = screen.getByTestId('thread-tree-rail');
    const indent = screen.getByTestId('thread-tree-indent');
    expect(rail).toHaveStyle({ width: 28, borderRightWidth: 2, borderRightColor: colors.borderLow });
    expect(indent).toHaveStyle({ width: 28 });
    expect(StyleSheet.flatten(indent.props.style).borderRightWidth).toBeUndefined();
    // Outermost level first.
    const row = screen.getByTestId('thread-item-tree');
    expect(row.children.slice(0, 2)).toEqual([rail, indent]);
  });

  it('comes in from the parent line through an L-shaped elbow into the avatar', async () => {
    await render(item(makeRow()));

    expect(screen.getByTestId('thread-tree-elbow')).toHaveStyle({
      position: 'absolute',
      left: -1,
      top: 0,
      width: 16,
      height: 21,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderBottomLeftRadius: 8,
      borderColor: colors.borderLow,
    });
    expect(screen.getByTestId('thread-tree-content')).toHaveStyle({ paddingTop: 8 });
    expect(screen.getByTestId('thread-item-tree')).not.toHaveStyle({
      borderTopWidth: StyleSheet.hairlineWidth,
    });
  });

  it('starts a top-level comment with a hairline instead, and no indent or elbow', async () => {
    await render(item(makeRow({ depth: 0, rails: [], branchStart: true, hasParentLine: false })));

    expect(screen.getByTestId('thread-item-tree')).toHaveStyle({
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderLow,
    });
    expect(screen.getByTestId('thread-tree-content')).toHaveStyle({ paddingTop: 11 });
    expect(screen.queryByTestId('thread-tree-elbow')).toBeNull();
    expect(screen.queryByTestId('thread-tree-rail')).toBeNull();
    expect(screen.queryByTestId('thread-tree-indent')).toBeNull();
  });

  it('draws a line down from the avatar while its replies follow, and pads the end otherwise', async () => {
    await render(item(makeRow({ hasChildLine: true, isLastChild: false })));

    expect(screen.getByTestId('thread-child-line')).toHaveStyle({ borderRightWidth: 2 });
    expect(screen.getByTestId('thread-tree-content')).not.toHaveStyle({ paddingBottom: 8 });

    await screen.rerender(item(makeRow()));
    expect(screen.queryByTestId('thread-child-line')).toBeNull();
    expect(screen.getByTestId('thread-tree-content')).toHaveStyle({ paddingBottom: 8 });
  });

  it('shows a 24 dp avatar in a real 48 dp touch box inside the row', async () => {
    await render(item(makeRow()));

    const box = screen.getByTestId('author-avatar-link', HIDDEN);
    expect(box).toHaveStyle({ position: 'absolute', width: 48, height: 48, left: 4, top: 0 });
    expect(within(box).getByText('B', HIDDEN)).toBeOnTheScreen();
    await fireEvent.press(box);
    expect(mockPush).toHaveBeenCalledWith('/users/u2');

    // A top-level row starts 3 dp lower; its box follows the avatar.
    await screen.rerender(item(makeRow({ depth: 0, rails: [], hasParentLine: false })));
    expect(screen.getByTestId('author-avatar-link', HIDDEN)).toHaveStyle({ top: 3 });
  });

  it('says who it answers when given, linking to that profile', async () => {
    await render(item(makeRow({ replyingTo: ana })));

    await fireEvent.press(screen.getByRole('button', { name: 'Respondendo a @ana' }));
    expect(mockPush).toHaveBeenCalledWith('/users/u1');

    await screen.rerender(item(makeRow()));
    expect(screen.queryByText(/^Respondendo a/)).toBeNull();
  });

  it('has compact controls with 48 dp buttons that act on the comment', async () => {
    await render(item(makeRow()));

    for (const name of ['Responder a bia', 'Curtir comentário, 2 curtidas', 'Mais opções do comentário']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ minHeight: 48, minWidth: 48 });
    }
    // Reply and like sit side by side instead of in the post controls' wide slots.
    const primary = screen.getByTestId('comment-controls').children[0] as Parameters<
      typeof within
    >[0];
    expect(primary).toHaveStyle({ flexDirection: 'row' });
    expect(primary).not.toHaveStyle({ maxWidth: 214 });
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Curtir comentário, 2 curtidas' }));
    expect(onToggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: 'c2' }));
  });
});

describe('ThreadReadMore in the tree view', () => {
  const readMore: ThreadReadMoreRow = {
    type: 'readMore',
    key: 'readMore:c3',
    branchId: 'c3',
    moreReplies: 4,
    rails: [false, true, true],
  };

  it('sits in the indents of the comment it stands for and bends out of its avatar line', async () => {
    await render(<ThreadReadMore row={readMore} onExpand={jest.fn()} mode="tree" />);

    expect(screen.getAllByTestId('thread-tree-rail')).toHaveLength(2);
    expect(screen.getAllByTestId('thread-tree-indent')).toHaveLength(1);
    // Under the 24 dp avatar: 16 + 12 - 1, then one indent towards the label.
    expect(screen.getByTestId('thread-read-more-elbow')).toHaveStyle({
      marginLeft: 27,
      width: 16,
      height: 18,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderBottomLeftRadius: 8,
    });
  });

  it('expands the comment it stands for', async () => {
    const onExpand = jest.fn();
    await render(<ThreadReadMore row={readMore} onExpand={onExpand} mode="tree" />);

    const button = screen.getByRole('button', { name: 'Ler mais 4 respostas' });
    expect(button).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(button);
    expect(onExpand).toHaveBeenCalledWith('c3');
  });
});
