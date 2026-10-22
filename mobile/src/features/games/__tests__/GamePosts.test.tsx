import { fireEvent, render, screen } from '@testing-library/react-native';

import { useGamePosts } from '@/features/feed/queries';
import type { Post } from '@/features/feed/types';

import { GamePosts } from '../GamePosts';
import type { Game } from '../types';
import { socialDefaults } from '@/test-utils/postDefaults';

jest.mock('@/features/feed/queries', () => ({
  useGamePosts: jest.fn(),
  useTogglePostLike: () => ({ mutate: jest.fn() }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockedUseGamePosts = jest.mocked(useGamePosts);
type PostsResult = ReturnType<typeof useGamePosts>;

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
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    game: hades,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

function result(overrides: Record<string, unknown> = {}): PostsResult {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  } as unknown as PostsResult;
}

function pages(...items: Post[]) {
  return { pages: [{ items, nextCursor: null }], pageParams: [undefined] };
}

async function renderPosts() {
  await render(<GamePosts gameId="g1" igdbId={11} />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseGamePosts.mockReturnValue(result({ data: pages() }));
});

describe('GamePosts', () => {
  it('requests the posts of the game', async () => {
    await renderPosts();
    expect(mockedUseGamePosts).toHaveBeenCalledWith('g1');
  });

  it('renders posts and activities without the game link', async () => {
    mockedUseGamePosts.mockReturnValue(
      result({
        data: pages(
          post(),
          post({ id: 'p2', type: 'activity', content: 'começou a jogar', activityStatus: 'playing' }),
        ),
      }),
    );
    await renderPosts();

    expect(screen.getByRole('header', { name: 'Posts' })).toBeOnTheScreen();
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.getByText(/começou a jogar/)).toBeOnTheScreen();
    expect(screen.queryByRole('link', { name: 'Abrir jogo Hades' })).not.toBeOnTheScreen();
  });

  it('opens a post when its card is pressed', async () => {
    mockedUseGamePosts.mockReturnValue(result({ data: pages(post({ id: 'p9' })) }));
    await renderPosts();

    await fireEvent.press(screen.getByRole('button', { name: /^Post de Ana Souza/ }));

    expect(mockPush).toHaveBeenCalledWith('/posts/p9');
  });

  it('starts a post about this game', async () => {
    await renderPosts();

    await fireEvent.press(screen.getByRole('button', { name: 'Publicar sobre este jogo' }));

    expect(mockPush).toHaveBeenCalledWith('/posts/new?igdbId=11');
  });

  it('loads more while there is a next page and stops without one', async () => {
    const fetchNextPage = jest.fn();
    mockedUseGamePosts.mockReturnValue(
      result({ data: pages(post()), hasNextPage: true, fetchNextPage }),
    );
    await renderPosts();

    await fireEvent.press(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    mockedUseGamePosts.mockReturnValue(result({ data: pages(post()), hasNextPage: false }));
    await screen.rerender(<GamePosts gameId="g1" igdbId={11} />);
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeOnTheScreen();
  });

  it('shows progress while the next page loads', async () => {
    const fetchNextPage = jest.fn();
    mockedUseGamePosts.mockReturnValue(
      result({ data: pages(post()), hasNextPage: true, isFetchingNextPage: true, fetchNextPage }),
    );
    await renderPosts();

    await fireEvent.press(screen.getByRole('button', { name: 'Carregar mais' }));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    await renderPosts();

    expect(screen.getByText('Ninguém publicou sobre este jogo')).toBeOnTheScreen();
    expect(screen.getByText('Seja a primeira pessoa a contar o que achou.')).toBeOnTheScreen();
  });

  it('shows a spinner while the first page loads', async () => {
    mockedUseGamePosts.mockReturnValue(result({ isPending: true }));
    await renderPosts();

    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.queryByText('Ninguém publicou sobre este jogo')).not.toBeOnTheScreen();
  });

  it('retries when the first page fails', async () => {
    const refetch = jest.fn();
    mockedUseGamePosts.mockReturnValue(result({ isError: true, refetch }));
    await renderPosts();

    expect(screen.getByText('Não foi possível carregar os posts')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the loaded posts when a background refetch fails', async () => {
    mockedUseGamePosts.mockReturnValue(result({ data: pages(post()), isError: true }));
    await renderPosts();

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar os posts')).not.toBeOnTheScreen();
  });
});
