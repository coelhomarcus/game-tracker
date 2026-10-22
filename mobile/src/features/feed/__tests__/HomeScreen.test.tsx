import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { FlatList, StyleSheet } from 'react-native';
import { getAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { haptic } from '@/lib/haptics';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { HomeScreen } from '../HomeScreen';
import { useFeed } from '../queries';
import type { Post } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../queries', () => ({
  useFeed: jest.fn(),
  useTogglePostLike: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/features/notifications/queries', () => ({ useUnreadCount: () => 2 }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: jest.fn(() => false),
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
const mockNavigation = { addListener: jest.fn(), isFocused: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
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

async function renderHome(top = 0) {
  await render(
    <SafeAreaProvider initialMetrics={{ ...metrics, insets: { ...metrics.insets, top } }}>
      <HomeScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseFeed.mockReturnValue(feedResult({ data: emptyPages }));
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'me',
      username: 'eu',
      name: 'Eu Mesmo',
      email: 'eu@x.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
    },
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

/** The header reports its height once laid out; the list makes room for it. */
async function layOutHeader(height: number) {
  await fireEvent(screen.getByTestId('home-header-float'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height } },
  });
}

describe('HomeScreen header', () => {
  it('shows the avatar, the title, the bell and both scope tabs', async () => {
    await renderHome();

    const header = within(screen.getByTestId('home-header'));
    expect(header.getByRole('button', { name: 'Seu perfil' })).toBeOnTheScreen();
    expect(header.getByRole('header', { name: 'Início' })).toBeOnTheScreen();
    expect(header.getByRole('button', { name: 'Notificações, 2 não lidas' })).toBeOnTheScreen();
    expect(header.getByRole('tab', { name: 'Para você' })).toBeOnTheScreen();
    expect(header.getByRole('tab', { name: 'Seguindo' })).toBeOnTheScreen();
  });

  it('opens the notifications from the bell', async () => {
    await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: 'Notificações, 2 não lidas' }));

    expect(mockNavigate).toHaveBeenCalledWith('/notifications');
  });

  it('floats over the list, which starts below it', async () => {
    await renderHome();
    await layOutHeader(120);

    expect(screen.getByTestId('home-header-float')).toHaveStyle({ position: 'absolute', top: 0, zIndex: 1 });
    const list = screen.getByTestId('post-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(16 + 120);
    expect(list.props.progressViewOffset).toBe(120);
  });

  it('keeps the status bar strip solid over the feed', async () => {
    await renderHome(24);

    const scrim = screen.getByTestId('status-bar-scrim');
    expect(scrim).toHaveStyle({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 24,
      backgroundColor: colors.bg,
    });
    expect(scrim.props.pointerEvents).toBe('none');
  });

  it('reaches the screen reader before the feed', async () => {
    await renderHome();

    // Matches come back in tree order.
    const order = screen.getAllByTestId(/^(home-header|post-list)$/).map((node) => node.props.testID);
    expect(order).toEqual(['home-header', 'post-list']);
  });

  it('makes room for the bar and the tabs before the header is measured', async () => {
    await renderHome(24);

    const list = screen.getByTestId('post-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(16 + 24 + 48 + 48);
  });

  it('keeps the room for the header after switching scope', async () => {
    await renderHome();
    await layOutHeader(120);

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguindo' }));

    const list = screen.getByTestId('post-list');
    expect(StyleSheet.flatten(list.props.contentContainerStyle).paddingTop).toBe(16 + 120);
  });

  it('scrolls the feed to the top from the title', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await renderHome();

    await fireEvent.press(screen.getByRole('button', { name: 'Início' }));

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    expect(haptic).toHaveBeenCalledWith('tap');
    scrollToOffset.mockRestore();
  });

  it('scrolls the feed to the top when the selected scope is tapped again', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await renderHome();

    await fireEvent.press(screen.getByRole('tab', { name: 'Para você' }));

    expect(mockedUseFeed).not.toHaveBeenCalledWith('following');
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    scrollToOffset.mockRestore();
  });

  it('scrolls the feed to the top when the focused Início tab is pressed', async () => {
    const scrollToOffset = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    mockNavigation.isFocused.mockReturnValue(true);
    await renderHome();

    const [, listener] = mockNavigation.addListener.mock.calls[0];
    await act(async () => {
      listener();
    });

    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
    scrollToOffset.mockRestore();
  });
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

    expect(style.paddingBottom).toBe(56 + 2 * 15);
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

describe('HomeScreen header on scroll', () => {
  type HeaderStyle = { opacity?: number; transform?: { translateY: number }[] };
  // The types describe the web stub, which takes no argument; jest runs the native helper.
  const readAnimatedStyle = getAnimatedStyle as unknown as (element: unknown) => HeaderStyle;
  const headerStyle = () => readAnimatedStyle(screen.getByTestId('home-header-float'));
  const translateY = () => headerStyle().transform?.[0].translateY ?? 0;

  function scrollEvent(y: number, velocity = 0) {
    return { nativeEvent: { contentOffset: { x: 0, y }, velocity: { x: 0, y: velocity } } };
  }

  async function drag(from: number, to: number) {
    const list = screen.getByTestId('post-list');
    await fireEvent(list, 'scrollBeginDrag', scrollEvent(from));
    await fireEvent.scroll(list, scrollEvent(to));
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Reset here, so a failing reduce-motion test cannot leak into the next one.
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('follows the finger, then hides after a drag down', async () => {
    await renderHome();
    await layOutHeader(120);

    await drag(500, 560);
    // Animated styles are applied on the next frame.
    await act(async () => {
      jest.advanceTimersByTime(16);
    });
    expect(translateY()).toBeCloseTo(-60);
    expect(headerStyle().opacity).toBeCloseTo(0.25);

    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(560));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(translateY()).toBeCloseTo(-120);
    expect(headerStyle().opacity).toBeCloseTo(0);
  });

  it('comes back after a drag up and when the feed returns to the top', async () => {
    await renderHome();
    await layOutHeader(120);
    await drag(500, 700);
    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(700));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(translateY()).toBeCloseTo(-120);

    await drag(700, 690);
    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(690));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(translateY()).toBeCloseTo(0);
  });

  it('shows the header near the top even while the list glides', async () => {
    await renderHome();
    await layOutHeader(120);
    await drag(500, 700);
    // A fling: the snap waits for the momentum to end.
    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(700, 2));
    await fireEvent(screen.getByTestId('post-list'), 'momentumScrollEnd', scrollEvent(900));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(translateY()).toBeCloseTo(-120);

    await fireEvent.scroll(screen.getByTestId('post-list'), scrollEvent(40));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(translateY()).toBeCloseTo(0);
    expect(headerStyle().opacity).toBeCloseTo(1);
  });

  it('brings the header back when the focused Início tab is pressed', async () => {
    await renderHome();
    await layOutHeader(120);
    await drag(500, 700);
    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(700));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(translateY()).toBeCloseTo(-120);

    // A hidden header ignores touches; the Início tab press is the way back.
    const [, listener] = mockNavigation.addListener.mock.calls[0];
    mockNavigation.isFocused.mockReturnValue(true);
    await act(async () => {
      listener();
      jest.advanceTimersByTime(1000);
    });

    expect(translateY()).toBeCloseTo(0);
  });

  it('never hides with reduce motion on', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await renderHome();
    await layOutHeader(120);

    await drag(500, 700);
    await fireEvent(screen.getByTestId('post-list'), 'scrollEndDrag', scrollEvent(700));
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(translateY()).toBeCloseTo(0);
  });
});
