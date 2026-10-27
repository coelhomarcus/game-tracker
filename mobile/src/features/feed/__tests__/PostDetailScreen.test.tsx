import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { FlatList, Keyboard, StyleSheet, TextInput } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage, useSession } from '@/features/auth';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { haptic } from '@/lib/haptics';
import { usePreferences } from '@/lib/preferences';
import { showToast } from '@/lib/toast';

import { PostDetailScreen } from '../PostDetailScreen';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  usePost,
  useToggleCommentLike,
} from '../queries';
import type { Comment, Post } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

jest.mock('../queries', () => ({
  usePost: jest.fn(),
  useComments: jest.fn(),
  useAddComment: jest.fn(),
  useToggleCommentLike: jest.fn(),
  useDeleteComment: jest.fn(),
  useDeletedPostCheck: () => mockWasDeleted,
  ...jest.requireActual<typeof import('@/test-utils/postControlHooks')>(
    '@/test-utils/postControlHooks',
  ).postControlHooks(),
  useDeletePost: () => ({ mutate: mockDeletePost }),
}));
const mockDeletePost = jest.fn();
const mockWasDeleted = jest.fn((_postId: string) => false);
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));
// The anchor asks whether the user follows the author; here nobody does.
jest.mock('@/features/profiles/queries', () => ({
  useProfile: (id?: string) => ({ data: id === undefined ? undefined : { isFollowedByMe: false } }),
  useToggleFollow: () => ({ mutate: jest.fn() }),
  useSetModeration: () => ({ mutate: jest.fn() }),
}));

const mockScreenOptions = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
let mockParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  // Focus effects run once on mount, as for a page that opens focused.
  useFocusEffect: (effect: () => void) => jest.requireActual('react').useEffect(effect, [effect]),
  // The header is rendered in place so the tests can read its title and use its button.
  Stack: {
    Screen: ({
      options,
    }: {
      options?: { title?: string; headerRight?: (props: { canGoBack: boolean }) => unknown };
    }) => {
      const { Text, View } = jest.requireActual('react-native');
      mockScreenOptions(options);
      return (
        <View>
          <Text testID="header-title">{options?.title}</Text>
          {options?.headerRight?.({ canGoBack: true })}
        </View>
      );
    },
  },
}));

const mockedUsePost = jest.mocked(usePost);
const mockedUseComments = jest.mocked(useComments);
const mockedUseAddComment = jest.mocked(useAddComment);
const mockedUseToggleCommentLike = jest.mocked(useToggleCommentLike);
const mockedUseDeleteComment = jest.mocked(useDeleteComment);

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// The avatar link is hidden from screen readers on purpose; touch still reaches it.
const HIDDEN = { includeHiddenElements: true };

const POST_ID = '3f2b8c1e-5d4a-4e6f-9a7b-0c1d2e3f4a5b';
const POST_LABEL = /^Post de Ana Souza, /;

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const bia = { id: 'u2', username: 'bia', name: null, avatarUrl: null };
const caio = { id: 'u3', username: 'caio', name: 'Caio', avatarUrl: null };

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: POST_ID,
    author: ana,
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 3,
    commentCount: 3,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

function makeComment(
  id: string,
  author: Comment['author'],
  overrides: Partial<Comment> = {},
): Comment {
  return {
    id,
    postId: POST_ID,
    author,
    content: `texto ${id}`,
    createdAt: new Date('2026-10-20T11:58:00.000Z'),
    parentCommentId: null,
    likeCount: 2,
    likedByMe: false,
    replies: [],
    ...overrides,
  };
}

const dani = { id: 'u4', username: 'dani', name: 'Dani', avatarUrl: null };

/** The chain of `makeTree` plus c4 (Dani), a second reply to c1 that the linear view collapses. */
function makeWideTree(): Comment[] {
  const tree = makeTree();
  tree[0]!.replies.push(makeComment('c4', dani, { parentCommentId: 'c1' }));
  return tree;
}

/** c1 (Ana) <- c2 (bia) <- c3 (Caio): c3 answers a reply. */
function makeTree(): Comment[] {
  const c3 = makeComment('c3', caio, { parentCommentId: 'c2' });
  const c2 = makeComment('c2', bia, { parentCommentId: 'c1', replies: [c3] });
  return [makeComment('c1', ana, { replies: [c2] })];
}

type PostResult = ReturnType<typeof usePost>;
type CommentsResult = ReturnType<typeof useComments>;

function postResult(overrides: Record<string, unknown> = {}): PostResult {
  return {
    data: makePost(),
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as PostResult;
}

function commentsResult(overrides: Record<string, unknown> = {}): CommentsResult {
  return {
    data: makeTree(),
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as CommentsResult;
}

const mutateAsync = jest.fn();
const toggleLike = jest.fn();
const deleteComment = jest.fn();

async function renderScreen(headerHeight = 0) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <HeaderHeightContext.Provider value={headerHeight}>
        <PostDetailScreen />
      </HeaderHeightContext.Provider>
    </SafeAreaProvider>,
  );
}

function signIn(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id, username: id, name: null, avatarUrl: null } as ReturnType<
      typeof useSession.getState
    >['user'],
  });
}

beforeEach(() => {
  // Only the clock is faked: timers stay real so Testing Library keeps working.
  jest.useFakeTimers({
    now: new Date('2026-10-20T12:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
  });
  jest.clearAllMocks();
  mockParams = { postId: POST_ID };
  usePreferences.setState({ threadView: 'linear', threadSort: 'oldest' });
  mockedUsePost.mockReturnValue(postResult());
  mockedUseComments.mockReturnValue(commentsResult());
  mutateAsync.mockResolvedValue(undefined);
  mockedUseAddComment.mockReturnValue({ mutateAsync } as unknown as ReturnType<
    typeof useAddComment
  >);
  mockedUseToggleCommentLike.mockReturnValue({ mutate: toggleLike } as unknown as ReturnType<
    typeof useToggleCommentLike
  >);
  mockedUseDeleteComment.mockReturnValue({ mutate: deleteComment } as unknown as ReturnType<
    typeof useDeleteComment
  >);
});

afterEach(async () => {
  jest.useRealTimers();
  // Still mounted here: the screen follows the session, so the sign-out renders inside act.
  await act(async () => useSession.setState({ status: 'signedOut', user: null }));
});

/** The pill that stands in for the composer until the user asks to write. */
const prompt = () => screen.getByRole('button', { name: 'Escreva sua resposta' });
const queryPrompt = () => screen.queryByRole('button', { name: 'Escreva sua resposta' });
const field = () => screen.getByPlaceholderText(/^Escreva /);
const queryField = () => screen.queryByPlaceholderText(/^Escreva /);
const focus = TextInput.prototype.focus as unknown as jest.Mock;

async function openComposer() {
  await fireEvent.press(prompt());
}

/** Types into the composer, opening it from the prompt first when it is not open. */
async function typeComment(text: string) {
  if (!queryField()) await openComposer();
  await fireEvent.changeText(screen.getByPlaceholderText(/^Escreva /), text);
}

async function send() {
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar comentário' }));
}

describe('PostDetailScreen post', () => {
  it('reads the post and comments of the address', async () => {
    await renderScreen();

    expect(mockedUsePost).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseComments).toHaveBeenCalledWith(POST_ID, 'oldest');
    expect(mockedUseAddComment).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseToggleCommentLike).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseDeleteComment).toHaveBeenCalledWith(POST_ID);
  });

  it('titles the header Post for a written post and shows it without being pressable', async () => {
    await renderScreen();

    expect(screen.getByTestId('header-title')).toHaveTextContent('Post');
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByLabelText(POST_LABEL)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: POST_LABEL })).toBeNull();
  });

  it('titles the header Atividade and shows the activity card for an activity', async () => {
    mockedUsePost.mockReturnValue(
      postResult({
        data: makePost({ type: 'activity', activityStatus: 'completed', content: 'zerou Hades' }),
      }),
    );
    await renderScreen();

    expect(screen.getByTestId('header-title')).toHaveTextContent('Atividade');
    expect(screen.getByLabelText('Ana Souza zerou Hades, Concluído, há 5 min')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Ana Souza zerou/ })).toBeNull();
  });

  it('writes a comment on the post from the comment counter of the anchor', async () => {
    await renderScreen();
    expect(queryField()).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Comentar, 3 comentários' }));

    expect(field().props.placeholder).toBe('Escreva um comentário');
    expect(queryPrompt()).toBeNull();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('turns a reply into a comment on the post from the comment counter of the anchor', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Comentar, 3 comentários' }));
    await typeComment('Oi');
    await send();

    expect(screen.queryByText('Respondendo a @bia')).toBeNull();
    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Oi' });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('parentCommentId');
  });

  it('keeps the composer above the keyboard, offset by the header height', async () => {
    await renderScreen(77);

    expect(screen.getByTestId('post-keyboard-avoider').props.keyboardVerticalOffset).toBe(77);
    expect(screen.getByTestId('post-keyboard-avoider').props.behavior).toBe('padding');
    // The prompt sits inside the avoiding layout, and so does the composer that replaces it.
    const avoider = () => within(screen.getByTestId('post-keyboard-avoider'));
    expect(avoider().getByTestId('thread-reply-prompt')).toBeOnTheScreen();

    await openComposer();

    expect(avoider().getByPlaceholderText('Escreva um comentário')).toBeOnTheScreen();
    expect(screen.getByTestId('post-keyboard-avoider').props.keyboardVerticalOffset).toBe(77);
  });

  it('shows the post as the thread anchor, above the comments', async () => {
    await renderScreen();

    const anchor = screen.getByTestId('thread-anchor');
    expect(within(anchor).getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(within(anchor).queryByText('texto c1')).toBeNull();
    expect(screen.queryByText(/^Comentários \(/)).toBeNull();
  });

  it('shows a spinner and the Post title while the post loads', async () => {
    mockedUsePost.mockReturnValue(postResult({ data: undefined, isPending: true }));
    await renderScreen();

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.getByTestId('header-title')).toHaveTextContent('Post');
  });

  it('shows not found for a post the API does not know', async () => {
    mockedUsePost.mockReturnValue(
      postResult({ data: undefined, isError: true, error: new ApiError(404, 'NOT_FOUND', 'x') }),
    );
    await renderScreen();

    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    expect(screen.getByText('Ele pode ter sido removido.')).toBeOnTheScreen();
    expect(screen.getByTestId('header-title')).toHaveTextContent('Post');
    expect(screen.queryByPlaceholderText(/^Escreva /)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Voltar ao feed' }));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('shows not found for an empty address without asking the API', async () => {
    mockParams = { postId: '' };
    await renderScreen();

    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    expect(mockedUsePost).not.toHaveBeenCalled();
  });

  it('shows not found for an address that is not a post id without asking the API', async () => {
    mockParams = { postId: 'abc' };
    await renderScreen();

    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    expect(mockedUsePost).not.toHaveBeenCalled();
    expect(mockedUseComments).not.toHaveBeenCalled();
  });

  it('accepts a post id in any letter case', async () => {
    const upper = POST_ID.toUpperCase();
    mockParams = { postId: upper };
    await renderScreen();

    expect(mockedUsePost).toHaveBeenCalledWith(upper);
  });

  it('offers a retry for other errors', async () => {
    const refetch = jest.fn();
    mockedUsePost.mockReturnValue(
      postResult({ data: undefined, isError: true, error: new NetworkError(), refetch }),
    );
    await renderScreen();

    expect(screen.getByText('Não foi possível carregar o post')).toBeOnTheScreen();
    expect(screen.queryByText('Post não encontrado')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the post on screen when a refresh fails', async () => {
    mockedUsePost.mockReturnValue(postResult({ isError: true, error: new NetworkError() }));
    await renderScreen();

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.queryByText('Post não encontrado')).toBeNull();
  });

  it('says the post is gone when a refresh finds it deleted, even with a cached copy', async () => {
    mockedUsePost.mockReturnValue(
      postResult({ isError: true, error: new ApiError(404, 'NOT_FOUND', 'x') }),
    );
    await renderScreen();

    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    expect(screen.queryByText('Zerei de primeira!')).toBeNull();
  });

  it('says the post is gone when shown again after the user deleted it elsewhere', async () => {
    mockWasDeleted.mockImplementation((id) => id === POST_ID);
    await renderScreen();

    expect(mockWasDeleted).toHaveBeenCalledWith(POST_ID);
    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    mockWasDeleted.mockImplementation(() => false);
  });
});

describe('PostDetailScreen comments', () => {
  it('shows a reply chain in order, each comment with its author and one summary label', async () => {
    await renderScreen();

    const texts = screen.getAllByTestId('comment-text').map((node) => node.props.children);
    expect(texts).toEqual(['texto c1', 'texto c2', 'texto c3']);
    expect(screen.getByText('bia')).toBeOnTheScreen();
    expect(screen.getByText('Caio')).toBeOnTheScreen();
    expect(screen.getByLabelText('Comentário de bia, há 2 min: texto c2')).toBeOnTheScreen();
    // Each reply sits right under the comment it answers, so none names who it answers.
    expect(screen.queryByText(/^Respondendo a @/)).toBeNull();
  });

  it('connects the chain with lines and starts the branch with a hairline', async () => {
    await renderScreen();

    const rows = screen.getAllByTestId('thread-item-linear');
    expect(rows).toHaveLength(3);
    const has = (line: string) => rows.map((row) => within(row).queryByTestId(line) !== null);
    expect(has('thread-parent-line')).toEqual([false, true, true]);
    expect(has('thread-child-line')).toEqual([true, true, false]);
    expect(rows[0]).toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
    expect(rows[1]).not.toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
    // Nothing follows the last row, so it keeps 8 dp below.
    expect(rows[2]).toHaveStyle({ paddingBottom: 8 });
  });

  it('collapses the other replies of a branch and shows them on "Ler mais"', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: makeWideTree() }));
    await renderScreen();

    expect(screen.queryByText('texto c4')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais 1 resposta' }));

    const texts = screen.getAllByTestId('comment-text').map((node) => node.props.children);
    expect(texts).toEqual(['texto c1', 'texto c2', 'texto c3', 'texto c4']);
    expect(screen.queryByRole('button', { name: /^Ler mais/ })).toBeNull();
    // c4 answers c1, which is not the row above it.
    expect(screen.getByText('Respondendo a @ana')).toBeOnTheScreen();
    expect(screen.getAllByText(/^Respondendo a @/)).toHaveLength(1);
  });

  it('counts every hidden reply in "Ler mais"', async () => {
    const tree = makeWideTree();
    tree[0]!.replies[1]!.replies = [makeComment('c5', bia, { parentCommentId: 'c4' })];
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Ler mais 2 respostas' })).toBeOnTheScreen();
  });

  it('shows the empty message when there are no comments', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: [] }));
    await renderScreen();

    expect(screen.getByText('Nenhum comentário ainda')).toBeOnTheScreen();
    expect(screen.getByText('Seja a primeira pessoa a comentar.')).toBeOnTheScreen();
    // The anchor stays above it.
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
  });

  it('shows a spinner under the post while comments load, not the empty message', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: undefined, isPending: true }));
    await renderScreen();

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByTestId('comments-loading')).toBeOnTheScreen();
    expect(screen.queryByText('Nenhum comentário ainda')).toBeNull();
  });

  it('offers a retry when the comments fail to load', async () => {
    const refetch = jest.fn();
    mockedUseComments.mockReturnValue(
      commentsResult({ data: undefined, isError: true, error: new NetworkError(), refetch }),
    );
    await renderScreen();

    expect(screen.getByText('Não foi possível carregar os comentários')).toBeOnTheScreen();
    expect(screen.queryByText('Nenhum comentário ainda')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the comments on screen when a refresh fails', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ isError: true, error: new NetworkError() }));
    await renderScreen();

    expect(screen.getByText('texto c1')).toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar os comentários')).toBeNull();
  });

  it('toggles the like of the comment from the cached tree', async () => {
    const tree = makeTree();
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    await renderScreen();

    await fireEvent.press(screen.getAllByLabelText('Curtir comentário, 2 curtidas')[0]);

    expect(toggleLike).toHaveBeenCalledTimes(1);
    expect(toggleLike).toHaveBeenCalledWith(tree[0]);
  });

  it('toggles the like of a reply with the cached reply', async () => {
    const tree = makeTree();
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    await renderScreen();

    await fireEvent.press(screen.getAllByLabelText('Curtir comentário, 2 curtidas')[2]);

    expect(toggleLike).toHaveBeenCalledWith(tree[0].replies[0].replies[0]);
  });

  it('labels liked comments and uses the singular for one like', async () => {
    const liked = makeComment('c1', ana, { likedByMe: true, likeCount: 1 });
    mockedUseComments.mockReturnValue(commentsResult({ data: [liked] }));
    await renderScreen();

    expect(screen.getByLabelText('Descurtir comentário, 1 curtida')).toBeOnTheScreen();
  });

  it('labels the reply button with the author', async () => {
    await renderScreen();

    expect(screen.getByRole('button', { name: 'Responder a Ana Souza' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Responder a bia' })).toBeOnTheScreen();
  });

  it('opens the author profile from the avatar and the name of a comment', async () => {
    await renderScreen();

    // One exposed link per comment (the name, an inline text link); the avatar link is touch-only.
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Caio' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de bia' }));
    // The anchor and the three comments each have a touch-only avatar link, a real 48 dp box.
    const avatars = screen.getAllByTestId('author-avatar-link', HIDDEN);
    expect(avatars).toHaveLength(4);
    for (const avatar of avatars) expect(avatar).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(avatars[3]);

    expect(mockPush).toHaveBeenNthCalledWith(1, '/users/u3');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/users/u2');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/users/u3');
  });
});

describe('PostDetailScreen composer', () => {
  it('sends the trimmed text as a root comment and clears the field', async () => {
    await renderScreen();

    await typeComment('  Boa review!  ');
    await send();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Boa review!' });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('parentCommentId');
    // The comment is sent: the composer gives way to the prompt again.
    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('cannot send whitespace only or an empty field', async () => {
    await renderScreen();
    await openComposer();
    const button = () => screen.getByRole('button', { name: 'Enviar comentário' });
    expect(button()).toBeDisabled();

    await typeComment('   \n ');
    expect(button()).toBeDisabled();
    await send();

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('cannot send more than 500 characters', async () => {
    await renderScreen();

    await typeComment('a'.repeat(501));
    expect(screen.getByRole('button', { name: 'Enviar comentário' })).toBeDisabled();

    await typeComment('a'.repeat(500));
    expect(screen.getByRole('button', { name: 'Enviar comentário' })).toBeEnabled();
  });

  it('limits the field to 500 characters', async () => {
    await renderScreen();
    await openComposer();

    expect(screen.getByPlaceholderText('Escreva um comentário').props.maxLength).toBe(500);
  });

  it('replies to a reply: sends that reply as the parent and clears the target', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    // The bar above the field names who the reply answers.
    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Escreva sua resposta')).toBeOnTheScreen();

    await typeComment('Concordo');
    await send();

    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Concordo', parentCommentId: 'c2' });
    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancelar resposta' })).toBeNull();

    // The next prompt press writes on the post, not on the comment answered before.
    await typeComment('Outra');
    await send();
    expect(mutateAsync).toHaveBeenLastCalledWith({ content: 'Outra' });
    expect(mutateAsync.mock.calls[1][0]).not.toHaveProperty('parentCommentId');
  });

  it('shows the reply bar in addition to the reply prefix of the comment', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: makeWideTree() }));
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais 1 resposta' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Ana Souza' }));

    // c4's own prefix is also "Respondendo a @ana", and so is the bar.
    expect(screen.getAllByText('Respondendo a @ana')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cancelar resposta' })).toBeOnTheScreen();
  });

  it('replies to a comment shown on "Ler mais" with that comment as the parent', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: makeWideTree() }));
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais 1 resposta' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Dani' }));
    await typeComment('Também');
    await send();

    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Também', parentCommentId: 'c4' });
  });

  it('drops the reply target when the reply is cancelled', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    await typeComment('Oi');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar resposta' }));
    // A draft keeps the composer open, now for a comment on the post.
    expect(screen.getByPlaceholderText('Escreva um comentário').props.value).toBe('Oi');
    expect(screen.queryByRole('button', { name: 'Cancelar resposta' })).toBeNull();
    await send();

    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Oi' });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('parentCommentId');
  });

  it('keeps the text and the reply target and shows a toast when sending fails', async () => {
    const error = new NetworkError();
    mutateAsync.mockRejectedValueOnce(error);
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    await typeComment('Concordo');
    await send();

    expect(showToast).toHaveBeenCalledWith(authErrorMessage(error));
    expect(screen.getByPlaceholderText('Escreva sua resposta').props.value).toBe('Concordo');
    expect(screen.getByRole('button', { name: 'Cancelar resposta' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Enviar comentário' })).toBeEnabled();

    await send();

    expect(mutateAsync).toHaveBeenLastCalledWith({ content: 'Concordo', parentCommentId: 'c2' });
  });

  it('disables sending while a comment is being sent', async () => {
    let finish: () => void = () => {};
    mutateAsync.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    await renderScreen();

    await typeComment('Oi');
    await send();
    expect(screen.getByRole('button', { name: 'Enviar comentário' })).toBeDisabled();
    await send();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
  });
});

describe('PostDetailScreen reply prompt', () => {
  /** The keyboard-controller event the composer listens to, as the last subscription got it. */
  function hideKeyboard() {
    const calls = jest
      .mocked(KeyboardEvents.addListener)
      .mock.calls.filter(([event]) => event === 'keyboardDidHide');
    return act(async () => calls[calls.length - 1]![1]({} as never));
  }

  it('shows the prompt instead of the composer, over the thread', async () => {
    await renderScreen();

    expect(prompt()).toBeOnTheScreen();
    expect(queryField()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar comentário' })).toBeNull();
    expect(screen.queryByText(/^Respondendo a @/)).toBeNull();
  });

  it('swaps the prompt for the focused composer, with a tap haptic', async () => {
    await renderScreen();

    await openComposer();

    expect(haptic).toHaveBeenCalledWith('tap');
    expect(queryPrompt()).toBeNull();
    expect(field().props.placeholder).toBe('Escreva um comentário');
    expect(focus).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^Respondendo a @/)).toBeNull();
  });

  it('opens the composer for a comment from its Responder button, focused, with the bar', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));

    expect(queryPrompt()).toBeNull();
    expect(screen.getByText('Respondendo a @caio')).toBeOnTheScreen();
    expect(field().props.placeholder).toBe('Escreva sua resposta');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the open composer again when another comment is answered', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));

    expect(screen.getByText('Respondendo a @caio')).toBeOnTheScreen();
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('goes back to the prompt when the field loses focus with nothing typed', async () => {
    await renderScreen();
    await openComposer();

    await fireEvent(field(), 'blur');

    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
  });

  it('keeps the composer, and the reply target, when the keyboard goes away while answering', async () => {
    // A sheet or dialog opened from the thread hides the keyboard too.
    const blur = TextInput.prototype.blur as unknown as jest.Mock;
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));

    await fireEvent(field(), 'blur');
    await hideKeyboard();

    expect(queryPrompt()).toBeNull();
    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();
    expect(blur).toHaveBeenCalled();
    await typeComment('Depois');
    await send();
    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Depois', parentCommentId: 'c2' });
  });

  it('keeps the reply target while the menu of a comment is used with an empty field', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));

    // Opening the sheet takes the keyboard down.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Mais opções do comentário' })[2]!);
    await fireEvent(field(), 'blur');
    await hideKeyboard();

    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();
  });

  it('blurs the field when the keyboard goes away with a draft, so asking again brings it back', async () => {
    const blur = TextInput.prototype.blur as unknown as jest.Mock;
    await renderScreen();
    await typeComment('Rascunho');
    focus.mockClear();
    blur.mockClear();

    await hideKeyboard();

    // Left with native focus, the field would ignore the next focus() call.
    expect(blur).toHaveBeenCalledTimes(1);
    expect(field().props.value).toBe('Rascunho');

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));
    expect(focus).toHaveBeenCalledTimes(1);
    await hideKeyboard();
    await fireEvent.press(screen.getByRole('button', { name: 'Comentar, 3 comentários' }));
    expect(focus).toHaveBeenCalledTimes(2);
  });

  it('goes back to the prompt when the keyboard is hidden with nothing typed', async () => {
    await renderScreen();
    await openComposer();
    await typeComment('   ');

    await hideKeyboard();

    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
  });

  it('keeps the composer, and the draft, when the keyboard goes away with text typed', async () => {
    await renderScreen();
    await typeComment('Quase pronto');

    await fireEvent(field(), 'blur');
    await hideKeyboard();

    expect(queryPrompt()).toBeNull();
    expect(field().props.value).toBe('Quase pronto');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps the draft when another comment is chosen to answer', async () => {
    await renderScreen();
    await typeComment('Meu rascunho');

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));

    expect(field().props.value).toBe('Meu rascunho');
    expect(screen.getByText('Respondendo a @caio')).toBeOnTheScreen();
    await send();
    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Meu rascunho', parentCommentId: 'c3' });
  });

  it('focuses a composer that holds a draft again from the comment counter of the anchor', async () => {
    await renderScreen();
    await typeComment('Rascunho');
    await fireEvent(field(), 'blur');
    focus.mockClear();

    await fireEvent.press(screen.getByRole('button', { name: 'Comentar, 3 comentários' }));

    expect(field().props.value).toBe('Rascunho');
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('goes back to the prompt when the reply is cancelled with nothing typed', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar resposta' }));

    expect(queryField()).toBeNull();
    expect(prompt()).toBeOnTheScreen();
  });

  it('hides the keyboard once the comment is sent', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    await renderScreen();
    await typeComment('Oi');

    await send();

    expect(dismiss).toHaveBeenCalled();
    expect(prompt()).toBeOnTheScreen();
    dismiss.mockRestore();
  });

  it('keeps the composer, and the reply target, when sending fails', async () => {
    mutateAsync.mockRejectedValueOnce(new NetworkError());
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    await typeComment('Oi');
    await send();

    expect(queryPrompt()).toBeNull();
    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();
  });

  it('keeps the keyboard offset with the composer open', async () => {
    await renderScreen(52);
    await openComposer();

    expect(screen.getByTestId('post-keyboard-avoider').props.keyboardVerticalOffset).toBe(52);
  });
});

describe('PostDetailScreen header menu', () => {
  it('drops the thread menu from the header when the post turns out to be gone', async () => {
    await renderScreen();
    expect(screen.getByRole('button', { name: 'Opções da conversa' })).toBeOnTheScreen();
    expect(mockScreenOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ headerRight: expect.any(Function) }),
    );

    mockedUsePost.mockReturnValue(
      postResult({ data: undefined, isError: true, error: new ApiError(404, 'NOT_FOUND', 'x') }),
    );
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <PostDetailScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('Post não encontrado')).toBeOnTheScreen();
    // The header keeps the last options it was given: the button must be unset explicitly.
    const options = mockScreenOptions.mock.lastCall![0];
    expect(options).toHaveProperty('headerRight');
    expect(options.headerRight).toBeUndefined();
  });

  it('unsets the thread menu while the post loads', async () => {
    mockedUsePost.mockReturnValue(postResult({ data: undefined, isPending: true }));
    await renderScreen();

    const options = mockScreenOptions.mock.lastCall![0];
    expect(options).toHaveProperty('headerRight');
    expect(options.headerRight).toBeUndefined();
  });
});

describe('PostDetailScreen comment actions', () => {
  const moreButtons = () => screen.getAllByRole('button', { name: 'Mais opções do comentário' });

  it('copies the text of a comment from its menu', async () => {
    await renderScreen();

    await fireEvent.press(moreButtons()[1]!);
    expect(screen.queryByRole('button', { name: 'Apagar comentário' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar texto' }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('texto c2');
    expect(showToast).toHaveBeenCalledWith('Texto copiado');
  });

  it('deletes the own comment after confirming, with the comment from the cached tree', async () => {
    const tree = makeTree();
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    signIn('u2');
    await renderScreen();

    await fireEvent.press(moreButtons()[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    expect(screen.getByText('Apagar comentário?')).toBeOnTheScreen();
    expect(deleteComment).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));

    expect(deleteComment).toHaveBeenCalledTimes(1);
    expect(deleteComment).toHaveBeenCalledWith(tree[0]!.replies[0], expect.any(Object));
  });

  it('deletes a comment once: its row waits dimmed and out of reach until the deletion settles', async () => {
    signIn('u2');
    await renderScreen();
    expect(screen.queryByTestId('comment-row-deleting')).toBeNull();

    await fireEvent.press(moreButtons()[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    expect(deleteComment).toHaveBeenCalledTimes(1);

    // c2 and its reply c3 wait; c1 does not.
    const waiting = screen.getAllByTestId('comment-row-deleting');
    expect(waiting).toHaveLength(2);
    expect(waiting[0]).toHaveStyle({ opacity: 0.5 });
    expect(waiting[0]).toHaveProp('pointerEvents', 'none');

    // The row takes no touch, so its menu cannot be opened for a second delete.
    await fireEvent.press(moreButtons()[1]!);
    expect(screen.queryByRole('button', { name: 'Apagar comentário' })).toBeNull();
    expect(deleteComment).toHaveBeenCalledTimes(1);

    // A failed deletion settles too: the row is back and can be deleted again.
    await act(async () => deleteComment.mock.calls[0][1].onSettled());
    expect(screen.queryByTestId('comment-row-deleting')).toBeNull();
    await fireEvent.press(moreButtons()[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    expect(deleteComment).toHaveBeenCalledTimes(2);
  });

  it('keeps the comment when the deletion is cancelled', async () => {
    signIn('u2');
    await renderScreen();

    await fireEvent.press(moreButtons()[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(deleteComment).not.toHaveBeenCalled();
  });

  it('offers deleting only on the own comments', async () => {
    signIn('u2');
    await renderScreen();

    await fireEvent.press(moreButtons()[0]!);

    expect(screen.getByRole('button', { name: 'Copiar texto' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Apagar comentário' })).toBeNull();
  });

  it('drops the reply target once the comment it answers, or an ancestor, is deleted', async () => {
    signIn('u2');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));
    expect(screen.getByText('Respondendo a @caio')).toBeOnTheScreen();
    await fireEvent.press(moreButtons()[1]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    // c3 answers c2, so deleting c2 takes c3 and the reply to it away.
    await act(async () => deleteComment.mock.calls[0][1].onSuccess());

    expect(screen.queryByRole('button', { name: 'Cancelar resposta' })).toBeNull();
    expect(screen.getByPlaceholderText('Escreva um comentário')).toBeOnTheScreen();
  });

  it('keeps the reply target when another branch is deleted', async () => {
    const other = makeComment('c9', bia);
    mockedUseComments.mockReturnValue(commentsResult({ data: [...makeTree(), other] }));
    signIn('u2');
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));
    await fireEvent.press(moreButtons()[3]!);
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar comentário' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    expect(deleteComment).toHaveBeenCalledWith(other, expect.any(Object));
    await act(async () => deleteComment.mock.calls[0][1].onSuccess());

    expect(screen.getByRole('button', { name: 'Cancelar resposta' })).toBeOnTheScreen();
  });

  it('shows the comments again without the deleted one once the cache drops it', async () => {
    const tree = makeTree();
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    await renderScreen();
    expect(screen.getByText('texto c3')).toBeOnTheScreen();

    // The delete mutation takes c2 and its reply c3 out of the cached tree.
    mockedUseComments.mockReturnValue(
      commentsResult({ data: [{ ...tree[0]!, replies: [] }] }),
    );
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <PostDetailScreen />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('texto c1')).toBeOnTheScreen();
    expect(screen.queryByText('texto c2')).toBeNull();
    expect(screen.queryByText('texto c3')).toBeNull();
  });
});

/**
 * c1 (Ana) ─┬─ c2 (bia) ── c3 (Caio) ── c5 (bia) ── c6 (Dani) ── c7 (Ana)
 *           └─ c4 (Dani)
 * The tree view nests four levels: c6 and c7 hide under c5's "Ler mais".
 */
function makeDeepTree(): Comment[] {
  const c7 = makeComment('c7', ana, { parentCommentId: 'c6' });
  const c6 = makeComment('c6', dani, { parentCommentId: 'c5', replies: [c7] });
  const c5 = makeComment('c5', bia, { parentCommentId: 'c3', replies: [c6] });
  const c3 = makeComment('c3', caio, { parentCommentId: 'c2', replies: [c5] });
  const c2 = makeComment('c2', bia, { parentCommentId: 'c1', replies: [c3] });
  const c4 = makeComment('c4', dani, { parentCommentId: 'c1' });
  return [makeComment('c1', ana, { replies: [c2, c4] })];
}

function commentTexts(): string[] {
  return screen.getAllByTestId('comment-text').map((node) => node.props.children as string);
}

async function openThreadMenu() {
  await fireEvent.press(screen.getByRole('button', { name: 'Opções da conversa' }));
}

describe('PostDetailScreen view and order', () => {
  let scrollToOffset: jest.SpyInstance;
  beforeEach(() => {
    scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  });
  afterEach(() => scrollToOffset.mockRestore());

  it('asks for the comments in the order kept in the preferences', async () => {
    usePreferences.setState({ threadSort: 'top' });
    await renderScreen();

    expect(mockedUseComments).toHaveBeenCalledWith(POST_ID, 'top');
    expect(mockedUseComments).not.toHaveBeenCalledWith(POST_ID, 'oldest');
  });

  it('shows the kept view: the tree view when chosen before', async () => {
    usePreferences.setState({ threadView: 'tree' });
    mockedUseComments.mockReturnValue(commentsResult({ data: makeDeepTree() }));
    await renderScreen();

    expect(screen.getAllByTestId('thread-item-tree')).toHaveLength(5);
    expect(screen.queryByTestId('thread-item-linear')).toBeNull();
  });

  it('offers the view and the order in the header menu, with the current ones checked', async () => {
    usePreferences.setState({ threadSort: 'newest' });
    await renderScreen();

    await openThreadMenu();

    expect(screen.getByRole('header', { name: 'Mostrar respostas como' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Em linha' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Em árvore' })).not.toBeSelected();
    expect(screen.getByRole('header', { name: 'Ordenar respostas' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mais novas' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Mais curtidas' })).not.toBeSelected();
    expect(screen.getByRole('button', { name: 'Mais antigas' })).not.toBeSelected();
  });

  it('asks for the new order once chosen, keeps it and brings the post back to the top', async () => {
    await renderScreen();
    expect(mockedUseComments).toHaveBeenLastCalledWith(POST_ID, 'oldest');

    await openThreadMenu();
    await fireEvent.press(screen.getByRole('button', { name: 'Mais curtidas' }));

    expect(mockedUseComments).toHaveBeenLastCalledWith(POST_ID, 'top');
    expect(usePreferences.getState().threadSort).toBe('top');
    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    // The post stays the list's first item, held in place while the replies change.
    expect(screen.getByLabelText(POST_LABEL)).toBeOnTheScreen();
    expect(screen.getByTestId('comment-list').props.maintainVisibleContentPosition).toEqual({
      minIndexForVisible: 0,
    });
  });

  it('shows a spinner under the post while the new order loads', async () => {
    await renderScreen();
    mockedUseComments.mockImplementation((_postId, sort) =>
      sort === 'top' ? commentsResult({ data: undefined, isPending: true }) : commentsResult(),
    );

    await openThreadMenu();
    await fireEvent.press(screen.getByRole('button', { name: 'Mais curtidas' }));

    expect(screen.getByLabelText(POST_LABEL)).toBeOnTheScreen();
    expect(screen.getByTestId('comments-loading')).toBeOnTheScreen();
    expect(screen.queryByText('texto c1')).toBeNull();
  });

  it('does not move the list when the current choice is picked again', async () => {
    await renderScreen();

    await openThreadMenu();
    await fireEvent.press(screen.getByRole('button', { name: 'Em linha' }));

    expect(scrollToOffset).not.toHaveBeenCalled();
  });

  it('switches to the tree view from the menu, keeps it and pins the post', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: makeWideTree() }));
    await renderScreen();
    // The linear view hides c4 under "Ler mais".
    expect(screen.queryByText('texto c4')).toBeNull();

    await openThreadMenu();
    await fireEvent.press(screen.getByRole('button', { name: 'Em árvore' }));

    expect(usePreferences.getState().threadView).toBe('tree');
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: false });
    // Same order, no new request: the tree shows every reply nested under its parent.
    expect(mockedUseComments).toHaveBeenLastCalledWith(POST_ID, 'oldest');
    expect(commentTexts()).toEqual(['texto c1', 'texto c2', 'texto c3', 'texto c4']);
    expect(screen.queryByTestId('thread-item-linear')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ler mais/ })).toBeNull();
    // c2, c3 and c4 come in through an elbow; c1 starts the branch.
    expect(screen.getAllByTestId('thread-tree-elbow')).toHaveLength(3);
    // c2's rail runs on to its later sibling c4, past c3.
    expect(screen.getAllByTestId('thread-tree-rail')).toHaveLength(2);
  });

  it('collapses the replies below the fourth level into "Ler mais" and shows them on press', async () => {
    usePreferences.setState({ threadView: 'tree' });
    mockedUseComments.mockReturnValue(commentsResult({ data: makeDeepTree() }));
    await renderScreen();

    expect(commentTexts()).toEqual(['texto c1', 'texto c2', 'texto c3', 'texto c5', 'texto c4']);
    await fireEvent.press(screen.getByRole('button', { name: 'Ler mais 2 respostas' }));

    expect(commentTexts()).toEqual([
      'texto c1',
      'texto c2',
      'texto c3',
      'texto c5',
      'texto c6',
      'texto c7',
      'texto c4',
    ]);
    expect(screen.queryByRole('button', { name: /^Ler mais/ })).toBeNull();
    // c7 hangs from c5 with c6, so it names the comment it answers.
    expect(screen.getAllByText(/^Respondendo a @/).map((node) => node.props.children)).toEqual([
      'Respondendo a @dani',
    ]);
  });

  it('replies to a nested comment of the tree with that comment as the parent', async () => {
    usePreferences.setState({ threadView: 'tree' });
    mockedUseComments.mockReturnValue(commentsResult({ data: makeDeepTree() }));
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Caio' }));
    await typeComment('Boa');
    await send();

    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Boa', parentCommentId: 'c3' });
  });

  it('likes a nested comment of the tree with the cached comment', async () => {
    usePreferences.setState({ threadView: 'tree' });
    const tree = makeDeepTree();
    mockedUseComments.mockReturnValue(commentsResult({ data: tree }));
    await renderScreen();

    await fireEvent.press(
      within(screen.getAllByTestId('thread-item-tree')[3]!).getByRole('button', {
        name: 'Curtir comentário, 2 curtidas',
      }),
    );

    expect(toggleLike).toHaveBeenCalledWith(tree[0]!.replies[0]!.replies[0]!.replies[0]);
  });

  it('keeps the composer above the keyboard in the tree view', async () => {
    usePreferences.setState({ threadView: 'tree' });
    await renderScreen(64);

    expect(screen.getByTestId('post-keyboard-avoider').props.keyboardVerticalOffset).toBe(64);
  });
});

describe('PostDetailScreen deleting the post', () => {
  async function deleteFromTheMenu() {
    signIn('u1');
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar post' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));
    expect(mockDeletePost).toHaveBeenCalledWith(
      expect.objectContaining({ id: POST_ID }),
      expect.any(Object),
    );
    await act(async () => mockDeletePost.mock.calls[0][1].onSuccess());
  }

  it('leaves the page once the own post is deleted', async () => {
    await deleteFromTheMenu();

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes to the feed when there is no page to go back to', async () => {
    mockCanGoBack.mockReturnValueOnce(false);
    await deleteFromTheMenu();

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
