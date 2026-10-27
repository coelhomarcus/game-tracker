import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useSession, type User } from '@/features/auth';
import { chatApi } from '@/features/chat/api';
import { NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { dmPolicySettled } from '../dmPolicy';
import { PrivacySettings } from '../PrivacySettings';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/chat/api', () => ({ chatApi: { setDmPolicy: jest.fn() } }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mocked = jest.mocked(chatApi);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const ana: User = {
  id: 'u1',
  username: 'ana',
  name: 'Ana',
  email: 'ana@example.com',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  dmPolicy: 'everyone',
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderPrivacy() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PrivacySettings />
    </SafeAreaProvider>,
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });
const checked = () =>
  ['Todos', 'Quem eu sigo', 'Ninguém'].filter(
    (name) => radio(name).props.accessibilityState?.checked === true,
  );
const policy = () => useSession.getState().user?.dmPolicy;

beforeEach(() => {
  jest.clearAllMocks();
  mocked.setDmPolicy.mockResolvedValue(undefined);
  useSession.setState({ status: 'signedIn', user: ana });
});

afterEach(async () => {
  await act(() => dmPolicySettled());
  useSession.setState({ status: 'signedOut', user: null });
});

describe('PrivacySettings', () => {
  it('shows the three choices as one radio group with the current policy checked', async () => {
    useSession.setState({ user: { ...ana, dmPolicy: 'following' } });
    await renderPrivacy();

    expect(screen.getByText('Quem pode te mandar mensagem')).toBeOnTheScreen();
    expect(screen.getByTestId('dm-policy')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(checked()).toEqual(['Quem eu sigo']);
    for (const name of ['Todos', 'Quem eu sigo', 'Ninguém']) {
      expect(radio(name)).toHaveStyle({ minHeight: 48 });
    }
  });

  it('saves a choice at once and keeps it when the server agrees', async () => {
    await renderPrivacy();

    await fireEvent.press(radio('Ninguém'));

    expect(checked()).toEqual(['Ninguém']);
    expect(policy()).toBe('nobody');
    expect(mocked.setDmPolicy).toHaveBeenCalledWith('nobody');
    await act(() => dmPolicySettled());
    expect(checked()).toEqual(['Ninguém']);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('does not save the choice that is already set', async () => {
    await renderPrivacy();

    await fireEvent.press(radio('Todos'));
    await act(() => dmPolicySettled());

    expect(mocked.setDmPolicy).not.toHaveBeenCalled();
  });

  it('goes back to the saved policy with a toast when saving fails', async () => {
    const request = deferred();
    mocked.setDmPolicy.mockReturnValueOnce(request.promise);
    await renderPrivacy();

    await fireEvent.press(radio('Quem eu sigo'));
    expect(checked()).toEqual(['Quem eu sigo']);
    await act(async () => request.reject(new NetworkError()));
    await act(() => dmPolicySettled());

    expect(checked()).toEqual(['Todos']);
    expect(policy()).toBe('everyone');
    expect(showToast).toHaveBeenCalledWith(
      'Sem conexão com o servidor. Verifique a internet e tente de novo.',
    );
  });

  it('runs quick choices in order and ends where the user did', async () => {
    const first = deferred();
    mocked.setDmPolicy.mockReturnValueOnce(first.promise);
    await renderPrivacy();

    await fireEvent.press(radio('Ninguém'));
    await fireEvent.press(radio('Quem eu sigo'));
    expect(mocked.setDmPolicy).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    await act(() => dmPolicySettled());

    expect(mocked.setDmPolicy.mock.calls).toEqual([['nobody'], ['following']]);
    expect(checked()).toEqual(['Quem eu sigo']);
  });

  it('when only the last of quick choices fails, goes back to the one the server took', async () => {
    const first = deferred();
    mocked.setDmPolicy.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('boom'));
    await renderPrivacy();

    await fireEvent.press(radio('Ninguém'));
    await fireEvent.press(radio('Quem eu sigo'));
    await act(async () => first.resolve());
    await act(() => dmPolicySettled());

    expect(checked()).toEqual(['Ninguém']);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Não foi possível concluir. Tente de novo.');
  });

  it('keeps the last choice when an earlier one failed but the last succeeded', async () => {
    const first = deferred();
    mocked.setDmPolicy.mockReturnValueOnce(first.promise).mockResolvedValueOnce(undefined);
    await renderPrivacy();

    await fireEvent.press(radio('Ninguém'));
    await fireEvent.press(radio('Quem eu sigo'));
    await act(async () => first.reject(new Error('boom')));
    await act(() => dmPolicySettled());

    expect(checked()).toEqual(['Quem eu sigo']);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('drops a queued choice after a sign-out and writes nothing to the next session', async () => {
    const first = deferred();
    mocked.setDmPolicy.mockReturnValueOnce(first.promise);
    await renderPrivacy();

    await fireEvent.press(radio('Ninguém'));
    await fireEvent.press(radio('Quem eu sigo'));
    await act(async () => {
      useSession.setState({ user: { ...ana, id: 'u2', dmPolicy: 'everyone' } });
      first.reject(new Error('cancelled'));
    });
    await act(() => dmPolicySettled());

    expect(mocked.setDmPolicy).toHaveBeenCalledTimes(1);
    expect(policy()).toBe('everyone');
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each([
    ['Contas silenciadas', '/settings/muted'],
    ['Contas bloqueadas', '/settings/blocked'],
  ])('opens %s', async (label, href) => {
    await renderPrivacy();

    await fireEvent.press(screen.getByRole('button', { name: label }));

    expect(mockPush).toHaveBeenCalledWith(href);
  });
});
