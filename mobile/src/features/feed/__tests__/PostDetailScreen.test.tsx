import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authErrorMessage } from '@/features/auth';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { PostDetailScreen } from '../PostDetailScreen';
import { useAddComment, useComments, usePost, useToggleCommentLike } from '../queries';
import type { Comment, Post } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

jest.mock('../queries', () => ({
  usePost: jest.fn(),
  useComments: jest.fn(),
  useAddComment: jest.fn(),
  useToggleCommentLike: jest.fn(),
  useTogglePostLike: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | string[]> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
  // The header is rendered in place so the tests can read its title.
  Stack: {
    Screen: ({ options }: { options?: { title?: string } }) => {
      const { Text } = jest.requireActual('react-native');
      return <Text testID="header-title">{options?.title}</Text>;
    },
  },
}));

const mockedUsePost = jest.mocked(usePost);
const mockedUseComments = jest.mocked(useComments);
const mockedUseAddComment = jest.mocked(useAddComment);
const mockedUseToggleCommentLike = jest.mocked(useToggleCommentLike);

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

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PostDetailScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  // Only the clock is faked: timers stay real so Testing Library keeps working.
  jest.useFakeTimers({
    now: new Date('2026-10-20T12:00:00.000Z'),
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'],
  });
  jest.clearAllMocks();
  mockParams = { postId: POST_ID };
  mockedUsePost.mockReturnValue(postResult());
  mockedUseComments.mockReturnValue(commentsResult());
  mutateAsync.mockResolvedValue(undefined);
  mockedUseAddComment.mockReturnValue({ mutateAsync } as unknown as ReturnType<
    typeof useAddComment
  >);
  mockedUseToggleCommentLike.mockReturnValue({ mutate: toggleLike } as unknown as ReturnType<
    typeof useToggleCommentLike
  >);
});

afterEach(() => {
  jest.useRealTimers();
});

async function typeComment(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText(/^Escreva /), text);
}

async function send() {
  await fireEvent.press(screen.getByRole('button', { name: 'Enviar comentário' }));
}

describe('PostDetailScreen post', () => {
  it('reads the post and comments of the address', async () => {
    await renderScreen();

    expect(mockedUsePost).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseComments).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseAddComment).toHaveBeenCalledWith(POST_ID);
    expect(mockedUseToggleCommentLike).toHaveBeenCalledWith(POST_ID);
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

  it('shows the comment counter of the header post as inert text', async () => {
    await renderScreen();

    expect(screen.getByLabelText('3 comentários')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '3 comentários' })).toBeNull();
    await fireEvent.press(screen.getByLabelText('3 comentários'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows the comment count under the post', async () => {
    await renderScreen();

    expect(screen.getByText('Comentários (3)')).toBeOnTheScreen();
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
    mockedUsePost.mockReturnValue(
      postResult({ isError: true, error: new ApiError(404, 'NOT_FOUND', 'x') }),
    );
    await renderScreen();

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.queryByText('Post não encontrado')).toBeNull();
  });
});

describe('PostDetailScreen comments', () => {
  it('shows each comment with author, content and the reply target of replies', async () => {
    await renderScreen();

    expect(screen.getByText('texto c1')).toBeOnTheScreen();
    expect(screen.getByText('texto c2')).toBeOnTheScreen();
    expect(screen.getByText('texto c3')).toBeOnTheScreen();
    // c1 is a root; c2 answers Ana; c3 answers a reply, so it names bia.
    expect(screen.getAllByText(/^Respondendo a @/)).toHaveLength(2);
    expect(screen.getByText('Respondendo a @ana')).toBeOnTheScreen();
    expect(screen.getByText('Respondendo a @bia')).toBeOnTheScreen();
    expect(screen.getByText('bia')).toBeOnTheScreen();
    expect(screen.getByText('Caio')).toBeOnTheScreen();
  });

  it('shows the empty message when there are no comments', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: [] }));
    await renderScreen();

    expect(screen.getByText('Ainda não há comentários. Seja o primeiro.')).toBeOnTheScreen();
  });

  it('shows a spinner under the title while comments load, not the empty message', async () => {
    mockedUseComments.mockReturnValue(commentsResult({ data: undefined, isPending: true }));
    await renderScreen();

    expect(screen.getByText('Comentários (3)')).toBeOnTheScreen();
    expect(screen.getByTestId('comments-loading')).toBeOnTheScreen();
    expect(screen.queryByText('Ainda não há comentários. Seja o primeiro.')).toBeNull();
  });

  it('offers a retry when the comments fail to load', async () => {
    const refetch = jest.fn();
    mockedUseComments.mockReturnValue(
      commentsResult({ data: undefined, isError: true, error: new NetworkError(), refetch }),
    );
    await renderScreen();

    expect(screen.getByText('Não foi possível carregar os comentários')).toBeOnTheScreen();
    expect(screen.queryByText('Ainda não há comentários. Seja o primeiro.')).toBeNull();
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

    // One exposed link per comment (the name, a full 48 dp tall); the avatar link is touch-only.
    const caioLink = screen.getByRole('button', { name: 'Perfil de Caio' });
    expect(caioLink).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(caioLink);
    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de bia' }));
    // The post header and the three comments each have a touch-only avatar link.
    const avatars = screen.getAllByTestId('author-avatar-link', HIDDEN);
    expect(avatars).toHaveLength(4);
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
    expect(screen.getByPlaceholderText('Escreva um comentário').props.value).toBe('');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('cannot send whitespace only or an empty field', async () => {
    await renderScreen();
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

    expect(screen.getByPlaceholderText('Escreva um comentário').props.maxLength).toBe(500);
  });

  it('replies to a reply: sends that reply as the parent and clears the target', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    // c3 already says it answers bia; the bar above the field is the second one.
    expect(screen.getAllByText('Respondendo a @bia')).toHaveLength(2);
    expect(screen.getByPlaceholderText('Escreva sua resposta')).toBeOnTheScreen();

    await typeComment('Concordo');
    await send();

    expect(mutateAsync).toHaveBeenCalledWith({ content: 'Concordo', parentCommentId: 'c2' });
    expect(screen.getByPlaceholderText('Escreva um comentário').props.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Cancelar resposta' })).toBeNull();
  });

  it('shows the reply bar in addition to the reply prefix of the comment', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a Ana Souza' }));

    // c2's own prefix is also "Respondendo a @ana", and so is the bar.
    expect(screen.getAllByText('Respondendo a @ana')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cancelar resposta' })).toBeOnTheScreen();
  });

  it('drops the reply target when the reply is cancelled', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Responder a bia' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar resposta' }));
    expect(screen.getByPlaceholderText('Escreva um comentário')).toBeOnTheScreen();
    await typeComment('Oi');
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
    expect(screen.getByPlaceholderText('Escreva um comentário').props.value).toBe('');
  });
});
