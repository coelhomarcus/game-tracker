import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { useProfile, useToggleFollow } from '@/features/profiles/queries';
import type { UserProfile } from '@/features/profiles/types';
import { formatFullDate } from '@/lib/relativeTime';
import { socialDefaults } from '@/test-utils/postDefaults';

import type { Post } from '../../types';
import { ThreadAnchor } from '../ThreadAnchor';

jest.mock('../../queries', () => ({
  ...jest.requireActual<typeof import('@/test-utils/postControlHooks')>(
    '@/test-utils/postControlHooks',
  ).postControlHooks(),
}));
jest.mock('@/features/profiles/queries', () => ({
  useProfile: jest.fn(),
  useToggleFollow: jest.fn(),
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockedUseProfile = jest.mocked(useProfile);
const follow = jest.fn();

const metrics = {
  frame: { x: 0, y: 0, width: 412, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana = { id: 'u1', username: 'ana', name: 'Ana Souza', avatarUrl: null };
const CREATED = new Date(2026, 9, 26, 14, 5);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    author: ana,
    content: 'Zerei de primeira!',
    type: 'status',
    activityStatus: null,
    createdAt: CREATED,
    game: null,
    entry: null,
    imageUrl: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    ...socialDefaults,
    ...overrides,
  };
}

/** The profile query of the author: whether the user follows them, or still loading. */
function profileFollowing(following: boolean | undefined) {
  mockedUseProfile.mockImplementation(
    (id) =>
      ({
        data:
          id === undefined || following === undefined
            ? undefined
            : ({ id, isFollowedByMe: following } as UserProfile),
      }) as ReturnType<typeof useProfile>,
  );
}

function signIn(id: string) {
  useSession.setState({
    status: 'signedIn',
    user: { id } as ReturnType<typeof useSession.getState>['user'],
  });
}

async function renderAnchor(post: Post = makePost()) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThreadAnchor post={post} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useToggleFollow).mockReturnValue({ mutate: follow } as never);
  profileFollowing(false);
  signIn('someone-else');
});

afterEach(async () => {
  await act(async () => useSession.setState({ status: 'signedOut', user: null }));
});

describe('ThreadAnchor', () => {
  it('shows the author name, handle and the text, as one summary for screen readers', async () => {
    await renderAnchor();

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    expect(screen.getByTestId('anchor-text')).toHaveTextContent('Zerei de primeira!');
    expect(screen.getByLabelText(/^Post de Ana Souza, .*: Zerei de primeira!$/)).toBeOnTheScreen();
    // The page is the post: its body opens nothing.
    expect(screen.queryByRole('button', { name: /^Post de Ana Souza/ })).toBeNull();
  });

  it('opens the profile from the name and from the 48 dp avatar box', async () => {
    await renderAnchor();

    await fireEvent.press(screen.getByRole('button', { name: 'Perfil de Ana Souza' }));
    const avatar = screen.getByTestId('author-avatar-link', { includeHiddenElements: true });
    expect(avatar).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(avatar);

    expect(mockPush).toHaveBeenNthCalledWith(1, '/users/u1');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/users/u1');
  });

  it('shows the full date of the post', async () => {
    await renderAnchor();

    expect(screen.getByTestId('anchor-date')).toHaveTextContent(formatFullDate(CREATED));
    expect(screen.getByText('26 de out de 2026 às 14:05')).toBeOnTheScreen();
  });

  it('hides the counter row when nothing was counted', async () => {
    await renderAnchor();

    expect(screen.queryByTestId('anchor-stats')).toBeNull();
  });

  it('spells out each counter, bold numbers, hiding the ones at 0', async () => {
    await renderAnchor(makePost({ likeCount: 12, repostCount: 1, quoteCount: 0, bookmarkCount: 1500 }));

    const stats = screen.getByTestId('anchor-stats');
    expect(within(stats).getByTestId('anchor-stat-reposts')).toHaveTextContent('1 repost');
    expect(within(stats).getByTestId('anchor-stat-likes')).toHaveTextContent('12 curtidas');
    expect(within(stats).getByTestId('anchor-stat-saves')).toHaveTextContent('1,5 mil salvos');
    expect(within(stats).queryByTestId('anchor-stat-quotes')).toBeNull();
    expect(within(stats).getByText('12')).toHaveStyle({ fontFamily: 'Inter_700Bold' });
  });

  it('uses the singular and plural of every counter', async () => {
    await renderAnchor(makePost({ likeCount: 1, repostCount: 2, quoteCount: 1, bookmarkCount: 1 }));

    expect(screen.getByTestId('anchor-stat-likes')).toHaveTextContent('1 curtida');
    expect(screen.getByTestId('anchor-stat-reposts')).toHaveTextContent('2 reposts');
    expect(screen.getByTestId('anchor-stat-quotes')).toHaveTextContent('1 citação');
    expect(screen.getByTestId('anchor-stat-saves')).toHaveTextContent('1 salvo');
  });

  it('shows the big controls, with the comment counter inert', async () => {
    await renderAnchor(makePost({ commentCount: 3 }));

    const controls = screen.getByTestId('post-controls');
    expect(within(controls).getByTestId('like-icon-outline')).toHaveStyle({ fontSize: 22 });
    expect(within(controls).getByLabelText('3 comentários')).toBeOnTheScreen();
    expect(within(controls).queryByRole('button', { name: '3 comentários' })).toBeNull();
  });

  it('shows the status of an activity in the summary', async () => {
    await renderAnchor(makePost({ type: 'activity', activityStatus: 'completed', content: 'zerou Hades' }));

    expect(screen.getByTestId('activity-status')).toHaveTextContent(/Concluído/);
    expect(screen.getByLabelText(/^Ana Souza zerou Hades, Concluído, /)).toBeOnTheScreen();
  });

  it('gives a post without text its summary on the date line', async () => {
    const image = { url: 'https://img/1.jpg', width: 100, height: 100, alt: null };
    await renderAnchor(makePost({ content: '', images: [image] }));

    expect(screen.queryByTestId('anchor-text')).toBeNull();
    expect(
      screen.getByLabelText(/^Post de Ana Souza, .*, 1 imagem, 26 de out de 2026 às 14:05$/),
    ).toBeOnTheScreen();
  });
});

describe('ThreadAnchor follow button', () => {
  it('offers following an author the user does not follow', async () => {
    await renderAnchor();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));

    expect(mockedUseProfile).toHaveBeenCalledWith('u1');
    expect(follow).toHaveBeenCalledWith({ id: 'u1', follow: true });
  });

  it('shows no follow button on the own post, without asking for the profile', async () => {
    signIn('u1');
    await renderAnchor();

    expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull();
    expect(mockedUseProfile).not.toHaveBeenCalledWith('u1');
  });

  it('shows no follow button while the profile loads', async () => {
    profileFollowing(undefined);
    await renderAnchor();

    expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull();
  });

  it('shows no follow button for an author the user already followed when the page opened', async () => {
    profileFollowing(true);
    await renderAnchor();

    expect(screen.queryByRole('button', { name: /eguir/ })).toBeNull();
  });

  it('keeps the button after following, so the follow can be undone', async () => {
    await renderAnchor();
    profileFollowing(true);
    await screen.rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThreadAnchor post={makePost()} />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Deixar de seguir Ana Souza' }));

    expect(follow).toHaveBeenCalledWith({ id: 'u1', follow: false });
  });
});
