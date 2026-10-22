import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';

import type { Game } from '@/features/games/types';

import { GameEmbed } from '../embeds/GameEmbed';
import { PostActions } from '../PostActions';
import { PostFeedItem } from '../PostFeedItem';
import { PostList } from '../PostList';
import type { Post, PostPage } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

const mockMutate = jest.fn();
jest.mock('../queries', () => ({ useTogglePostLike: () => ({ mutate: mockMutate }) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// The avatar link is hidden from screen readers on purpose; touch still reaches it.
const HIDDEN = { includeHiddenElements: true };

const NOW = new Date('2026-10-20T12:00:00.000Z');
const POST_LABEL = 'Post de Ana Souza, há 5 min: Zerei de primeira!';

beforeEach(() => {
  // Only the clock is faked: timers stay real so Testing Library keeps working.
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'clearTimeout'] });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

const hades: Game = {
  id: 'g1',
  igdbId: 11,
  name: 'Hades',
  coverUrl: null,
  summary: null,
  screenshots: [],
  platforms: [],
  genres: [],
  isFavoritedByMe: false,
};

function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    game: hades,
    entry: null,
    imageUrl: null,
    likeCount: 3,
    commentCount: 2,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

describe('PostFeedItem', () => {
  it('shows the author, handle, relative time, content and the game', async () => {
    await render(<PostFeedItem post={post()} />);

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText(/@ana$/)).toBeOnTheScreen();
    expect(screen.getByText('· há 5 min')).toBeOnTheScreen();
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByLabelText('Abrir jogo Hades')).toBeOnTheScreen();
  });

  it('exposes the post text and time in the accessibility label', async () => {
    await render(<PostFeedItem post={post()} />);

    expect(screen.getByLabelText(POST_LABEL)).toBeOnTheScreen();
  });

  it('falls back to the username when the name is blank', async () => {
    const author = { id: 'u2', username: 'bia', name: '  ', avatarUrl: null };
    await render(<PostFeedItem post={post({ author })} />);

    expect(screen.getByLabelText(/^Post de bia, /)).toBeOnTheScreen();
  });

  it('hides the game card when asked to', async () => {
    await render(<PostFeedItem post={post()} hideGame />);

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Abrir jogo/)).toBeNull();
  });

  it('omits the game card when the post has no game', async () => {
    await render(<PostFeedItem post={post({ game: null })} />);

    expect(screen.queryByLabelText(/Abrir jogo/)).toBeNull();
  });

  it('shows images only when the post has some', async () => {
    const image = { url: 'https://cdn.test/a.png', width: null, height: null, alt: null };
    await render(<PostFeedItem post={post({ images: [image] })} />);
    expect(screen.getByTestId('post-image')).toBeOnTheScreen();

    await screen.rerender(<PostFeedItem post={post({ images: [] })} />);
    expect(screen.queryByTestId('post-image')).toBeNull();
  });

  it('calls onPress when the body is pressed', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText(POST_LABEL));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens the post from the comment counter only when the row is pressable', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: '2 comentários' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(<PostFeedItem post={post()} />);
    expect(screen.queryByRole('button', { name: '2 comentários' })).toBeNull();
    expect(screen.getByLabelText('2 comentários')).toBeOnTheScreen();
  });

  it('opens the author profile from the avatar and from the name without opening the post', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post()} onPress={onPress} />);

    // Screen readers stop once: the avatar link is touch-only, the name link is the exposed one.
    const nameLink = screen.getByRole('button', { name: 'Perfil de Ana Souza' });
    expect(nameLink).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(nameLink);
    const avatarLink = screen.getByTestId('author-avatar-link', HIDDEN);
    // A real 48 dp box around the 42 dp avatar.
    expect(avatarLink).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(avatarLink);

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('/users/u1');
    expect(onPress).not.toHaveBeenCalled();
    // The body keeps its own press and label.
    await fireEvent.press(screen.getByLabelText(POST_LABEL));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
});

describe('GameEmbed', () => {
  it('opens the game page', async () => {
    await render(<GameEmbed game={hades} />);

    await fireEvent.press(screen.getByRole('link', { name: 'Abrir jogo Hades' }));

    expect(mockPush).toHaveBeenCalledWith('/games/11');
  });

  it('shows the playthrough platform, or else the first platform of the game', async () => {
    const game = { ...hades, platforms: ['PC', 'Switch'] };
    await render(<GameEmbed game={game} platform="PS5" />);
    expect(screen.getByText('PS5')).toBeOnTheScreen();

    await screen.rerender(<GameEmbed game={game} />);
    expect(screen.getByText('PC')).toBeOnTheScreen();
    expect(screen.queryByText('Switch')).toBeNull();
  });
});

describe('PostActions', () => {
  it('labels the like button with the count and toggles with the received post', async () => {
    const received = post();
    await render(<PostActions post={received} />);

    await fireEvent.press(screen.getByLabelText('Curtir post, 3 curtidas'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(received);
  });

  it('offers to unlike a liked post', async () => {
    await render(<PostActions post={post({ likedByMe: true, likeCount: 4 })} />);

    expect(screen.getByLabelText('Descurtir post, 4 curtidas')).toBeOnTheScreen();
  });

  it('uses the singular for one like and one comment', async () => {
    const single = post({ likeCount: 1, commentCount: 1 });
    await render(<PostActions post={single} />);
    expect(screen.getByLabelText('Curtir post, 1 curtida')).toBeOnTheScreen();
    expect(screen.getByLabelText('1 comentário')).toBeOnTheScreen();

    await screen.rerender(<PostActions post={{ ...single, likedByMe: true }} />);
    expect(screen.getByLabelText('Descurtir post, 1 curtida')).toBeOnTheScreen();
  });

  it('uses the plural for zero and several', async () => {
    await render(<PostActions post={post({ likeCount: 0, commentCount: 0 })} />);
    expect(screen.getByLabelText('Curtir post, 0 curtidas')).toBeOnTheScreen();
    expect(screen.getByLabelText('0 comentários')).toBeOnTheScreen();
  });

  it('calls onComment from the comment counter', async () => {
    const onComment = jest.fn();
    await render(<PostActions post={post()} onComment={onComment} />);

    await fireEvent.press(screen.getByRole('button', { name: '2 comentários' }));

    expect(onComment).toHaveBeenCalledTimes(1);
  });

  it('shows the comment counter as plain text without onComment', async () => {
    await render(<PostActions post={post()} />);

    expect(screen.getByLabelText('2 comentários')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '2 comentários' })).toBeNull();
    await fireEvent.press(screen.getByLabelText('2 comentários'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('PostFeedItem for an activity', () => {
  it('shows the author, content, status label and relative time', async () => {
    const activity = post({
      type: 'activity',
      activityStatus: 'completed',
      content: 'zerou Hades',
    });
    await render(<PostFeedItem post={activity} />);

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('zerou Hades')).toBeOnTheScreen();
    expect(screen.getByText('Concluído')).toBeOnTheScreen();
    expect(screen.getByText('· há 5 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Abrir jogo Hades')).toBeOnTheScreen();
  });

  it('hides the game card when asked to', async () => {
    await render(<PostFeedItem post={post({ type: 'activity' })} hideGame />);

    expect(screen.queryByLabelText(/Abrir jogo/)).toBeNull();
  });

  it('exposes the sentence, status and time in the accessibility label', async () => {
    const activity = post({ type: 'activity', activityStatus: 'completed', content: 'zerou Hades' });
    await render(<PostFeedItem post={activity} />);

    expect(screen.getByLabelText('Ana Souza zerou Hades, Concluído, há 5 min')).toBeOnTheScreen();
  });

  it('leaves the status out of the label without an activity status', async () => {
    const activity = post({ type: 'activity', activityStatus: null, content: 'zerou Hades' });
    await render(<PostFeedItem post={activity} />);

    expect(screen.getByLabelText('Ana Souza zerou Hades, há 5 min')).toBeOnTheScreen();
  });

  it('shows no status line without an activity status', async () => {
    await render(<PostFeedItem post={post({ type: 'activity', activityStatus: null })} />);

    expect(screen.queryByTestId('activity-status')).toBeNull();
    expect(screen.queryByText('Concluído')).toBeNull();
    expect(screen.queryByText('Jogando')).toBeNull();
  });

  it('calls onPress when the body is pressed', async () => {
    const onPress = jest.fn();
    await render(<PostFeedItem post={post({ type: 'activity' })} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText(/^Ana Souza /));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('opens the post from the comment counter only when the row is pressable', async () => {
    const onPress = jest.fn();
    const activity = post({ type: 'activity' });
    await render(<PostFeedItem post={activity} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: '2 comentários' }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(<PostFeedItem post={activity} />);
    expect(screen.queryByRole('button', { name: '2 comentários' })).toBeNull();
    expect(screen.getByLabelText('2 comentários')).toBeOnTheScreen();
  });

  it('opens the author profile from the avatar and from the name without opening the post', async () => {
    const onPress = jest.fn();
    const activity = post({ type: 'activity', activityStatus: 'completed', content: 'zerou Hades' });
    await render(<PostFeedItem post={activity} onPress={onPress} />);

    // Screen readers stop once: the avatar link is touch-only, the name link is the exposed one.
    const nameLink = screen.getByRole('button', { name: 'Perfil de Ana Souza' });
    expect(nameLink).toHaveStyle({ minHeight: 48 });
    await fireEvent.press(nameLink);
    await fireEvent.press(screen.getByTestId('author-avatar-link', HIDDEN));

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('/users/u1');
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Ana Souza zerou Hades, Concluído, há 5 min'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

type FeedQuery = UseInfiniteQueryResult<InfiniteData<PostPage>>;

function feedQuery(overrides: Record<string, unknown> = {}, items: Post[] = [post()]): FeedQuery {
  return {
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    isRefetching: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn().mockResolvedValue({ isError: false }),
    ...overrides,
  } as unknown as FeedQuery;
}

describe('PostList', () => {
  it('renders posts and activities from every page', async () => {
    const activity = post({
      id: 'b',
      type: 'activity',
      activityStatus: 'playing',
      content: 'segundo',
    });
    const query = feedQuery({
      data: {
        pages: [
          { items: [post({ id: 'a', content: 'primeiro post' })], nextCursor: 'c' },
          { items: [activity], nextCursor: null },
        ],
        pageParams: [undefined, 'c'],
      },
    });
    await render(<PostList query={query} />);

    expect(screen.getByText('primeiro post')).toBeOnTheScreen();
    expect(screen.getByText(/segundo/)).toBeOnTheScreen();
    expect(screen.getByText('Jogando')).toBeOnTheScreen();
  });

  it('lists full-width rows that draw their own lines, none above the first', async () => {
    const items = [post({ id: 'a' }), post({ id: 'b' })];
    await render(<PostList query={feedQuery({}, items)} />);

    const list = screen.getByTestId('post-list');
    expect(list.props.ItemSeparatorComponent).toBeUndefined();
    expect(list.props.contentContainerStyle).not.toContainEqual(
      expect.objectContaining({ padding: expect.any(Number) }),
    );
    const [first, second] = screen.getAllByTestId('post-feed-item');
    expect(first).not.toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
    expect(second).toHaveStyle({ borderTopWidth: StyleSheet.hairlineWidth });
  });

  it('opens the post when a row is pressed', async () => {
    await render(<PostList query={feedQuery()} />);

    await fireEvent.press(screen.getByLabelText(POST_LABEL));

    expect(mockPush).toHaveBeenCalledWith('/posts/p1');
  });

  it('opens the post from the comment counter in the feed', async () => {
    await render(<PostList query={feedQuery()} />);

    await fireEvent.press(screen.getByRole('button', { name: '2 comentários' }));

    expect(mockPush).toHaveBeenCalledWith('/posts/p1');
  });

  it('lets the screen handle card presses', async () => {
    const onPressPost = jest.fn();
    await render(<PostList query={feedQuery()} onPressPost={onPressPost} />);

    await fireEvent.press(screen.getByLabelText(POST_LABEL));

    expect(onPressPost).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('fetches the next page once while that page is loading', async () => {
    const fetchNextPage = jest.fn();
    await render(<PostList query={feedQuery({ hasNextPage: true, fetchNextPage })} />);

    await fireEvent(screen.getByTestId('post-list'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    const loading = feedQuery({ hasNextPage: true, isFetchingNextPage: true, fetchNextPage });
    await screen.rerender(<PostList query={loading} />);
    await fireEvent(screen.getByTestId('post-list'), 'endReached');
    await fireEvent(screen.getByTestId('post-list'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not fetch from scrolling after a failed page', async () => {
    const fetchNextPage = jest.fn();
    const failed = feedQuery({ hasNextPage: true, isFetchNextPageError: true, fetchNextPage });
    await render(<PostList query={failed} />);

    await fireEvent(screen.getByTestId('post-list'), 'endReached');

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not fetch when there is no next page', async () => {
    const fetchNextPage = jest.fn();
    await render(<PostList query={feedQuery({ fetchNextPage })} />);

    await fireEvent(screen.getByTestId('post-list'), 'endReached');

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('shows a spinner while the next page loads', async () => {
    await render(<PostList query={feedQuery({ hasNextPage: true, isFetchingNextPage: true })} />);

    expect(screen.getByTestId('post-list-loading-more')).toBeOnTheScreen();
    expect(screen.queryByText('Você chegou ao fim.')).toBeNull();
  });

  it('shows the end message only when there is no next page', async () => {
    await render(<PostList query={feedQuery({ hasNextPage: true })} />);
    expect(screen.queryByText('Você chegou ao fim.')).toBeNull();

    await screen.rerender(<PostList query={feedQuery()} />);
    expect(screen.getByText('Você chegou ao fim.')).toBeOnTheScreen();
  });

  it('shows no end message for an empty list', async () => {
    await render(<PostList query={feedQuery({}, [])} />);

    expect(screen.queryByText('Você chegou ao fim.')).toBeNull();
  });

  it('offers a retry when the next page fails', async () => {
    const fetchNextPage = jest.fn();
    const failed = feedQuery({ hasNextPage: true, isFetchNextPageError: true, fetchNextPage });
    await render(<PostList query={failed} />);

    expect(screen.getByText('Não foi possível carregar mais posts.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('renders the header and empty components', async () => {
    await render(
      <PostList
        query={feedQuery({}, [])}
        ListHeaderComponent={<Text>cabeçalho</Text>}
        ListEmptyComponent={<Text>vazio</Text>}
      />,
    );

    expect(screen.getByText('cabeçalho')).toBeOnTheScreen();
    expect(screen.getByText('vazio')).toBeOnTheScreen();
  });

  it('refreshes with the query by default', async () => {
    const refetch = jest.fn().mockResolvedValue({ isError: false });
    await render(<PostList query={feedQuery({ refetch })} />);

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes with the given handler', async () => {
    const onRefresh = jest.fn();
    await render(<PostList query={feedQuery()} onRefresh={onRefresh} />);

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('is not refreshing while only the next page loads', async () => {
    const query = feedQuery({ isRefetching: true, isFetchingNextPage: true });
    await render(<PostList query={query} />);

    expect(screen.getByTestId('post-list').props.refreshControl.props.refreshing).toBe(false);
  });

  it('does not show the pull spinner for a background refetch', async () => {
    await render(<PostList query={feedQuery({ isRefetching: true })} />);

    expect(screen.getByTestId('post-list').props.refreshControl.props.refreshing).toBe(false);
  });

  it('shows the pull spinner from the pull until the refetch settles', async () => {
    let finish!: (result: { isError: boolean }) => void;
    const refetch = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    await render(<PostList query={feedQuery({ refetch })} />);
    const refreshing = () => screen.getByTestId('post-list').props.refreshControl.props.refreshing;

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });
    expect(refreshing()).toBe(true);

    await act(async () => finish({ isError: false }));
    expect(refreshing()).toBe(false);
  });

  it('stops the pull spinner when the refetch rejects', async () => {
    const refetch = jest.fn().mockRejectedValue(new Error('offline'));
    await render(<PostList query={feedQuery({ refetch })} />);

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(screen.getByTestId('post-list').props.refreshControl.props.refreshing).toBe(false);
  });
});
