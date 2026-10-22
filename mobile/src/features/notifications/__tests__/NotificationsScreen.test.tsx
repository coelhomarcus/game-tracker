import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { StoreApi, UseBoundStore } from 'zustand';

import { HeaderBell } from '@/components';
import { showToast } from '@/lib/toast';

import NotificationsScreen from '../NotificationsScreen';
import type { AppNotification, NotificationsData } from '../types';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate }),
  // The real header would render the options; the mock renders the right button in place.
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight ? options.headerRight() : null,
  },
}));

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

type QueryState = {
  data: NotificationsData | undefined;
  isError: boolean;
};

const mockRefetch = jest.fn();
const mockMutate = jest.fn();

jest.mock('@/features/notifications/queries', () => {
  const { create: createStore } = jest.requireActual('zustand');
  const store = createStore(() => ({ data: undefined, isError: false }));
  return {
    __store: store,
    useNotifications: () => ({ ...store(), refetch: mockRefetch }),
    useUnreadCount: () => store((state: QueryState) => state.data?.unreadCount ?? 0),
    useMarkAllRead: () => ({
      mutate: () => {
        mockMutate();
        store.setState((state: QueryState) => ({
          data: state.data && {
            items: state.data.items.map((item) => ({ ...item, read: true })),
            unreadCount: 0,
          },
        }));
      },
    }),
  };
});

const { __store: store } = jest.requireMock('@/features/notifications/queries') as {
  __store: UseBoundStore<StoreApi<QueryState>>;
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function actor(id: string, username: string, name: string | null) {
  return { id, username, name, avatarUrl: null, bio: null, isFollowedByMe: false };
}

function item(overrides: Partial<AppNotification> & { id: string }): AppNotification {
  return {
    type: 'like',
    actor: actor('u1', 'ana', 'Ana Souza'),
    postId: 'p1',
    commentId: null,
    excerpt: null,
    read: false,
    createdAt: new Date(Date.now() - 5 * 60_000),
    ...overrides,
  };
}

const like = item({ id: 'n1' });
const comment = item({
  id: 'n2',
  type: 'comment',
  actor: actor('u2', 'bruno', null),
  postId: 'p2',
  read: true,
});
const follow = item({
  id: 'n3',
  type: 'follow',
  actor: actor('u3', 'carla', 'Carla'),
  postId: null,
});

function setData(items: AppNotification[], unreadCount = items.filter((i) => !i.read).length) {
  store.setState({ data: { items, unreadCount }, isError: false });
}

function renderScreen() {
  const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <NotificationsScreen />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefetch.mockResolvedValue({ isError: false });
  store.setState({ data: undefined, isError: false });
});

test('shows the text of each notification type', async () => {
  setData([like, comment, follow]);
  await renderScreen();
  expect(screen.getByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
  expect(screen.getByText('bruno comentou no seu post')).toBeOnTheScreen();
  expect(screen.getByText('Carla começou a seguir você')).toBeOnTheScreen();
  expect(screen.getAllByText('há 5 min')).toHaveLength(3);
});

test('unread rows are labelled and marked with a dot', async () => {
  setData([like, comment]);
  await renderScreen();
  expect(
    screen.getByRole('button', { name: 'Não lida. Ana Souza curtiu seu post, há 5 min' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('button', { name: 'bruno comentou no seu post, há 5 min' }),
  ).toBeOnTheScreen();
  expect(screen.getAllByTestId('unread-dot')).toHaveLength(1);
});

test('filters by interactions and followers', async () => {
  setData([like, comment, follow]);
  await renderScreen();

  await fireEvent.press(screen.getByRole('tab', { name: 'Interações' }));
  expect(screen.getByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
  expect(screen.getByText('bruno comentou no seu post')).toBeOnTheScreen();
  expect(screen.queryByText('Carla começou a seguir você')).toBeNull();

  await fireEvent.press(screen.getByRole('tab', { name: 'Seguidores' }));
  expect(screen.getByText('Carla começou a seguir você')).toBeOnTheScreen();
  expect(screen.queryByText('Ana Souza curtiu seu post')).toBeNull();

  await fireEvent.press(screen.getByRole('tab', { name: 'Tudo' }));
  expect(screen.getByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
});

test('an empty filter says what is missing', async () => {
  setData([follow]);
  await renderScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Interações' }));
  expect(screen.getByText('Nada em "Interações"')).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Tudo' })).toBeOnTheScreen();
});

test('shows the empty state without notifications', async () => {
  setData([]);
  await renderScreen();
  expect(screen.getByText('Sem notificações')).toBeOnTheScreen();
  expect(
    screen.getByText('Curtidas, comentários e novos seguidores aparecem aqui.'),
  ).toBeOnTheScreen();
});

test('opens the post for likes and comments and the profile for follows', async () => {
  setData([like, comment, follow]);
  await renderScreen();

  await fireEvent.press(screen.getByText('Ana Souza curtiu seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p1');
  await fireEvent.press(screen.getByText('bruno comentou no seu post'));
  expect(mockPush).toHaveBeenLastCalledWith('/posts/p2');
  await fireEvent.press(screen.getByText('Carla começou a seguir você'));
  expect(mockPush).toHaveBeenLastCalledWith('/users/u3');
  expect(mockMutate).not.toHaveBeenCalled();
});

test('a like without a post goes nowhere', async () => {
  setData([item({ id: 'n9', postId: null })]);
  await renderScreen();
  await fireEvent.press(screen.getByText('Ana Souza curtiu seu post'));
  expect(mockPush).not.toHaveBeenCalled();
});

test('mark all as read disables the button and clears the badge at once', async () => {
  setData([like, comment, follow]);
  const { SafeAreaProvider } = jest.requireActual('react-native-safe-area-context');
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <HeaderBell />
      <NotificationsScreen />
    </SafeAreaProvider>,
  );
  expect(screen.getByRole('button', { name: 'Notificações, 2 não lidas' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toHaveStyle({ minWidth: 48, minHeight: 48 });

  await fireEvent.press(screen.getByRole('button', { name: 'Marcar todas como lidas' }));

  expect(mockMutate).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Marcar todas como lidas' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Notificações' })).toBeOnTheScreen();
  expect(screen.queryAllByTestId('unread-dot')).toHaveLength(0);
});

test('mark all as read is disabled with nothing unread', async () => {
  setData([comment]);
  await renderScreen();
  const button = screen.getByRole('button', { name: 'Marcar todas como lidas' });
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(mockMutate).not.toHaveBeenCalled();
});

test('the footer shows with exactly 50 items', async () => {
  setData(Array.from({ length: 50 }, (_, index) => item({ id: `n${index}`, read: true })));
  await renderScreen();
  expect(screen.getByText('Mostrando as 50 mais recentes.')).toBeOnTheScreen();
});

test('the footer is absent below 50 items', async () => {
  setData(Array.from({ length: 3 }, (_, index) => item({ id: `n${index}`, read: true })));
  await renderScreen();
  expect(screen.queryByText('Mostrando as 50 mais recentes.')).toBeNull();
});

test('refreshing refetches and toasts a failure', async () => {
  setData([like]);
  mockRefetch.mockResolvedValue({ isError: true });
  await renderScreen();
  await act(async () => {
    screen.getByTestId('notifications-list').props.refreshControl.props.onRefresh();
  });
  expect(mockRefetch).toHaveBeenCalledTimes(1);
  expect(showToast).toHaveBeenCalledWith('Não foi possível atualizar as notificações');
});

test('an error without data offers to try again', async () => {
  store.setState({ data: undefined, isError: true });
  await renderScreen();
  expect(screen.getByText('Não foi possível carregar as notificações')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

test('a failed refresh keeps the loaded notifications', async () => {
  setData([like]);
  store.setState({ isError: true });
  await renderScreen();
  expect(screen.getByText('Ana Souza curtiu seu post')).toBeOnTheScreen();
  expect(screen.queryByText('Não foi possível carregar as notificações')).toBeNull();
});

describe('reply, mention, repost and quote notifications', () => {
  const reply = item({
    id: 'n10',
    type: 'reply',
    actor: actor('u4', 'dani', 'Dani'),
    postId: 'p10',
    commentId: 'c10',
    excerpt: 'Concordo totalmente',
  });
  const mention = item({
    id: 'n11',
    type: 'mention',
    actor: actor('u5', 'edu', 'Edu'),
    postId: 'p11',
    commentId: 'c11',
  });
  const mentionInPost = item({
    id: 'n12',
    type: 'mention',
    actor: actor('u8', 'hugo', 'Hugo'),
    postId: 'p12',
  });
  const repost = item({ id: 'n13', type: 'repost', actor: actor('u6', 'fabi', 'Fabi'), postId: 'p13' });
  const quote = item({ id: 'n14', type: 'quote', actor: actor('u7', 'gui', 'Gui'), postId: 'p14' });

  it('shows a sensible text for each', async () => {
    setData([reply, mention, repost, quote]);
    await renderScreen();

    expect(screen.getByText('Dani respondeu seu comentário')).toBeOnTheScreen();
    expect(screen.getByText('Edu mencionou você')).toBeOnTheScreen();
    expect(screen.getByText('Fabi repostou seu post')).toBeOnTheScreen();
    expect(screen.getByText('Gui citou seu post')).toBeOnTheScreen();
  });

  it('opens the post (the quote post for a quote)', async () => {
    setData([reply, mention, mentionInPost, repost, quote]);
    await renderScreen();

    await fireEvent.press(screen.getByText('Dani respondeu seu comentário'));
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

  it('counts as interactions, not followers', async () => {
    setData([reply, mention, repost, quote, follow]);
    await renderScreen();

    await fireEvent.press(screen.getByRole('tab', { name: 'Interações' }));
    expect(screen.getByText('Dani respondeu seu comentário')).toBeOnTheScreen();
    expect(screen.getByText('Gui citou seu post')).toBeOnTheScreen();
    expect(screen.queryByText('Carla começou a seguir você')).toBeNull();

    await fireEvent.press(screen.getByRole('tab', { name: 'Seguidores' }));
    expect(screen.queryByText('Dani respondeu seu comentário')).toBeNull();
  });
});
