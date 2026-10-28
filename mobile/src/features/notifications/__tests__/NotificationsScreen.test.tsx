import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { FlatList } from 'react-native';

import { HeaderBell } from '@/components';
import { useSession, type User } from '@/features/auth';
import { showToast } from '@/lib/toast';
import { colors } from '@/theme/tokens';

import { notificationsApi } from '../api';
import NotificationsScreen from '../NotificationsScreen';
import { unreadCountKey } from '../queries';
import type { AppNotification, NotificationFilter, NotificationsPage, NotificationType } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@/features/notifications/api', () => ({
  notificationsApi: { list: jest.fn(), unreadCount: jest.fn(), markAllRead: jest.fn() },
}));

const mockPush = jest.fn();
const mockNavigate = jest.fn();
/** Whether the screen is focused (a screen pushed on top blurs it). */
const mockFocus = {
  focused: true,
  listeners: new Set<() => void>(),
  set(focused: boolean) {
    mockFocus.focused = focused;
    for (const listener of [...mockFocus.listeners]) listener();
  },
};
jest.mock('expo-router', () => {
  const { useEffect, useSyncExternalStore } = jest.requireActual('react');
  const subscribe = (listener: () => void) => {
    mockFocus.listeners.add(listener);
    return () => mockFocus.listeners.delete(listener);
  };
  const useIsFocused = () => useSyncExternalStore(subscribe, () => mockFocus.focused);
  return {
    useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
    useIsFocused,
    // Mounted and focused runs the effect; blurring or unmounting runs its cleanup.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const focused = useIsFocused();
      useEffect(() => (focused ? effect() : undefined), [effect, focused]);
    },
    Stack: {
      Screen: ({ options }: { options: { title?: string } }) => {
        const { Text } = jest.requireActual('react-native');
        return <Text testID="header-title">{options.title}</Text>;
      },
    },
  };
});

const mocked = jest.mocked(notificationsApi);

const me: User = {
  id: 'me',
  username: 'eu',
  name: 'Eu',
  email: 'eu@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  dmPolicy: 'everyone',
};

const FILTER_TYPES: Record<NotificationFilter, readonly NotificationType[] | null> = {
  all: null,
  replies: ['comment', 'reply'],
  mentions: ['mention', 'quote'],
  follows: ['follow'],
};

/** What the fake server holds: newest first, paged by index. */
const server = { items: [] as AppNotification[], pageSize: 30 };

function serveList({ cursor, filter = 'all' }: { cursor?: string; filter?: NotificationFilter } = {}) {
  const types = FILTER_TYPES[filter];
  const matching = server.items.filter((item) => types === null || types.includes(item.type));
  const start = cursor === undefined ? 0 : Number(cursor);
  const end = start + server.pageSize;
  const page: NotificationsPage = {
    items: matching.slice(start, end).map((item) => ({ ...item })),
    unreadCount: server.items.filter((item) => !item.read).length,
    nextCursor: end < matching.length ? String(end) : null,
  };
  return Promise.resolve(page);
}

function actor(id: string, username: string, name: string | null) {
  return { id, username, name, avatarUrl: null };
}

const MINUTE = 60_000;

function item(overrides: Partial<AppNotification> & { id: string }): AppNotification {
  return {
    type: 'like',
    actor: actor('u1', 'ana', 'Ana Souza'),
    postId: 'p1',
    commentId: null,
    excerpt: null,
    postImageUrl: null,
    read: false,
    createdAt: new Date(Date.now() - 5 * MINUTE),
    ...overrides,
  };
}

const like = item({ id: 'n1' });
const comment = item({ id: 'n2', type: 'comment', actor: actor('u2', 'bruno', null), postId: 'p2', read: true });
const follow = item({ id: 'n3', type: 'follow', actor: actor('u3', 'carla', 'Carla'), postId: null });

let client: QueryClient;

function renderScreen({ bell = false } = {}) {
  const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
  const metrics = {
    frame: { x: 0, y: 0, width: 390, height: 800 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>
        {bell ? <HeaderBell /> : null}
        <NotificationsScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Lets pending requests, mutations and their re-renders settle inside act. */
async function settle() {
  await act(async () => {
    await tick();
    while (client.isFetching() > 0 || client.isMutating() > 0) await tick();
    await tick();
  });
}

function listCalls(filter: NotificationFilter) {
  return mocked.list.mock.calls.filter(([options]) => (options?.filter ?? 'all') === filter);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.focused = true;
  useSession.setState({ status: 'signedIn', user: me });
  server.items = [];
  server.pageSize = 30;
  mocked.list.mockImplementation(serveList);
  mocked.unreadCount.mockImplementation(async () => server.items.filter((i) => !i.read).length);
  mocked.markAllRead.mockImplementation(async () => {
    server.items = server.items.map((i) => ({ ...i, read: true }));
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
});

afterEach(() => client.clear());

test('keeps the header title', async () => {
  await renderScreen();
  await settle();
  expect(screen.getByTestId('header-title')).toHaveTextContent('Notificações');
});

test('shows skeleton rows while the first page loads', async () => {
  mocked.list.mockReturnValue(new Promise(() => {}));
  await renderScreen();
  // The count still comes in.
  await act(async () => {
    await tick();
    await tick();
  });
  expect(screen.getAllByTestId('notification-skeleton').length).toBeGreaterThan(0);
  expect(screen.getByLabelText('Carregando notificações')).toBeOnTheScreen();
});

test('shows the text of each notification type', async () => {
  server.items = [
    like,
    comment,
    follow,
    item({ id: 'n10', type: 'reply', actor: actor('u4', 'dani', 'Dani'), postId: 'p10', excerpt: 'Concordo totalmente' }),
    item({ id: 'n11', type: 'mention', actor: actor('u5', 'edu', 'Edu'), postId: 'p11' }),
    item({ id: 'n13', type: 'repost', actor: actor('u6', 'fabi', 'Fabi'), postId: 'p13' }),
    item({ id: 'n14', type: 'quote', actor: actor('u7', 'gui', 'Gui'), postId: 'p14' }),
  ];
  await renderScreen();
  expect(await screen.findByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
  expect(screen.getByText('bruno comentou no seu post')).toBeOnTheScreen();
  expect(screen.getByText('Carla começou a seguir você')).toBeOnTheScreen();
  expect(screen.getByText('Dani respondeu: Concordo totalmente')).toBeOnTheScreen();
  expect(screen.getByText('Edu mencionou você')).toBeOnTheScreen();
  expect(screen.getByText('Fabi repostou seu post')).toBeOnTheScreen();
  expect(screen.getByText('Gui citou seu post')).toBeOnTheScreen();
  expect(screen.getAllByText('5 min')).toHaveLength(7);
});

test('collapses likes of one post into a row and splits Hoje from Antes', async () => {
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * MINUTE);
  server.items = [
    like,
    item({ id: 'n4', actor: actor('u4', 'bia', 'Bia') }),
    item({ id: 'n5', actor: actor('u5', 'caio', 'Caio') }),
    item({ id: 'n6', actor: actor('u6', 'duda', 'Duda') }),
    item({ id: 'n7', type: 'comment', postId: 'p9', createdAt: lastWeek }),
  ];
  await renderScreen();
  expect(await screen.findByText('Ana Souza e mais 3 curtiram seu post')).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Hoje' })).toBeOnTheScreen();
  expect(screen.getByRole('header', { name: 'Antes' })).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Ana Souza e mais 3 curtiram seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p1');
});

test('opens the post for likes and comments and the profile for follows', async () => {
  server.items = [like, comment, follow];
  await renderScreen();

  await fireEvent.press(await screen.findByText('Ana Souza curtiu seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p1');
  await fireEvent.press(screen.getByText('bruno comentou no seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p2');
  await fireEvent.press(screen.getByText('Carla começou a seguir você'));
  expect(mockPush).toHaveBeenLastCalledWith('/users/u3');
});

test('opens the post of replies, mentions and reposts, and the quote post for a quote', async () => {
  server.items = [
    item({ id: 'n10', type: 'reply', actor: actor('u4', 'dani', 'Dani'), postId: 'p10', commentId: 'c10' }),
    item({ id: 'n11', type: 'mention', actor: actor('u5', 'edu', 'Edu'), postId: 'p11', commentId: 'c11' }),
    item({ id: 'n12', type: 'mention', actor: actor('u8', 'hugo', 'Hugo'), postId: 'p12' }),
    item({ id: 'n13', type: 'repost', actor: actor('u6', 'fabi', 'Fabi'), postId: 'p13' }),
    item({ id: 'n14', type: 'quote', actor: actor('u7', 'gui', 'Gui'), postId: 'p14' }),
  ];
  await renderScreen();

  await fireEvent.press(await screen.findByText('Dani respondeu seu comentário'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p10');
  await fireEvent.press(screen.getByText('Edu mencionou você'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p11');
  await fireEvent.press(screen.getByText('Hugo mencionou você'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p12');
  await fireEvent.press(screen.getByText('Fabi repostou seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p13');
  await fireEvent.press(screen.getByText('Gui citou seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p14');
});

test('a like without a post goes nowhere', async () => {
  server.items = [item({ id: 'n9', postId: null })];
  await renderScreen();
  await fireEvent.press(await screen.findByText('Ana Souza curtiu seu post'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('a grouped follow row shows the people, each opening their profile', async () => {
  server.items = [follow, item({ id: 'n8', type: 'follow', actor: actor('u8', 'davi', 'Davi'), postId: null })];
  await renderScreen();
  await fireEvent.press(await screen.findByText('Carla e mais 1 começaram a seguir você'));
  expect(mockPush).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: 'Ver perfil de Davi' }));
  expect(mockPush).toHaveBeenLastCalledWith('/users/u8');
});

describe('mark as read', () => {
  test('opening Todas marks everything read and the bell drops, but the rows stay tinted', async () => {
    server.items = [like, comment, follow];
    await renderScreen({ bell: true });

    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen());
    await settle();

    const likeRow = screen.getByRole('button', { name: 'Não lida. Ana Souza curtiu seu post, 5 min' });
    expect(likeRow).toHaveStyle({ backgroundColor: colors.bgContrast25 });
    expect(screen.getByRole('button', { name: 'Não lida. Carla começou a seguir você, 5 min' })).toBeOnTheScreen();
    // The comment was read already: no tint.
    expect(screen.getByRole('button', { name: 'bruno comentou no seu post, 5 min' })).not.toHaveStyle({
      backgroundColor: colors.bgContrast25,
    });
    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);
  });

  test('the tint clears once the screen is left', async () => {
    server.items = [like];
    await renderScreen();
    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.getByRole('button', { name: 'Não lida. Ana Souza curtiu seu post, 5 min' })).toBeOnTheScreen();

    await act(async () => mockFocus.set(false));
    await act(async () => mockFocus.set(true));

    expect(screen.getByRole('button', { name: 'Ana Souza curtiu seu post, 5 min' })).not.toHaveStyle({
      backgroundColor: colors.bgContrast25,
    });
    // Nothing was unread any more: no second request.
    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);
  });

  test('nothing is marked while nothing is unread', async () => {
    server.items = [comment];
    await renderScreen();
    await screen.findByText('bruno comentou no seu post');
    await settle();
    expect(mocked.markAllRead).not.toHaveBeenCalled();
  });

  test('only Todas marks read: another filter chosen before it loads does not', async () => {
    server.items = [like, comment];
    let releaseAll!: () => void;
    mocked.list.mockImplementation((options = {}) =>
      (options.filter ?? 'all') === 'all'
        ? new Promise<NotificationsPage>((resolve) => {
            releaseAll = () => void serveList(options).then(resolve);
          })
        : serveList(options),
    );
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Respostas' }));
    await act(async () => releaseAll());
    expect(await screen.findByText('bruno comentou no seu post')).toBeOnTheScreen();
    await settle();
    expect(mocked.markAllRead).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('tab', { name: 'Todas' }));
    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledTimes(1));
  });

  test('a failed request is not retried until the screen is focused again', async () => {
    server.items = [like];
    mocked.markAllRead.mockRejectedValue(new Error('boom'));
    await renderScreen();
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    await settle();
    expect(mocked.markAllRead).toHaveBeenCalledTimes(1);

    await act(async () => mockFocus.set(false));
    await act(async () => mockFocus.set(true));
    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledTimes(2));
    await settle();
    expect(mocked.markAllRead).toHaveBeenCalledTimes(2);

    // A pull to refresh tries again too.
    await act(async () => {
      await screen.getByTestId('notifications-list-all').props.refreshControl.props.onRefresh();
    });
    await settle();
    expect(mocked.markAllRead).toHaveBeenCalledTimes(3);
  });
});

describe('Atualizar', () => {
  async function openAndRead() {
    server.items = [like];
    await renderScreen({ bell: true });
    await waitFor(() => expect(mocked.markAllRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen());
    await settle();
  }

  async function arrive(notification: AppNotification) {
    server.items = [notification, ...server.items];
    await act(async () => {
      await client.refetchQueries({ queryKey: unreadCountKey });
    });
    // The query notifies its observers on the next tick.
    await settle();
  }

  const reply = item({ id: 'n20', type: 'reply', actor: actor('u9', 'iris', 'Iris'), postId: 'p20' });

  test('a growing count offers to update instead of jumping the list', async () => {
    const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset');
    await openAndRead();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();

    await arrive(reply);
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeOnTheScreen();
    expect(screen.queryByText('Iris respondeu seu comentário')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Atualizar' }));
    expect(scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
    await settle();
    expect(screen.getByText('Iris respondeu seu comentário')).toBeOnTheScreen();
    // The new one is marked read on Todas too, and keeps its tint.
    expect(mocked.markAllRead).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Não lida. Iris respondeu seu comentário, 5 min' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
    scroll.mockRestore();
  });

  test('a count that grows while the screen is covered shows the pill once it is back', async () => {
    await openAndRead();
    await act(async () => mockFocus.set(false));
    await arrive(reply);
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();

    await act(async () => mockFocus.set(true));
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeOnTheScreen();
  });

  test('pull to refresh catches up too', async () => {
    await openAndRead();
    await arrive(reply);
    await act(async () => {
      await screen.getByTestId('notifications-list-all').props.refreshControl.props.onRefresh();
    });
    expect(await screen.findByText('Iris respondeu seu comentário')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Atualizar' })).toBeNull();
  });
});

describe('filters', () => {
  test('each filter loads its own page from the server', async () => {
    server.items = [
      like,
      comment,
      follow,
      item({ id: 'n11', type: 'mention', actor: actor('u5', 'edu', 'Edu'), postId: 'p11' }),
    ];
    await renderScreen();
    await screen.findByText('Ana Souza curtiu seu post');
    expect(listCalls('replies')).toHaveLength(0);

    await fireEvent.press(screen.getByRole('tab', { name: 'Respostas' }));
    expect(await screen.findByText('bruno comentou no seu post')).toBeOnTheScreen();
    expect(screen.queryByText('Ana Souza curtiu seu post')).toBeNull();
    expect(listCalls('replies')).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Respostas' })).toBeSelected();

    await fireEvent.press(screen.getByRole('tab', { name: 'Menções' }));
    expect(await screen.findByText('Edu mencionou você')).toBeOnTheScreen();
    expect(screen.queryByText('bruno comentou no seu post')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguidores' }));
    expect(await screen.findByText('Carla começou a seguir você')).toBeOnTheScreen();
    expect(screen.queryByText('Edu mencionou você')).toBeNull();
  });

  test('switching back keeps the list (and its scroll) without loading it again', async () => {
    server.items = [like, comment];
    await renderScreen();
    await screen.findByText('Ana Souza curtiu seu post');
    const allList = screen.getByTestId('notifications-list-all');
    const allCalls = listCalls('all').length;

    await fireEvent.press(screen.getByRole('tab', { name: 'Respostas' }));
    await screen.findByText('bruno comentou no seu post');
    expect(screen.queryByTestId('notifications-list-all')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Todas' }));
    expect(screen.getByTestId('notifications-list-all')).toBe(allList);
    expect(screen.getByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
    expect(listCalls('all')).toHaveLength(allCalls);
  });

  test('pills are 48 dp targets around a 34 dp pill', async () => {
    await renderScreen();
    await settle();
    const tab = screen.getByRole('tab', { name: 'Todas' });
    expect(tab).toHaveStyle({ minHeight: 48, minWidth: 48 });
    expect(tab).toBeSelected();
  });

  test.each<[string, string]>([
    ['Todas', 'Nenhuma notificação ainda'],
    ['Respostas', 'Nenhuma resposta ainda'],
    ['Menções', 'Nenhuma menção ainda'],
    ['Seguidores', 'Ninguém começou a seguir você ainda'],
  ])('%s has its own empty state', async (tab, text) => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: tab }));
    expect(await screen.findByText(text)).toBeOnTheScreen();
  });
});

describe('paging and errors', () => {
  test('reaching the end loads the next page of the filter by its cursor', async () => {
    server.pageSize = 2;
    server.items = [
      like,
      comment,
      item({ id: 'n15', type: 'quote', actor: actor('u7', 'gui', 'Gui'), postId: 'p14' }),
    ];
    await renderScreen();
    await screen.findByText('bruno comentou no seu post');
    expect(screen.queryByText('Gui citou seu post')).toBeNull();

    await act(async () => {
      screen.getByTestId('notifications-list-all').props.onEndReached();
    });
    expect(await screen.findByText('Gui citou seu post')).toBeOnTheScreen();
    expect(mocked.list).toHaveBeenCalledWith({ cursor: '2', filter: 'all' });

    // The last page: nothing more to load.
    const calls = mocked.list.mock.calls.length;
    await act(async () => {
      screen.getByTestId('notifications-list-all').props.onEndReached();
    });
    expect(mocked.list.mock.calls.length).toBe(calls);
  });

  test('refreshing refetches and toasts a failure', async () => {
    server.items = [comment];
    await renderScreen();
    await screen.findByText('bruno comentou no seu post');
    mocked.list.mockRejectedValue(new Error('offline'));
    await act(async () => {
      await screen.getByTestId('notifications-list-all').props.refreshControl.props.onRefresh();
    });
    expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar as notificações');
    // A failed refresh keeps the loaded notifications.
    expect(screen.getByText('bruno comentou no seu post')).toBeOnTheScreen();
  });

  test('an error without data offers to try again', async () => {
    mocked.list.mockRejectedValueOnce(new Error('offline'));
    await renderScreen();
    expect(await screen.findByText('Não foi possível carregar as notificações')).toBeOnTheScreen();
    server.items = [comment];
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('bruno comentou no seu post')).toBeOnTheScreen();
  });
});

test('rows show the thumbnail of the post image', async () => {
  server.items = [item({ id: 'n30', read: true, postImageUrl: 'https://img/p1.jpg' })];
  await renderScreen();
  const row = await screen.findByRole('button', { name: 'Ana Souza curtiu seu post, 5 min' });
  expect(within(row).getByTestId('notification-thumbnail')).toHaveProp('source', { uri: 'https://img/p1.jpg' });
});
