import { fireEvent, render, screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth';
import { showToast } from '@/lib/toast';

import { FollowButton } from '../FollowButton';
import { PersonRow } from '../PersonRow';
import type { PersonResult } from '../types';

const mockMutate = jest.fn();

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

jest.mock('@/features/profiles/queries', () => ({
  useToggleFollow: () => ({ mutate: mockMutate }),
}));

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
  jest.mocked(showToast).mockClear();
  signInAs('me');
});

afterEach(() => {
  signInAs(null);
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

describe('FollowButton on a profile', () => {
  it('says "Seguir de volta" when the person follows the viewer', async () => {
    await render(<FollowButton userId="u2" following={false} followsMe name="Bruno Lima" />);

    expect(screen.getByText('Seguir de volta')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Seguir Bruno Lima'));
    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: true });
  });

  it('says "Seguindo" once followed, whatever followsMe says', async () => {
    await render(<FollowButton userId="u2" following followsMe name="Bruno Lima" />);

    expect(screen.getByText('Seguindo')).toBeOnTheScreen();
    expect(screen.queryByText('Seguir de volta')).toBeNull();
  });

  it('asks the follow hook to announce the follow with a toast', async () => {
    await render(<FollowButton userId="u2" following={false} name="Bruno Lima" announce />);

    await fireEvent.press(screen.getByLabelText('Seguir Bruno Lima'));

    // The hook shows "Seguindo Bruno Lima" once the server has the follow (queries.test).
    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: true, announce: 'Bruno Lima' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('stays silent on unfollow', async () => {
    await render(<FollowButton userId="u2" following name="Bruno Lima" announce />);

    await fireEvent.press(screen.getByLabelText('Deixar de seguir Bruno Lima'));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: false });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('does not toast unless asked to', async () => {
    await render(<FollowButton userId="u2" following={false} name="Bruno Lima" />);

    await fireEvent.press(screen.getByLabelText('Seguir Bruno Lima'));

    expect(mockMutate).toHaveBeenCalledWith({ id: 'u2', follow: true });
    expect(showToast).not.toHaveBeenCalled();
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

  it('can hide the follow button and relabel the press', async () => {
    const onPress = jest.fn();
    await render(
      <PersonRow person={person} onPress={onPress} showFollow={false} pressLabel="Conversar com Bruno Lima" />,
    );

    expect(screen.queryByLabelText('Seguir Bruno Lima')).toBeNull();
    expect(screen.queryByLabelText('Perfil de Bruno Lima')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Conversar com Bruno Lima'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows the bio line', async () => {
    await render(<PersonRow person={person} onPress={jest.fn()} />);

    expect(screen.getByTestId('person-bio')).toHaveTextContent('Fã de RPG');
  });

  it.each([null, '', '   '])('omits the bio line when the bio is %j', async (bio) => {
    await render(<PersonRow person={{ ...person, bio }} onPress={jest.fn()} />);

    expect(screen.queryByTestId('person-bio')).toBeNull();
  });
});
