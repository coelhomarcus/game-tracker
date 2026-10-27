import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { accountApi } from '@/features/auth';
import { ApiError, NetworkError } from '@/lib/http/errors';
import { showToast } from '@/lib/toast';

import { ChangePassword } from '../ChangePassword';

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

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function renderScreen() {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ChangePassword />
    </SafeAreaProvider>,
  );
}

const field = (label: string) => screen.getByLabelText(label);
const save = () => screen.getByRole('button', { name: 'Salvar' });

async function fill(current: string, next: string, confirm: string) {
  await fireEvent.changeText(field('Senha atual'), current);
  await fireEvent.changeText(field('Nova senha'), next);
  await fireEvent.changeText(field('Confirmar nova senha'), confirm);
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('ChangePassword', () => {
  it('has the three password fields, hidden, and the sign-up rule as a hint', async () => {
    await renderScreen();

    for (const label of ['Senha atual', 'Nova senha', 'Confirmar nova senha']) {
      expect(field(label)).toHaveProp('secureTextEntry', true);
    }
    expect(screen.getByText('Use de 8 a 72 caracteres.')).toBeOnTheScreen();
  });

  it('keeps Salvar disabled until every field is valid', async () => {
    await renderScreen();
    expect(save()).toBeDisabled();

    await fill('antiga', 'curta', 'curta');
    expect(save()).toBeDisabled();
    await fill('antiga', 'nova-senha-1', 'nova-senha-2');
    expect(save()).toBeDisabled();
    await fill('', 'nova-senha-1', 'nova-senha-1');
    expect(save()).toBeDisabled();

    await fill('antiga', 'nova-senha-1', 'nova-senha-1');
    expect(save()).toBeEnabled();
  });

  it('shows a field rule once the field is left, and follows the typing after that', async () => {
    await renderScreen();

    await fireEvent.changeText(field('Nova senha'), 'curta');
    expect(screen.queryByText('Use pelo menos 8 caracteres')).toBeNull();
    await fireEvent(field('Nova senha'), 'blur');
    expect(screen.getByText('Use pelo menos 8 caracteres')).toBeOnTheScreen();
    await fireEvent.changeText(field('Nova senha'), 'comprida-o-bastante');
    expect(screen.queryByText('Use pelo menos 8 caracteres')).toBeNull();

    await fireEvent.changeText(field('Confirmar nova senha'), 'outra-coisa');
    await fireEvent(field('Confirmar nova senha'), 'blur');
    expect(screen.getByText('As senhas não coincidem')).toBeOnTheScreen();
  });

  it('saves, says so in a toast and goes back', async () => {
    mocked.changePassword.mockResolvedValue(undefined);
    await renderScreen();
    await fill('antiga', 'nova-senha-1', 'nova-senha-1');

    await fireEvent.press(save());

    expect(mocked.changePassword).toHaveBeenCalledWith('antiga', 'nova-senha-1');
    expect(showToast).toHaveBeenCalledWith('Senha alterada');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('saves once while a request is on its way and locks the fields', async () => {
    const request = deferred();
    mocked.changePassword.mockReturnValue(request.promise);
    await renderScreen();
    await fill('antiga', 'nova-senha-1', 'nova-senha-1');

    await fireEvent.press(save());
    await fireEvent(field('Confirmar nova senha'), 'submitEditing');

    expect(mocked.changePassword).toHaveBeenCalledTimes(1);
    expect(field('Senha atual')).toHaveProp('editable', false);
    await act(async () => request.resolve());
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('marks a wrong current password on its field and stays', async () => {
    mocked.changePassword.mockRejectedValue(
      new ApiError(400, 'invalid_password', 'Senha atual incorreta'),
    );
    await renderScreen();
    await fill('errada', 'nova-senha-1', 'nova-senha-1');

    await fireEvent.press(save());

    expect(screen.getByText('Senha atual incorreta.')).toBeOnTheScreen();
    expect(field('Senha atual')).toHaveProp('accessibilityHint', 'Senha atual incorreta.');
    expect(mockBack).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(field('Senha atual')).toHaveProp('editable', true);

    await fireEvent.changeText(field('Senha atual'), 'certa');
    expect(screen.queryByText('Senha atual incorreta.')).toBeNull();
  });

  it('shows other failures under the form', async () => {
    mocked.changePassword.mockRejectedValue(new NetworkError());
    await renderScreen();
    await fill('antiga', 'nova-senha-1', 'nova-senha-1');

    await fireEvent.press(save());

    expect(
      screen.getByText('Sem conexão com o servidor. Verifique a internet e tente de novo.'),
    ).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
