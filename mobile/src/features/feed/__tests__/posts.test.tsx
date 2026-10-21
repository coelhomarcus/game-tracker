import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { Game } from '@/features/games/types';

import { ActivityCard } from '../ActivityCard';
import { PostActions } from '../PostActions';
import { PostCard } from '../PostCard';
import { PostGameLink } from '../PostGameLink';
import { PostList } from '../PostList';
import type { Post, PostPage } from '../types';

const mockMutate = jest.fn();
jest.mock('../queries', () => ({ useTogglePostLike: () => ({ mutate: mockMutate }) }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const NOW = new Date('2026-10-20T12:00:00.000Z');

beforeEach(() => {
  // Only the clock is faked: timers stay real so Testing Library keeps working.
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] });
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
    ...overrides,
  };
}

describe('PostCard', () => {
  it('shows the author, handle, relative time, content and the game', async () => {
    await render(<PostCard post={post()} />);

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText(/@ana · há 5 min/)).toBeOnTheScreen();
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByLabelText('Abrir jogo Hades')).toBeOnTheScreen();
  });

  it('falls back to the username when the name is blank', async () => {
    const author = { id: 'u2', username: 'bia', name: '  ', avatarUrl: null };
    await render(<PostCard post={post({ author })} />);

    expect(screen.getByLabelText('Post de bia')).toBeOnTheScreen();
  });

  it('omits the game link when the post has no game', async () => {
    await render(<PostCard post={post({ game: null })} />);

    expect(screen.queryByLabelText(/Abrir jogo/)).toBeNull();
  });

  it('shows the image only when the post has one', async () => {
    await render(<PostCard post={post({ imageUrl: 'https://cdn.test/a.png' })} />);
    expect(screen.getByTestId('post-image')).toBeOnTheScreen();

    await screen.rerender(<PostCard post={post({ imageUrl: null })} />);
    expect(screen.queryByTestId('post-image')).toBeNull();
  });

  it('calls onPress when the card is pressed', async () => {
    const onPress = jest.fn();
    await render(<PostCard post={post()} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Post de Ana Souza'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PostGameLink', () => {
  it('opens the game page', async () => {
    await render(<PostGameLink game={hades} />);

    await fireEvent.press(screen.getByLabelText('Abrir jogo Hades'));

    expect(mockPush).toHaveBeenCalledWith('/games/11');
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

  it('opens the post from the comment count', async () => {
    await render(<PostActions post={post()} />);

    await fireEvent.press(screen.getByLabelText('2 comentários'));

    expect(mockPush).toHaveBeenCalledWith('/posts/p1');
  });
});

describe('ActivityCard', () => {
  it('shows the author, content, status label and relative time', async () => {
    const activity = post({
      type: 'activity',
      activityStatus: 'completed',
      content: 'zerou Hades',
    });
    await render(<ActivityCard post={activity} />);

    expect(screen.getByText(/Ana Souza/)).toBeOnTheScreen();
    expect(screen.getByText(/zerou Hades/)).toBeOnTheScreen();
    expect(screen.getByText('Concluído')).toBeOnTheScreen();
    expect(screen.getByText('há 5 min')).toBeOnTheScreen();
    expect(screen.getByLabelText('Abrir jogo Hades')).toBeOnTheScreen();
  });

  it('shows no status chip without an activity status', async () => {
    await render(<ActivityCard post={post({ type: 'activity', activityStatus: null })} />);

    expect(screen.queryByText('Concluído')).toBeNull();
    expect(screen.queryByText('Jogando')).toBeNull();
  });

  it('calls onPress when the card is pressed', async () => {
    const onPress = jest.fn();
    await render(<ActivityCard post={post({ type: 'activity' })} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Post de Ana Souza'));

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
    refetch: jest.fn(),
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

  it('opens the post when a card is pressed', async () => {
    await render(<PostList query={feedQuery()} />);

    await fireEvent.press(screen.getByLabelText('Post de Ana Souza'));

    expect(mockPush).toHaveBeenCalledWith('/posts/p1');
  });

  it('lets the screen handle card presses', async () => {
    const onPressPost = jest.fn();
    await render(<PostList query={feedQuery()} onPressPost={onPressPost} />);

    await fireEvent.press(screen.getByLabelText('Post de Ana Souza'));

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
    const refetch = jest.fn();
    await render(<PostList query={feedQuery({ refetch })} />);

    screen.getByTestId('post-list').props.refreshControl.props.onRefresh();

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes with the given handler', async () => {
    const onRefresh = jest.fn();
    await render(<PostList query={feedQuery()} onRefresh={onRefresh} />);

    screen.getByTestId('post-list').props.refreshControl.props.onRefresh();

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('is not refreshing while only the next page loads', async () => {
    const query = feedQuery({ isRefetching: true, isFetchingNextPage: true });
    await render(<PostList query={query} />);

    expect(screen.getByTestId('post-list').props.refreshControl.props.refreshing).toBe(false);
  });

  it('is refreshing during a pull refetch', async () => {
    await render(<PostList query={feedQuery({ isRefetching: true })} />);

    expect(screen.getByTestId('post-list').props.refreshControl.props.refreshing).toBe(true);
  });
});
