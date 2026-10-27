import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { accountApi, useSession, type User } from '@/features/auth';
import { useChatStore } from '@/features/chat/chatStore';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { DeleteAccount } from '../DeleteAccount';

jest.mock('@/lib/realtime/chatSocket', () => jest.requireActual('@/test-utils/fakeChatSocket'));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));
jest.mock('@/features/auth/account', () => ({
  accountApi: { changePassword: jest.fn(), deleteAccount: jest.fn() },
}));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const mocked = jest.mocked(accountApi);

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

/** Stands in for the session's sign-out: the store ends signed out, as Sair leaves it. */
const signOut = jest.fn(async () => {
  useSession.setState({ status: 'signedOut', user: null });
});

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DeleteAccount />
    </SafeAreaProvider>,
  );
}

async function toPasswordStep() {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
}

const remove = () => screen.getByRole('button', { name: 'Excluir minha conta' });

beforeEach(() => {
  jest.clearAllMocks();
  mocked.deleteAccount.mockReset();
  useSession.setState({ status: 'signedIn', user: ana, signOut });
  useChatStore.getState().clear();
});

afterEach(() => {
  useSession.setState({ status: 'signedOut', user: null });
  useChatStore.getState().clear();
});

describe('DeleteAccount', () => {
  it('first explains what is lost, without a password field', async () => {
    await renderScreen();

    expect(
      screen.getByText(
        'Isso apaga seus posts, comentários, mensagens e sua biblioteca. Não pode ser desfeito.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByLabelText('Senha')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir minha conta' })).toBeNull();
  });

  it('Cancelar goes back without deleting', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mocked.deleteAccount).not.toHaveBeenCalled();
  });

  it('then asks for the password; the red button waits for one', async () => {
    await toPasswordStep();

    expect(screen.getByLabelText('Senha')).toHaveProp('secureTextEntry', true);
    expect(remove()).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'minha-senha');
    expect(remove()).toBeEnabled();
  });

  it('deletes, signs out like Sair (drafts go too) and shows the toast after', async () => {
    mocked.deleteAccount.mockResolvedValue(undefined);
    useChatStore.setState({ drafts: { c1: 'rascunho' } });
    const order: string[] = [];
    signOut.mockImplementationOnce(async () => {
      order.push('signOut');
      useSession.setState({ status: 'signedOut', user: null });
    });
    jest.mocked(showToast).mockImplementation((message) => {
      order.push(message);
    });
    await toPasswordStep();
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'minha-senha');

    await fireEvent.press(remove());

    expect(mocked.deleteAccount).toHaveBeenCalledWith('minha-senha');
    expect(order).toEqual(['signOut', 'Conta excluída']);
    expect(useSession.getState().status).toBe('signedOut');
    expect(useChatStore.getState().drafts).toEqual({});
  });

  it('deletes once while the request is on its way', async () => {
    const request = deferred();
    mocked.deleteAccount.mockReturnValue(request.promise);
    await toPasswordStep();
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'minha-senha');

    await fireEvent.press(remove());
    await fireEvent(screen.getByLabelText('Senha'), 'submitEditing');

    expect(mocked.deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Senha')).toHaveProp('editable', false);
    await act(async () => request.resolve());
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('keeps the account and the session on a wrong password', async () => {
    mocked.deleteAccount.mockRejectedValue(
      new ApiError(400, 'invalid_password', 'Senha atual incorreta'),
    );
    await toPasswordStep();
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'errada');

    await fireEvent.press(remove());

    expect(screen.getByText('Senha incorreta.')).toBeOnTheScreen();
    expect(signOut).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(useSession.getState().status).toBe('signedIn');

    await fireEvent.changeText(screen.getByLabelText('Senha'), 'outra');
    expect(screen.queryByText('Senha incorreta.')).toBeNull();
  });

  it('shows other failures and stays signed in', async () => {
    mocked.deleteAccount.mockRejectedValue(new NetworkError());
    await toPasswordStep();
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'minha-senha');

    await fireEvent.press(remove());

    expect(
      screen.getByText('Sem conexão com o servidor. Verifique a internet e tente de novo.'),
    ).toBeOnTheScreen();
    expect(signOut).not.toHaveBeenCalled();
    expect(remove()).toBeEnabled();
  });
});
