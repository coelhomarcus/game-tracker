import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { ProfileHeader, ProfileHeaderSkeleton } from '../ProfileHeader';
import type { UserProfile } from '../types';

const mockMutate = jest.fn();
const mockRouter = { push: jest.fn(), back: jest.fn() };

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('../queries', () => ({ useToggleFollow: () => ({ mutate: mockMutate }) }));
jest.mock('@/features/chat/queries', () => ({
  useStartConversation: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 358, height: 800 },
  insets: { top: 20, left: 0, right: 0, bottom: 0 },
};

const profile: UserProfile = {
  id: 'u1',
  username: 'ana',
  name: 'Ana Souza',
  avatarUrl: null,
  bannerUrl: null,
  bio: 'Jogo de tudo um pouco',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  followerCount: 12,
  followingCount: 3,
  entryCount: 40,
  isFollowedByMe: false,
  followsMe: false,
};

const withImages = {
  bannerUrl: 'https://cdn.example.com/b.png',
  avatarUrl: 'https://cdn.example.com/a.png',
};

async function renderHeader(overrides: Partial<UserProfile> = {}, own = false) {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ProfileHeader profile={{ ...profile, ...overrides }} own={own} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Clipboard.setStringAsync).mockResolvedValue(true);
  useSession.setState({
    status: 'signedIn',
    user: { id: 'me' } as ReturnType<typeof useSession.getState>['user'],
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('identity', () => {
  it('shows the display name, username, bio and plural counts', async () => {
    await renderHeader();

    expect(screen.getByText('Ana Souza')).toBeOnTheScreen();
    expect(screen.getByText('@ana')).toBeOnTheScreen();
    expect(screen.getByText('Jogo de tudo um pouco')).toBeOnTheScreen();
    expect(screen.getByText('12')).toBeOnTheScreen();
    expect(screen.getByText(' seguidores')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.getByText(' seguindo')).toBeOnTheScreen();
    expect(screen.getByText('40')).toBeOnTheScreen();
    expect(screen.getByText(' registros')).toBeOnTheScreen();
  });

  it('uses the singular for a single follower and a single entry', async () => {
    await renderHeader({ followerCount: 1, entryCount: 1 });

    expect(screen.getByText(' seguidor')).toBeOnTheScreen();
    expect(screen.getByText(' registro')).toBeOnTheScreen();
    expect(screen.queryByText(' seguidores')).toBeNull();
    expect(screen.queryByText(' registros')).toBeNull();
  });

  it('keeps the plural for zero', async () => {
    await renderHeader({ followerCount: 0, entryCount: 0 });

    expect(screen.getByText(' seguidores')).toBeOnTheScreen();
    expect(screen.getByText(' registros')).toBeOnTheScreen();
  });

  it('falls back to the username when the name is blank', async () => {
    await renderHeader({ name: '  ', bannerUrl: withImages.bannerUrl });

    expect(screen.getByText('ana')).toBeOnTheScreen();
    expect(screen.getByLabelText('Capa de ana')).toBeOnTheScreen();
  });

  it('shows a real bio, selectable and capped at 15 lines', async () => {
    await renderHeader();

    const bio = screen.getByTestId('profile-bio');
    expect(bio).toHaveTextContent('Jogo de tudo um pouco');
    expect(bio.props.selectable).toBe(true);
    expect(bio.props.numberOfLines).toBe(15);
  });

  it.each([null, '', '   '])('hides the bio when it is %j', async (bio) => {
    await renderHeader({ bio });

    expect(screen.queryByTestId('profile-bio')).toBeNull();
  });

  it('shows "Segue você" when the person follows the viewer', async () => {
    await renderHeader({ followsMe: true });

    expect(screen.getByText('Segue você')).toBeOnTheScreen();
  });

  it('has no "Segue você" chip otherwise', async () => {
    await renderHeader();

    expect(screen.queryByText('Segue você')).toBeNull();
  });

  it('lets touches on its plain views through to the list it floats over', async () => {
    await renderHeader({ followsMe: true });

    expect(screen.getByTestId('profile-header').props.pointerEvents).toBe('box-none');
    expect(screen.getByTestId('profile-actions').props.pointerEvents).toBe('box-none');
    expect(screen.getByLabelText('Sem capa').props.pointerEvents).toBe('box-none');
    expect(screen.getByText('Segue você').parent?.parent?.props.pointerEvents).toBe('box-none');
  });
});

describe('actions', () => {
  it('offers Editar perfil and the menu on the own profile, and no follow, message or back', async () => {
    await renderHeader({}, true);

    const row = screen.getByTestId('profile-actions');
    expect(within(row).getByRole('button', { name: 'Editar perfil' })).toBeOnTheScreen();
    expect(within(row).getByRole('button', { name: 'Mais opções do perfil' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /Seguir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Enviar mensagem/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();

    await fireEvent.press(within(row).getByRole('button', { name: 'Editar perfil' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/me/edit');
  });

  it('offers message, follow and the menu on somebody else, and no edit', async () => {
    await renderHeader();

    const row = screen.getByTestId('profile-actions');
    expect(
      within(row).getByRole('button', { name: 'Enviar mensagem para Ana Souza' }),
    ).toBeOnTheScreen();
    expect(within(row).getByRole('button', { name: 'Seguir Ana Souza' })).toBeOnTheScreen();
    expect(within(row).getByText('Seguir')).toBeOnTheScreen();
    expect(within(row).getByRole('button', { name: 'Mais opções do perfil' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Editar perfil' })).toBeNull();
  });

  it('follows and confirms with a toast only once the follow succeeded', async () => {
    await renderHeader();

    await fireEvent.press(screen.getByRole('button', { name: 'Seguir Ana Souza' }));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u1', follow: true }, expect.any(Object));
    expect(showToast).not.toHaveBeenCalled();
    mockMutate.mock.calls[0][1].onSuccess();
    expect(showToast).toHaveBeenCalledWith('Seguindo Ana Souza');
  });

  it('keeps the row of buttons 48 dp tall so each button has a real hit box', async () => {
    await renderHeader();

    expect(screen.getByTestId('profile-actions')).toHaveStyle({ minHeight: 48 });
  });

  it('lets the follow label shrink instead of running under the avatar', async () => {
    await renderHeader({ followsMe: true });

    const label = screen.getByText('Seguir de volta');
    expect(label.props.numberOfLines).toBe(1);
  });

  it('says "Seguir de volta" when she follows the viewer', async () => {
    await renderHeader({ followsMe: true });

    const row = screen.getByTestId('profile-actions');
    expect(within(row).getByText('Seguir de volta')).toBeOnTheScreen();
  });

  it('unfollows without asking and without a toast', async () => {
    await renderHeader({ isFollowedByMe: true });

    const row = screen.getByTestId('profile-actions');
    expect(within(row).getByText('Seguindo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Deixar de seguir Ana Souza' }));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u1', follow: false });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('goes back from the overlay button, in a 48 dp box', async () => {
    await renderHeader();

    const back = screen.getByRole('button', { name: 'Voltar' });
    expect(back).toHaveStyle({ width: 48, height: 48 });
    await fireEvent.press(back);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});

describe('counts', () => {
  it('links the followers and following counts to their lists', async () => {
    await renderHeader();

    await fireEvent.press(screen.getByRole('link', { name: '12 seguidores' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/users/u1/followers');
    await fireEvent.press(screen.getByRole('link', { name: '3 seguindo' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/users/u1/following');
  });

  it('leaves the entries count as plain text', async () => {
    await renderHeader();

    expect(screen.queryByRole('link', { name: /registros/ })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
});

describe('menu', () => {
  async function openMenu() {
    await renderHeader();
    await fireEvent.press(screen.getByRole('button', { name: 'Mais opções do perfil' }));
  }

  it('copies the handle', async () => {
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Copiar @usuário' }));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('@ana');
    expect(showToast).toHaveBeenCalledWith('@ana copiado');
  });

  it('tells the user when the copy fails', async () => {
    jest.mocked(Clipboard.setStringAsync).mockRejectedValue(new Error('no'));
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Copiar @usuário' }));

    expect(showToast).toHaveBeenCalledWith('Não foi possível copiar.');
  });

  it('shares the profile', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await openMenu();

    await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar perfil' }));

    expect(share).toHaveBeenCalledWith({ message: '@ana no GameTracker' });
    share.mockRestore();
  });

  it('survives a share sheet that fails to open', async () => {
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('no'));
    await openMenu();

    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Compartilhar perfil' }));
    });

    expect(showToast).not.toHaveBeenCalled();
    share.mockRestore();
  });
});

describe('images', () => {
  it('labels the missing banner and avatar and does not open them', async () => {
    await renderHeader();

    expect(screen.getByLabelText('Sem capa')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sem foto')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Sem capa'));
    await fireEvent.press(screen.getByLabelText('Sem foto'));
    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });

  it('labels the banner and avatar images with the name', async () => {
    await renderHeader(withImages);

    expect(screen.getByLabelText('Capa de Ana Souza')).toBeOnTheScreen();
    expect(screen.getByLabelText('Foto de Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Sem capa')).toBeNull();
    expect(screen.queryByLabelText('Sem foto')).toBeNull();
  });

  it('opens the banner in the viewer and closes it', async () => {
    await renderHeader(withImages);

    await fireEvent.press(screen.getByLabelText('Capa de Ana Souza'));
    expect(screen.getByTestId('image-viewer')).toBeOnTheScreen();
    expect(within(screen.getByTestId('image-viewer')).getByLabelText('Capa de Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Imagem do post/)).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByTestId('image-viewer')).toBeNull();
  });

  it('opens the avatar in the viewer', async () => {
    await renderHeader(withImages);

    await fireEvent.press(screen.getByLabelText('Foto de Ana Souza'));

    expect(screen.getByTestId('image-viewer')).toBeOnTheScreen();
    expect(within(screen.getByTestId('image-viewer')).getByLabelText('Foto de Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/Imagem do post/)).toBeNull();
  });
});

describe('ProfileHeaderSkeleton', () => {
  it('stands in for the banner, avatar and buttons while loading', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileHeaderSkeleton showBack />
      </SafeAreaProvider>,
    );

    expect(screen.getByTestId('profile-skeleton')).toBeOnTheScreen();
    expect(screen.getByLabelText('Carregando')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeOnTheScreen();
  });

  it('keeps the back button outside the labelled skeleton group', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileHeaderSkeleton showBack />
      </SafeAreaProvider>,
    );

    expect(
      within(screen.getByTestId('profile-skeleton')).queryByRole('button', { name: 'Voltar' }),
    ).toBeNull();
  });

  it('has no back button on the own profile', async () => {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ProfileHeaderSkeleton showBack={false} />
      </SafeAreaProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
  });
});
