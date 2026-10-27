import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { usePush, type PushStatus } from '@/features/push/pushController';

import { NotificationSettings } from '../NotificationSettings';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const enable = jest.fn().mockResolvedValue(undefined);
const initialPush = usePush.getState();

async function renderSettings() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <NotificationSettings />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  usePush.setState(initialPush, true);
});

describe('NotificationSettings', () => {
  async function renderWithPush(status: PushStatus) {
    usePush.setState({ status, enable });
    await renderSettings();
  }

  it('explains that closed-app notices are unavailable in this build', async () => {
    await renderSettings();

    expect(usePush.getState().status).toBe('unsupported');
    expect(
      screen.getByText(
        'As notificações aparecem na central com o app aberto. Avisos com o app fechado não estão disponíveis nesta versão.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('opens the notification center', async () => {
    await renderSettings();

    await fireEvent.press(screen.getByRole('button', { name: 'Central de notificações' }));

    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  it('offers to turn notifications on when they are off', async () => {
    await renderWithPush('off');

    expect(screen.getByText('Desativadas neste aparelho.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Ativar' }));

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('shows progress while turning them on', async () => {
    await renderWithPush('registering');

    expect(screen.getByText('Ativando…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull();
  });

  it('confirms they are on', async () => {
    await renderWithPush('on');

    expect(screen.getByText('Ativadas neste aparelho.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ativar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
  });

  it('explains a system block and lets the user try again', async () => {
    await renderWithPush('denied');

    expect(
      screen.getByText('Bloqueadas nas configurações do sistema. Libere por lá para receber avisos.'),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('lets the user try again after a failure', async () => {
    await renderWithPush('failed');

    expect(screen.getByText('Não foi possível ativar agora. Tente de novo.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(enable).toHaveBeenCalledTimes(1);
  });

  it('follows the status as it changes', async () => {
    await renderWithPush('off');

    await act(async () => {
      usePush.setState({ status: 'on' });
    });

    expect(screen.getByText('Ativadas neste aparelho.')).toBeOnTheScreen();
  });
});
