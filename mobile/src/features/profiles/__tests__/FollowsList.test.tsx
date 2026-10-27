import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import FollowersRoute from '@/app/users/[id]/followers';
import FollowingRoute from '@/app/users/[id]/following';
import UsersLayout from '@/app/users/_layout';
import UserRoute from '@/app/users/[id]';
import { useSession } from '@/features/auth';

import { FollowsList } from '../FollowsList';
import { useFollowList, useProfile, useToggleFollow } from '../queries';
import type { FollowListPerson, UserProfile } from '../types';

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('../queries', () => ({
  useFollowList: jest.fn(),
  useProfile: jest.fn(),
  useToggleFollow: jest.fn(),
}));
jest.mock('../ProfileScreen', () => ({ ProfileScreen: () => null }));

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana: UserProfile = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  followerCount: 2,
  followingCount: 3,
  entryCount: 4,
  isFollowedByMe: false,
  followsMe: false,
  isMutedByMe: false,
  isBlockedByMe: false,
  blocksMe: false,
  canMessage: true,
};

function person(id: string, overrides: Partial<FollowListPerson> = {}): FollowListPerson {
  return {
    id,
    username: `user-${id}`,
    name: `Pessoa ${id}`,
    avatarUrl: null,
    bio: null,
    isFollowedByMe: false,
    followsMe: false,
    ...overrides,
  };
}

const mutate = jest.fn();
const refetch = jest.fn();

function mockList(items: FollowListPerson[], overrides: Record<string, unknown> = {}) {
  jest.mocked(useFollowList).mockReturnValue({
    data: { pages: [{ items, nextCursor: null }], pageParams: [undefined] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: jest.fn(),
    refetch,
    ...overrides,
  } as unknown as ReturnType<typeof useFollowList>);
}

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({ ...jest.requireActual('expo-router').router, push: mockPush }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  refetch.mockResolvedValue({ isError: false });
  useSession.setState({ status: 'signedIn', user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'] });
  jest.mocked(useProfile).mockReturnValue({ data: ana } as unknown as ReturnType<typeof useProfile>);
  jest.mocked(useToggleFollow).mockReturnValue({ mutate } as unknown as ReturnType<typeof useToggleFollow>);
  mockList([]);
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

async function renderList(kind: 'followers' | 'following' = 'followers', username: string | undefined = 'ana') {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <FollowsList userId="u1" kind={kind} username={username} />
    </SafeAreaProvider>,
  );
}

describe('FollowsList rows', () => {
  it('shows the name, handle and up to two lines of bio and opens the profile', async () => {
    mockList([person('u2', { bio: '  Jogo de tudo um pouco  ' })]);
    await renderList();

    const row = within(screen.getByTestId('follows-row'));
    expect(row.getByText('Pessoa u2')).toBeOnTheScreen();
    expect(row.getByText('@user-u2')).toBeOnTheScreen();
    expect(row.getByTestId('follows-bio')).toHaveTextContent('Jogo de tudo um pouco', { exact: true });
    expect(row.getByTestId('follows-bio').props.numberOfLines).toBe(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Pessoa u2' }));
    expect(mockPush).toHaveBeenCalledWith('/users/u2');
  });

  it('marks who follows the viewer and offers to follow back', async () => {
    mockList([person('u2', { followsMe: true }), person('u3')]);
    await renderList();

    const [first, second] = screen.getAllByTestId('follows-row');
    expect(within(first!).getByText('Segue você')).toBeOnTheScreen();
    expect(within(first!).getByRole('button', { name: 'Seguir Pessoa u2' })).toHaveTextContent('Seguir de volta');
    expect(within(second!).queryByText('Segue você')).toBeNull();
    expect(within(second!).getByRole('button', { name: 'Seguir Pessoa u3' })).toHaveTextContent('Seguir');
  });

  it('follows and unfollows from the row', async () => {
    mockList([person('u2'), person('u3', { isFollowedByMe: true })]);
    await renderList();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Pessoa u2' }));
    expect(mutate).toHaveBeenLastCalledWith({ id: 'u2', follow: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Deixar de seguir Pessoa u3' }));
    expect(mutate).toHaveBeenLastCalledWith({ id: 'u3', follow: false });
  });

  it('has no follow button on the signed-in user', async () => {
    mockList([person('me')]);
    await renderList();

    expect(screen.getByText('Pessoa me')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Seguir|Deixar de seguir/ })).toBeNull();
  });
});

describe('FollowsList paging and states', () => {
  it('loads the next page at the end of the list', async () => {
    const fetchNextPage = jest.fn();
    mockList([person('u2')], { hasNextPage: true, fetchNextPage });
    await renderList();

    await fireEvent(screen.getByTestId('follows-list'), 'endReached');
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not ask again while a page loads or after the last one', async () => {
    const fetchNextPage = jest.fn();
    mockList([person('u2')], { hasNextPage: true, isFetchingNextPage: true, fetchNextPage });
    await renderList();
    await fireEvent(screen.getByTestId('follows-list'), 'endReached');
    expect(screen.getByTestId('follows-loading-more')).toBeOnTheScreen();

    mockList([person('u2')], { hasNextPage: false, fetchNextPage });
    await renderList();
    await fireEvent(screen.getByTestId('follows-list'), 'endReached');
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('offers a retry when a next page fails', async () => {
    const fetchNextPage = jest.fn();
    mockList([person('u2')], { hasNextPage: true, isFetchNextPageError: true, fetchNextPage });
    await renderList();

    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('says nobody follows the user yet', async () => {
    await renderList('followers');
    expect(screen.getByText('Ninguém segue @ana ainda')).toBeOnTheScreen();
  });

  it('says the user follows nobody yet', async () => {
    await renderList('following');
    expect(screen.getByText('@ana ainda não segue ninguém')).toBeOnTheScreen();
  });

  it('shows a spinner while the first page loads and a retry when it fails', async () => {
    mockList([], { data: undefined, isPending: true });
    await renderList();
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();

    mockList([], { data: undefined, isPending: false, isError: true });
    await renderList();
    expect(screen.getByText('Não foi possível carregar a lista')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('/users/[id]/followers and /following', () => {
  const routes = {
    'users/_layout': UsersLayout,
    'users/[id]': UserRoute,
    'users/[id]/followers': FollowersRoute,
    'users/[id]/following': FollowingRoute,
  };

  it.each([
    ['/users/u1/followers', 'Seguidores', 'followers'],
    ['/users/u1/following', 'Seguindo', 'following'],
  ] as const)('%s has a header with the title and the handle', async (url, title, kind) => {
    mockList([person('u2')]);
    await renderRouter(routes, { initialUrl: url });

    // The test renderer draws the title in the native header config as well; the app's header is ours.
    const header = within(await screen.findByTestId('app-header'));
    expect(header.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(header.getByText('@ana')).toBeOnTheScreen();
    expect(header.getByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
    expect(useFollowList).toHaveBeenLastCalledWith('u1', kind);
    expect(screen.getByText('Pessoa u2')).toBeOnTheScreen();
  });

  it('opens the own lists in place instead of forwarding to the Perfil tab', async () => {
    jest.mocked(useProfile).mockReturnValue({
      data: { ...ana, id: 'me', username: 'eu' },
    } as unknown as ReturnType<typeof useProfile>);
    const app = await renderRouter(routes, { initialUrl: '/users/me/following' });

    const header = within(await screen.findByTestId('app-header'));
    expect(header.getByRole('header', { name: 'Seguindo' })).toBeOnTheScreen();
    expect(header.getByText('@eu')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/users/me/following');
    expect(useFollowList).toHaveBeenLastCalledWith('me', 'following');
  });
});
