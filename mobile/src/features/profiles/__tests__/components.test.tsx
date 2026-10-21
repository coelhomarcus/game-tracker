import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useSession } from '@/features/auth';

import { FollowButton } from '../FollowButton';
import { PersonRow } from '../PersonRow';
import { ProfileHeader } from '../ProfileHeader';
import type { PersonResult, UserProfile } from '../types';

const mockMutate = jest.fn();

jest.mock('@/features/profiles/queries', () => ({
  useToggleFollow: () => ({ mutate: mockMutate }),
}));

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
};

const person: PersonResult = {
  id: 'u2',
  username: 'bruno',
  name: 'Bruno Lima',
  avatarUrl: null,
  bio: 'Fã de RPG',
  isFollowedByMe: false,
};

function signInAs(id: string | null) {
  useSession.setState({
    status: id ? 'signedIn' : 'signedOut',
    user: id ? ({ id } as ReturnType<typeof useSession.getState>['user']) : null,
  });
}

beforeEach(() => {
  mockMutate.mockClear();
  signInAs('me');
});

afterEach(() => {
  signInAs(null);
});

describe('ProfileHeader', () => {
  it('shows the display name, username, bio and plural counts', async () => {
    await render(<ProfileHeader profile={profile} />);

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
    await render(<ProfileHeader profile={{ ...profile, followerCount: 1, entryCount: 1 }} />);

    expect(screen.getByText(' seguidor')).toBeOnTheScreen();
    expect(screen.getByText(' registro')).toBeOnTheScreen();
    expect(screen.queryByText(' seguidores')).toBeNull();
    expect(screen.queryByText(' registros')).toBeNull();
  });

  it('keeps the plural for zero', async () => {
    await render(<ProfileHeader profile={{ ...profile, followerCount: 0, entryCount: 0 }} />);

    expect(screen.getByText(' seguidores')).toBeOnTheScreen();
    expect(screen.getByText(' registros')).toBeOnTheScreen();
  });

  it('falls back to the username when the name is blank', async () => {
    await render(
      <ProfileHeader
        profile={{ ...profile, name: '  ', bannerUrl: 'https://cdn.example.com/b.png' }}
      />,
    );

    expect(screen.getByText('ana')).toBeOnTheScreen();
    expect(screen.getByLabelText('Capa de ana')).toBeOnTheScreen();
  });

  it('hides the bio when it is null or blank', async () => {
    const { rerender } = await render(<ProfileHeader profile={{ ...profile, bio: null }} />);
    expect(screen.queryByText('Jogo de tudo um pouco')).toBeNull();

    await rerender(<ProfileHeader profile={{ ...profile, bio: '   ' }} />);
    expect(screen.queryByText('   ')).toBeNull();
  });

  it('labels the missing banner and avatar', async () => {
    await render(<ProfileHeader profile={profile} />);

    expect(screen.getByLabelText('Sem capa')).toBeOnTheScreen();
    expect(screen.getByLabelText('Sem foto')).toBeOnTheScreen();
  });

  it('labels the banner and avatar images with the name', async () => {
    await render(
      <ProfileHeader
        profile={{
          ...profile,
          bannerUrl: 'https://cdn.example.com/b.png',
          avatarUrl: 'https://cdn.example.com/a.png',
        }}
      />,
    );

    expect(screen.getByLabelText('Capa de Ana Souza')).toBeOnTheScreen();
    expect(screen.getByLabelText('Foto de Ana Souza')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Sem capa')).toBeNull();
    expect(screen.queryByLabelText('Sem foto')).toBeNull();
  });

  it('renders the actions next to the name', async () => {
    await render(<ProfileHeader profile={profile} actions={<Text>Editar perfil</Text>} />);

    expect(screen.getByText('Editar perfil')).toBeOnTheScreen();
  });
});

describe('FollowButton', () => {
  it('offers to follow and sends follow: true', async () => {
    await render(<FollowButton userId="u2" following={false} name="Bruno Lima" />);

    expect(screen.getByText('Seguir')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Seguir Bruno Lima'));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: true });
  });

  it('offers to unfollow and sends follow: false', async () => {
    await render(<FollowButton userId="u2" following name="Bruno Lima" />);

    expect(screen.getByText('Seguindo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Deixar de seguir Bruno Lima'));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: false });
  });
});

describe('PersonRow', () => {
  it('shows the person and opens the profile when the row is pressed', async () => {
    const onPress = jest.fn();
    await render(<PersonRow person={person} onPress={onPress} />);

    expect(screen.getByText('Bruno Lima')).toBeOnTheScreen();
    expect(screen.getByText('@bruno')).toBeOnTheScreen();
    expect(screen.getByText('Fã de RPG')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Perfil de Bruno Lima'));

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('follows from the row without opening the profile', async () => {
    const onPress = jest.fn();
    await render(<PersonRow person={person} onPress={onPress} />);

    await fireEvent.press(screen.getByLabelText('Seguir Bruno Lima'));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: true });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the unfollow state for a followed person', async () => {
    await render(<PersonRow person={{ ...person, isFollowedByMe: true }} onPress={jest.fn()} />);

    expect(screen.getByLabelText('Deixar de seguir Bruno Lima')).toBeOnTheScreen();
  });

  it('hides the follow button for the signed-in user', async () => {
    signInAs('u2');
    await render(<PersonRow person={person} onPress={jest.fn()} />);

    expect(screen.queryByLabelText('Seguir Bruno Lima')).toBeNull();
    expect(screen.queryByText('Seguir')).toBeNull();
  });

  it('omits the bio line when there is no bio', async () => {
    await render(<PersonRow person={{ ...person, bio: null }} onPress={jest.fn()} />);

    expect(screen.queryByText('Fã de RPG')).toBeNull();
  });
});
