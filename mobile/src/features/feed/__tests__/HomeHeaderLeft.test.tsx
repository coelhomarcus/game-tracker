import { fireEvent, render, screen } from '@testing-library/react-native';

import { useSession } from '@/features/auth';

import { HomeHeaderLeft } from '../HomeHeaderLeft';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockReset();
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

describe('HomeHeaderLeft', () => {
  it('opens the own profile from the avatar', async () => {
    await render(<HomeHeaderLeft />);

    await fireEvent.press(screen.getByRole('button', { name: 'Seu perfil' }));

    expect(mockPush).toHaveBeenCalledWith('/profile');
  });

  it('renders nothing without a signed-in user', async () => {
    useSession.setState({ status: 'signedOut', user: null });
    await render(<HomeHeaderLeft />);

    expect(screen.queryByRole('button', { name: 'Seu perfil' })).toBeNull();
  });
});
