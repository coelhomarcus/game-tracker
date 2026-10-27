import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ReactElement } from 'react';
import { Share } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { socialDefaults } from '@/test-utils/postDefaults';
import { colors } from '@/theme/tokens';

import { useSetModeration } from '@/features/profiles/queries';

import { PostControls } from '../PostControls';
import {
  useDeletePost,
  useTogglePostBookmark,
  useTogglePostLike,
  useTogglePostRepost,
} from '../queries';
import type { Post } from '../types';

jest.mock('../queries', () => ({
  useTogglePostLike: jest.fn(),
  useTogglePostRepost: jest.fn(),
  useTogglePostBookmark: jest.fn(),
  useDeletePost: jest.fn(),
}));
jest.mock('@/features/profiles/queries', () => ({ useSetModeration: jest.fn() }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

// The window width decides where "Compartilhar" goes.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockedWindow = jest.mocked(
  jest.requireMock<{ default: jest.Mock }>('react-native/Libraries/Utilities/useWindowDimensions')
    .default,
);
function windowWidth(width: number) {
  mockedWindow.mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
}

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const like = { mutate: jest.fn() };
const repost = { mutate: jest.fn() };
const bookmark = { mutate: jest.fn() };
const remove = { mutate: jest.fn() };
const mute = { mutate: jest.fn() };
const block = { mutate: jest.fn() };

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 24, left: 0, right: 0, bottom: 0 },
};

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: ana,
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date('2026-10-20T12:00:00.000Z'),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 3,
    commentCount: 2,
    likedByMe: false,
    ...socialDefaults,
    repostCount: 1,
    quoteCount: 2,
    ...overrides,
  };
}

function withSafeArea(element: ReactElement) {
  return <SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>;
}

function signIn(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id } as ReturnType<typeof useSession.getState>['user'],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useTogglePostLike).mockReturnValue(like as never);
  jest.mocked(useTogglePostRepost).mockReturnValue(repost as never);
  jest.mocked(useTogglePostBookmark).mockReturnValue(bookmark as never);
  jest.mocked(useDeletePost).mockReturnValue(remove as never);
  jest.mocked(useSetModeration).mockImplementation(((kind: string) =>
    (kind === 'mutes' ? mute : block)) as never);
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  jest.mocked(useReducedMotion).mockReturnValue(false);
  signIn('someone-else');
  windowWidth(412);
});

afterAll(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('PostControls bar', () => {
  it('labels every control, with the counts', async () => {
    await render(<PostControls post={post()} onReply={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Comentar, 2 comentários' })).toBeOnTheScreen();
    // Quotes count as reposts.
    expect(screen.getByRole('button', { name: 'Repostar, 3 reposts' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Salvar post' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Mais opções' })).toBeOnTheScreen();
  });

  it('labels the active state and the singular', async () => {
    const active = post({
      commentCount: 1,
      likeCount: 1,
      likedByMe: true,
      repostCount: 1,
      quoteCount: 0,
      repostedByMe: true,
      bookmarkedByMe: true,
    });
    await render(<PostControls post={active} onReply={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Comentar, 1 comentário' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Desfazer repost, 1 repost' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Descurtir post, 1 curtida' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remover dos salvos' })).toBeOnTheScreen();
  });

  it('hides counts at zero and shows them compact', async () => {
    const quiet = post({ commentCount: 0, likeCount: 1234, repostCount: 0, quoteCount: 0 });
    await render(<PostControls post={quiet} onReply={jest.fn()} />);

    expect(screen.queryByText('0')).toBeNull();
    expect(screen.getByText('1,2 mil')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Curtir post, 1234 curtidas' })).toBeOnTheScreen();
  });

  it('uses the plural for zero in the labels', async () => {
    const quiet = post({ commentCount: 0, likeCount: 0, repostCount: 0, quoteCount: 0 });
    await render(<PostControls post={quiet} onReply={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Comentar, 0 comentários' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Curtir post, 0 curtidas' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Repostar, 0 reposts' })).toBeOnTheScreen();
  });

  it('colors the counts of active controls and sets them semibold', async () => {
    await render(
      <PostControls post={post({ likedByMe: true, likeCount: 4, repostedByMe: true })} />,
    );

    const likes = screen.getByText('4');
    expect(likes).toHaveStyle({ color: colors.like });
    const reposts = screen.getByText('3');
    expect(reposts).toHaveStyle({ color: colors.repost });
    expect(screen.getByText('2')).toHaveStyle({ color: colors.textMedium });
    expect(likes.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontFamily: expect.stringMatching(/SemiBold/i) })]),
    );
  });

  it('gives every control a real 48 dp touch box and keeps the reference layout', async () => {
    await render(<PostControls post={post()} onReply={jest.fn()} />);

    const bar = screen.getByTestId('post-controls');
    expect(bar).toHaveStyle({ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 });
    // `space-between` parts the groups; a gap would only take room from the left slots.
    expect(bar).not.toHaveStyle({ gap: 12 });
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveStyle({ minHeight: 48, minWidth: 48 });
    }
    for (const name of ['Salvar post', 'Compartilhar', 'Mais opções']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ width: 48 });
    }
    // The comment icon lines up with the text column, its touch box inside it.
    expect(screen.getByRole('button', { name: 'Comentar, 2 comentários' })).toHaveStyle({
      paddingLeft: 0,
    });
  });
});

describe('PostControls comment and like', () => {
  it('opens the post to comment, with a tap haptic', async () => {
    const onReply = jest.fn();
    await render(<PostControls post={post()} onReply={onReply} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Comentar, 2 comentários' }));

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('tap');
  });

  it('shows the comment counter as plain text without onReply', async () => {
    await render(<PostControls post={post()} />);

    expect(screen.getByLabelText('2 comentários')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /comentário/ })).toBeNull();
  });

  it('toggles the like with the post it received', async () => {
    const received = post();
    await render(<PostControls post={received} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' }));

    expect(like.mutate).toHaveBeenCalledTimes(1);
    expect(like.mutate).toHaveBeenCalledWith(received);
    expect(haptic).toHaveBeenCalledWith('tap');
  });
});

describe('PostControls like animation', () => {
  it('bursts the heart and rolls the count only after the user likes', async () => {
    await render(<PostControls post={post()} />);
    expect(screen.getByTestId('like-icon-outline')).toBeOnTheScreen();

    // A like that arrives from a refetch does not animate.
    await screen.rerender(<PostControls post={post({ likedByMe: true, likeCount: 4 })} />);
    expect(screen.getByTestId('like-icon-filled')).toBeOnTheScreen();
    expect(screen.queryByTestId('like-burst')).toBeNull();
    expect(screen.queryByTestId('count-wheel-previous', { includeHiddenElements: true })).toBeNull();

    await screen.rerender(<PostControls post={post()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' }));
    await screen.rerender(<PostControls post={post({ likedByMe: true, likeCount: 4 })} />);

    expect(screen.getByTestId('like-burst')).toBeOnTheScreen();
    // The old number rolls out while the new one rolls in; screen readers only hear the new one.
    const previous = screen.getByTestId('count-wheel-previous', { includeHiddenElements: true });
    expect(previous).toHaveTextContent('3');
    expect(screen.getByText('4')).toBeOnTheScreen();
  });

  it('skips the animations with reduced motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(<PostControls post={post()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' }));
    await screen.rerender(<PostControls post={post({ likedByMe: true, likeCount: 4 })} />);

    expect(screen.getByTestId('like-icon-filled')).toBeOnTheScreen();
    expect(screen.queryByTestId('like-burst')).toBeNull();
    expect(screen.queryByTestId('count-wheel-previous', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText('4')).toBeOnTheScreen();
  });
});

describe('PostControls repost', () => {
  it('offers Repostar, Citar and Cancelar, and reposts', async () => {
    const received = post();
    await render(withSafeArea(<PostControls post={received} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Repostar, 3 reposts' }));
    expect(screen.getByRole('button', { name: 'Citar' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Desfazer repost' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Repostar' }));

    expect(repost.mutate).toHaveBeenCalledWith(received);
    expect(haptic).toHaveBeenCalledWith('confirm');
    expect(screen.queryByRole('button', { name: 'Citar' })).toBeNull();
  });

  it('offers to undo a repost', async () => {
    const reposted = post({ repostedByMe: true });
    await render(withSafeArea(<PostControls post={reposted} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer repost, 3 reposts' }));
    expect(screen.queryByRole('button', { name: 'Repostar' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Desfazer repost' }));

    expect(repost.mutate).toHaveBeenCalledWith(reposted);
  });

  it('opens the composer to quote, from the sheet', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Repostar, 3 reposts' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Citar' }));

    expect(mockPush).toHaveBeenCalledWith('/posts/new?quote=p1');
    expect(repost.mutate).not.toHaveBeenCalled();
  });

  it('does nothing on Cancelar', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Repostar, 3 reposts' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(repost.mutate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Citar' })).toBeNull();
  });

  it('goes straight to the quote on a long press', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent(screen.getByRole('button', { name: 'Repostar, 3 reposts' }), 'longPress');

    expect(mockPush).toHaveBeenCalledWith('/posts/new?quote=p1');
    expect(haptic).toHaveBeenCalledWith('longPress');
    expect(screen.queryByRole('button', { name: 'Citar' })).toBeNull();
  });
});

describe('PostControls bookmark and share', () => {
  it('saves the post and says so', async () => {
    const received = post();
    await render(<PostControls post={received} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Salvar post' }));

    expect(bookmark.mutate).toHaveBeenCalledWith(received);
    expect(showToast).toHaveBeenCalledWith('Salvo');
  });

  it('removes a saved post and says so', async () => {
    await render(<PostControls post={post({ bookmarkedByMe: true })} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Remover dos salvos' }));

    expect(bookmark.mutate).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Removido dos salvos');
  });

  it('shares the author and the text', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await render(<PostControls post={post()} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(share).toHaveBeenCalledWith({ message: 'Ana Souza: Zerei de primeira!' });
    share.mockRestore();
  });
});

describe('PostControls more menu', () => {
  it('copies the text', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    expect(screen.queryByRole('button', { name: 'Apagar post' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Copiar texto' }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('Zerei de primeira!');
    expect(showToast).toHaveBeenCalledWith('Texto copiado');
  });

  it('deletes an own post after confirming', async () => {
    signIn('u1');
    const onDeleted = jest.fn();
    const received = post();
    await render(withSafeArea(<PostControls post={received} onDeleted={onDeleted} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar post' }));

    expect(screen.getByText('Apagar post?')).toBeOnTheScreen();
    expect(screen.getByText('Isso não pode ser desfeito.')).toBeOnTheScreen();
    expect(remove.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar' }));

    expect(remove.mutate).toHaveBeenCalledWith(received, expect.any(Object));
    expect(screen.queryByText('Apagar post?')).toBeNull();
    expect(onDeleted).not.toHaveBeenCalled();
    remove.mutate.mock.calls[0][1].onSuccess();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('keeps the post when the deletion is cancelled', async () => {
    signIn('u1');
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Apagar post' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(remove.mutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Apagar post?')).toBeNull();
  });

  it('offers only the mute and the block of the author on another person’s post without text', async () => {
    await render(withSafeArea(<PostControls post={post({ content: '' })} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));

    expect(screen.queryByRole('button', { name: 'Copiar texto' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Silenciar @ana' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Bloquear @ana' })).toBeOnTheScreen();
  });

  it('mutes the author at once with a toast', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Silenciar @ana' }));

    expect(mute.mutate).toHaveBeenCalledWith({ person: ana, on: true });
    expect(showToast).toHaveBeenCalledWith('@ana silenciado');
    expect(block.mutate).not.toHaveBeenCalled();
  });

  it('blocks the author only after confirming, then calls onDeleted to leave the page', async () => {
    const onDeleted = jest.fn();
    await render(withSafeArea(<PostControls post={post()} onDeleted={onDeleted} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Bloquear @ana' }));

    expect(screen.getByText('Bloquear @ana?')).toBeOnTheScreen();
    expect(
      screen.getByText('Vocês não verão os posts um do outro e @ana não poderá te seguir nem mandar mensagem.'),
    ).toBeOnTheScreen();
    expect(block.mutate).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Bloquear' }));

    expect(block.mutate).toHaveBeenCalledWith({ person: ana, on: true });
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it('keeps the author when the block is cancelled', async () => {
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Bloquear @ana' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(block.mutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Bloquear @ana?')).toBeNull();
  });

  it('offers no mute or block on the user’s own post', async () => {
    signIn('u1');
    await render(withSafeArea(<PostControls post={post()} />));

    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));

    expect(screen.queryByRole('button', { name: 'Silenciar @ana' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bloquear @ana' })).toBeNull();
  });
});

describe('PostControls on narrow and wide screens', () => {
  it('keeps Compartilhar on the bar of a 412 dp wide screen', async () => {
    windowWidth(412);
    await render(withSafeArea(<PostControls post={post()} />));

    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções' }));
    expect(screen.getAllByRole('button', { name: 'Compartilhar' })).toHaveLength(1);
  });

  it('moves Compartilhar into the "…" sheet on a 360 dp wide screen', async () => {
    windowWidth(360);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await render(withSafeArea(<PostControls post={post({ content: '' })} />));

    expect(screen.queryByRole('button', { name: 'Compartilhar' })).toBeNull();
    // Sharing is always on offer, so the menu is never empty.
    const more = screen.getByRole('button', { name: 'Mais opções' });
    expect(more).toBeEnabled();
    await fireEvent.press(more);
    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar' }));

    expect(share).toHaveBeenCalledWith({ message: 'Ana Souza' });
    share.mockRestore();
  });

  it('gives each left slot at least 48 dp and keeps long counts inside it', async () => {
    windowWidth(360);
    await render(<PostControls post={post({ commentCount: 1234, likeCount: 98_765 })} onReply={jest.fn()} />);

    const comment = screen.getByRole('button', { name: 'Comentar, 1234 comentários' });
    expect(comment.parent).toHaveStyle({ flex: 1, minWidth: 48 });
    expect(comment).toHaveStyle({ maxWidth: '100%' });
    const count = screen.getByText('1,2 mil');
    expect(count.props.numberOfLines).toBe(1);
    expect(count).toHaveStyle({ flexShrink: 1 });
    expect(screen.getAllByRole('button')).toHaveLength(5);
  });
});

describe('PostControls big variant', () => {
  it('draws 22 dp icons and medium counts for the post on its own page', async () => {
    await render(<PostControls big post={post()} onReply={jest.fn()} />);

    expect(screen.getByTestId('like-icon-outline')).toHaveStyle({ fontSize: 22 });
    // The repost (1 + 2 quotes) and like counters both read 3.
    expect(screen.getAllByText('3')).toHaveLength(2);
    for (const count of screen.getAllByText('3')) expect(count).toHaveStyle({ fontSize: 15 });
    expect(screen.getByRole('button', { name: 'Curtir post, 3 curtidas' })).toHaveStyle({
      minHeight: 48,
    });
  });

  it('keeps 18 dp icons and small counts by default', async () => {
    await render(<PostControls post={post()} onReply={jest.fn()} />);

    expect(screen.getByTestId('like-icon-outline')).toHaveStyle({ fontSize: 18 });
    for (const count of screen.getAllByText('3')) expect(count).toHaveStyle({ fontSize: 13.1 });
  });
});
