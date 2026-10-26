import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';

import type { Comment } from '../../types';
import type { ThreadCommentRow, ThreadReadMoreRow } from '../buildThread';
import { ThreadItemLinear } from '../ThreadItemLinear';
import { ThreadReadMore } from '../ThreadReadMore';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 412, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const bia = { id: 'u2', username: 'bia', name: null, avatarUrl: null };

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

function makeRow(overrides: Partial<ThreadCommentRow> = {}): ThreadCommentRow {
  return {
    type: 'comment',
    key: 'comment:c2',
    comment: makeComment(),
    branchId: 'c1',
    depth: 1,
    branchStart: false,
    hasParentLine: true,
    hasChildLine: false,
    replyingTo: null,
    rails: [],
    isLastChild: true,
    ...overrides,
  };
}

const onReply = jest.fn();
const onToggleLike = jest.fn();
const onDelete = jest.fn();

function item(row: ThreadCommentRow): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <ThreadItemLinear row={row} onReply={onReply} onToggleLike={onToggleLike} onDelete={onDelete} />
    </SafeAreaProvider>
  );
}

function signIn(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id } as ReturnType<typeof useSession.getState>['user'],
  });
}

beforeEach(() => {
  jest.useFakeTimers({
    now: new Date('2026-10-20T12:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
  });
  jest.clearAllMocks();
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.mocked(useReducedMotion).mockReturnValue(false);
  signIn('someone-else');
});

afterEach(async () => {
  jest.useRealTimers();
  await act(async () => useSession.setState({ status: 'signedOut', user: null }));
});

describe('ThreadItemLinear', () => {
  it('shows the author, the time and the text, with one summary for screen readers', async () => {
    await render(item(makeRow()));

    expect(screen.getByText('bia')).toBeOnTheScreen();
    expect(screen.getByText('· há 5 min')).toBeOnTheScreen();
    expect(screen.getByTestId('comment-text')).toHaveTextContent('Concordo!');
    expect(screen.getByLabelText('Comentário de bia, há 5 min: Concordo!')).toBeOnTheScreen();
  });

  it('draws the incoming and outgoing lines it is given, and the hairline of a branch start', async () => {
    await render(item(makeRow({ hasParentLine: false, hasChildLine: true, branchStart: true })));

    expect(screen.queryByTestId('thread-parent-line')).toBeNull();
    expect(screen.getByTestId('thread-child-line')).toHaveStyle({ width: 2 });
    const row = screen.getByTestId('thread-item-linear');
    expect(row).toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
    // A line goes on below, so no bottom padding breaks it.
    expect(row).not.toHaveStyle({ paddingBottom: 8 });

    await screen.rerender(item(makeRow()));
    expect(screen.getByTestId('thread-parent-line')).toHaveStyle({ width: 2 });
    expect(screen.queryByTestId('thread-child-line')).toBeNull();
    expect(screen.getByTestId('thread-item-linear')).toHaveStyle({ paddingBottom: 8 });
  });

  it('says who it answers when the parent is not the row above, linking to that profile', async () => {
    await render(item(makeRow({ replyingTo: ana })));

    await fireEvent.press(screen.getByRole('button', { name: 'Respondendo a @ana' }));

    expect(screen.getByText('Respondendo a @ana')).toBeOnTheScreen();
    expect(mockPush).toHaveBeenCalledWith('/users/u1');
  });

  it('says nothing about the parent when it is the row above', async () => {
    await render(item(makeRow()));

    expect(screen.queryByText(/^Respondendo a/)).toBeNull();
  });

  it('opens the author from the 48 dp avatar box and the name', async () => {
    await render(item(makeRow()));

    const avatar = screen.getByTestId('author-avatar-link', { includeHiddenElements: true });
    expect(avatar).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(avatar);
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de bia' }));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenLastCalledWith('/users/u2');
  });
});

describe('CommentControls', () => {
  it('replies to the comment, labelled with its author', async () => {
    const row = makeRow();
    await render(item(row));

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));

    expect(onReply).toHaveBeenCalledWith(row.comment);
    expect(haptic).toHaveBeenCalledWith('tap');
  });

  it('labels the like with the count and toggles the comment the parent passed', async () => {
    const row = makeRow();
    await render(item(row));

    const like = screen.getByRole('button', { name: 'Curtir comentário, 2 curtidas' });
    expect(like).toHaveStyle({ minHeight: 48, minWidth: 48 });
    await fireEvent.press(like);

    expect(onToggleLike).toHaveBeenCalledTimes(1);
    expect(onToggleLike).toHaveBeenCalledWith(row.comment);
  });

  it('labels a liked comment and uses the singular for one like', async () => {
    await render(item(makeRow({ comment: makeComment({ likedByMe: true, likeCount: 1 }) })));

    expect(screen.getByRole('button', { name: 'Descurtir comentário, 1 curtida' })).toBeOnTheScreen();
    expect(screen.getByTestId('like-icon-filled')).toBeOnTheScreen();
  });

  it('animates the heart only for a like the user just gave', async () => {
    await render(item(makeRow({ comment: makeComment({ likedByMe: true, likeCount: 3 }) })));
    // A like that came from the server does not burst.
    expect(screen.queryByTestId('like-burst')).toBeNull();

    await screen.rerender(item(makeRow()));
    await fireEvent.press(screen.getByRole('button', { name: 'Curtir comentário, 2 curtidas' }));
    await screen.rerender(item(makeRow({ comment: makeComment({ likedByMe: true, likeCount: 3 }) })));

    expect(screen.getByTestId('like-burst')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  it('does not animate the like with reduce motion on', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(item(makeRow()));

    await fireEvent.press(screen.getByRole('button', { name: 'Curtir comentário, 2 curtidas' }));
    await screen.rerender(item(makeRow({ comment: makeComment({ likedByMe: true, likeCount: 3 }) })));

    expect(screen.getByTestId('like-icon-filled')).toBeOnTheScreen();
    expect(screen.queryByTestId('like-burst')).toBeNull();
  });

  it('hides the like count at 0', async () => {
    await render(item(makeRow({ comment: makeComment({ likeCount: 0 }) })));

    expect(screen.getByRole('button', { name: 'Curtir comentário, 0 curtidas' })).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('copies the text from the menu', async () => {
    await render(item(makeRow()));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar texto' }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Concordo!');
    expect(showToast).toHaveBeenCalledWith('Texto copiado');
  });

  it('says so when copying fails', async () => {
    jest.mocked(Clipboard.setStringAsync).mockRejectedValueOnce(new Error('denied'));
    await render(item(makeRow()));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar texto' }));

    expect(showToast).toHaveBeenCalledWith('Não foi possível copiar o texto.');
  });

  it('offers deleting only on the own comment', async () => {
    await render(item(makeRow()));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do comentário' }));

    expect(screen.queryByRole('button', { name: 'Apagar comentário' })).toBeNull();
  });

  it('deletes the own comment only after confirming', async () => {
    signIn('u2');
    const row = makeRow();
    await render(item(row));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    expect(screen.getByText('Apagar comentário?')).toBeOnTheScreen();
    expect(
      screen.getByText('As respostas a ele também serão apagadas. Isso não pode ser desfeito.'),
    ).toBeOnTheScreen();
    expect(onDelete).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(row.comment);
  });

  it('keeps the comment when the deletion is cancelled', async () => {
    signIn('u2');
    await render(item(makeRow()));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it('gives every control a 48 dp touch box', async () => {
    await render(item(makeRow()));

    for (const name of ['Responder a bia', 'Curtir comentário, 2 curtidas', 'Mais opções do comentário']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ minHeight: 48, minWidth: 48 });
    }
  });
});

describe('ThreadReadMore', () => {
  const readMore: ThreadReadMoreRow = {
    type: 'readMore',
    key: 'readMore:c1',
    branchId: 'c1',
    moreReplies: 3,
    rails: [],
  };

  it('says how many replies are hidden and expands the branch', async () => {
    const onExpand = jest.fn();
    await render(<ThreadReadMore row={readMore} onExpand={onExpand} />);

    const button = screen.getByRole('button', { name: 'Ler mais 3 respostas' });
    expect(screen.getByText('Ler mais 3 respostas')).toBeOnTheScreen();
    expect(button).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(button);

    expect(onExpand).toHaveBeenCalledWith('c1');
  });

  it('uses the singular for one reply', async () => {
    await render(<ThreadReadMore row={{ ...readMore, moreReplies: 1 }} onExpand={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Ler mais 1 resposta' })).toBeOnTheScreen();
  });

  it('bends the branch line into an elbow under the avatar column', async () => {
    await render(<ThreadReadMore row={readMore} onExpand={jest.fn()} />);

    expect(screen.getByTestId('thread-read-more-elbow')).toHaveStyle({
      marginLeft: 36,
      height: 18,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderBottomLeftRadius: 8,
    });
  });
});
