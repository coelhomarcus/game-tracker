import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showToast } from '@/lib/toast';

import { HomeScreen } from '../HomeScreen';
import { useFeed } from '../queries';
import type { Post } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../queries', () => ({
  useFeed: jest.fn(),
  useTogglePostLike: () => ({ mutate: jest.fn() }),
}));

const mockPush = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => mockNavigation,
}));

const mockedUseFeed = jest.mocked(useFeed);

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function post(): Post {
  return {
    id: 'p1',
    author: { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null },
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: new Date('2026-10-20T11:55:00.000Z'),
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
  };
}

type FeedResult = ReturnType<typeof useFeed>;

/** The slice of the infinite query that the screen and the list read. */
function feedResult(overrides: Record<string, unknown> = {}): FeedResult {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isRefetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn().mockResolvedValue({ isError: false }),
    ...overrides,
  } as unknown as FeedResult;
}

const emptyPages = { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] };

async function renderHome() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <HomeScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseFeed.mockReturnValue(feedResult({ data: emptyPages }));
});

describe('HomeScreen', () => {
  it('starts on Para você', async () => {
    await renderHome();

    expect(mockedUseFeed).toHaveBeenCalledWith('general');
    expect(mockedUseFeed).not.toHaveBeenCalledWith('following');
    expect(screen.getByRole('tab', { name: 'Para você', selected: true })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Seguindo', selected: false })).toBeOnTheScreen();
  });

  it('loads the following feed when Seguindo is selected', async () => {
    await renderHome();

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));

    expect(mockedUseFeed).toHaveBeenCalledWith('following');
    expect(screen.getByRole('tab', { name: 'Seguindo', selected: true })).toBeOnTheScreen();
  });

  it('shows each scope its own posts', async () => {
    mockedUseFeed.mockImplementation((scope) =>
      scope === 'general'
        ? feedResult({ data: { pages: [{ items: [post()], nextCursor: null }], pageParams: [] } })
        : feedResult({ data: emptyPages }),
    );
    await renderHome();
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));

    expect(screen.queryByText('Zerei de primeira!')).not.toBeOnTheScreen();
    expect(screen.getByText('Acompanhe quem joga com você')).toBeOnTheScreen();
  });

  it('invites the first post when the general feed is empty', async () => {
    await renderHome();

    expect(screen.getByText('Ainda não há publicações')).toBeOnTheScreen();
    expect(screen.getByText('Seja a primeira pessoa a publicar.')).toBeOnTheScreen();
  });

  it('opens the composer from the empty general feed action', async () => {
    await renderHome();

    // The empty state button and the floating button share the label.
    const buttons = screen.getAllByRole('button', { name: 'Publicar' });
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[0]);

    expect(mockPush).toHaveBeenCalledWith('/posts/new');
  });

  it('points to people search when the following feed is empty', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));

    expect(screen.getByText('Acompanhe quem joga com você')).toBeOnTheScreen();
    expect(
      screen.getByText('Quando quem você segue publicar ou jogar algo, aparece aqui.'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Encontrar pessoas' }));

    expect(mockPush).toHaveBeenCalledWith('/explore?tab=people');
  });

  it('opens the composer from the floating button', async () => {
    mockedUseFeed.mockReturnValue(
      feedResult({ data: { pages: [{ items: [post()], nextCursor: null }], pageParams: [] } }),
    );
    await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: 'Publicar' }));

    expect(mockPush).toHaveBeenCalledWith('/posts/new');
  });

  it('shows skeleton rows and no empty state while the first page loads', async () => {
    mockedUseFeed.mockReturnValue(feedResult({ isPending: true }));
    await renderHome();

    expect(screen.getAllByTestId('feed-skeleton-row')).toHaveLength(3);
    expect(screen.queryByText('Ainda não há publicações')).not.toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar o feed')).not.toBeOnTheScreen();
  });

  it('retries the feed after a first-load error', async () => {
    const refetch = jest.fn();
    mockedUseFeed.mockReturnValue(feedResult({ isError: true, refetch }));
    await renderHome();

    expect(screen.getByText('Não foi possível carregar o feed')).toBeOnTheScreen();
    expect(screen.queryByText('Ainda não há publicações')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the posts on screen and reports it when a refresh fails', async () => {
    const refetch = jest.fn().mockResolvedValue({ isError: true });
    mockedUseFeed.mockReturnValue(
      feedResult({
        isError: true,
        refetch,
        data: { pages: [{ items: [post()], nextCursor: null }], pageParams: [] },
      }),
    );
    await renderHome();

    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
    expect(screen.queryByText('Não foi possível carregar o feed')).not.toBeOnTheScreen();
    expect(showToast).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar o feed');
    expect(screen.getByText('Zerei de primeira!')).toBeOnTheScreen();
  });

  it('reports a refresh that rejects', async () => {
    const refetch = jest.fn().mockRejectedValue(new Error('offline'));
    mockedUseFeed.mockReturnValue(feedResult({ data: emptyPages, refetch }));
    await renderHome();

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar o feed');
  });

  it('stays quiet when a refresh succeeds', async () => {
    await renderHome();

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(showToast).not.toHaveBeenCalled();
  });

  it('refetches the current scope on pull to refresh', async () => {
    const refetch = jest.fn().mockResolvedValue({ isError: false });
    mockedUseFeed.mockReturnValue(feedResult({ data: emptyPages, refetch }));
    await renderHome();

    await act(async () => {
      screen.getByTestId('post-list').props.refreshControl.props.onRefresh();
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('listens for presses on the active Início tab', async () => {
    await renderHome();

    expect(mockNavigation.addListener).toHaveBeenCalledWith('tabPress', expect.any(Function));
  });

  it('reserves space under the last card for the publish button', async () => {
    await renderHome();

    const style = StyleSheet.flatten(screen.getByTestId('post-list').props.contentContainerStyle);

    expect(style.paddingBottom).toBe(56 + 2 * 16);
  });

  it('restores the scroll offset of a scope when it is selected again', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    mockedUseFeed.mockImplementation((scope) =>
      scope === 'general'
        ? feedResult({ data: { pages: [{ items: [post()], nextCursor: null }], pageParams: [] } })
        : feedResult({ data: emptyPages }),
    );
    await renderHome();
    await act(async () => {
      screen.getByTestId('post-list').props.onContentSizeChange(358, 2000);
    });
    await fireEvent.scroll(screen.getByTestId('post-list'), {
      nativeEvent: { contentOffset: { y: 640 } },
    });

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));
    expect(scrollToOffset).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('tab', { name: 'Para você' }));
    await act(async () => {
      screen.getByTestId('post-list').props.onContentSizeChange(358, 2000);
    });

    expect(scrollToOffset).toHaveBeenCalledTimes(1);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 640, animated: false });
    scrollToOffset.mockRestore();
  });
});
