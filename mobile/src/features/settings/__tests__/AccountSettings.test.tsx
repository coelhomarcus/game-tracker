import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession } from '@/features/auth';
import { colors } from '@/theme/tokens';

import { AccountSettings } from '../AccountSettings';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <AccountSettings />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSession.setState({
    status: 'signedIn',
    user: {
      id: 'u1',
      username: 'ana',
      name: 'Ana',
      email: 'ana@example.com',
      avatarUrl: null,
      bannerUrl: null,
      bio: null,
      dmPolicy: 'everyone',
    },
  });
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
});

describe('AccountSettings', () => {
  it('shows the e-mail of the account, which is not a button', async () => {
    await renderSettings();

    expect(screen.getByText('E-mail')).toBeOnTheScreen();
    expect(screen.getByText('ana@example.com')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'E-mail' })).toBeNull();
  });

  it('opens the profile editor', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Editar perfil' }));

    expect(mockPush).toHaveBeenCalledWith('/me/edit');
  });

  it.each([
    ['Trocar senha', '/settings/password'],
    ['Excluir conta', '/settings/delete-account'],
  ])('opens %s', async (label, href) => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: label }));

    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('draws Excluir conta last, in the danger tone, with a 48 dp row', async () => {
    await renderSettings();

    const labels = screen.getAllByRole('button').map((row) => row.props.accessibilityLabel);
    expect(labels).toEqual(['Editar perfil', 'Trocar senha', 'Excluir conta']);
    expect(screen.getByText('Excluir conta')).toHaveStyle({ color: colors.danger });
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toHaveStyle({ minHeight: 48 });
  });
});
