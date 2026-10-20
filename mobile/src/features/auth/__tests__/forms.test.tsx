import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { ApiError } from '@/lib/http/errors';

import { LoginForm } from '../LoginForm';
import { RegisterForm } from '../RegisterForm';
import { useSession } from '../session';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));
jest.mock('../session', () => ({ useSession: jest.fn() }));

const signIn = jest.fn();
const signUp = jest.fn();
const replace = jest.fn();

beforeEach(() => {
  jest.resetAllMocks();
  (useSession as unknown as jest.Mock).mockImplementation((selector: (state: object) => unknown) =>
    selector({ signIn, signUp }),
  );
  (useRouter as jest.Mock).mockReturnValue({ replace });
});

async function fillLogin(identifier: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText('E-mail ou username'), identifier);
  await fireEvent.changeText(screen.getByLabelText('Senha'), password);
}

describe('LoginForm', () => {
  it('login submits trimmed identifier', async () => {
    signIn.mockResolvedValue(undefined);
    await render(<LoginForm />);
    await fillLogin('  ana  ', 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(signIn).toHaveBeenCalledWith('ana', 'secret');
  });

  it('login shows field errors without calling the server', async () => {
    await render(<LoginForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getAllByText('Campo obrigatório')).toHaveLength(2);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('login shows the server message', async () => {
    signIn.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Invalid credentials'));
    await render(<LoginForm />);
    await fillLogin('ana', 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('E-mail, username ou senha incorretos.')).toBeOnTheScreen();
  });

  it('clears the server message when a field is edited', async () => {
    signIn.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Invalid credentials'));
    await render(<LoginForm />);
    await fillLogin('ana', 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText('E-mail, username ou senha incorretos.');
    await fireEvent.changeText(screen.getByLabelText('Senha'), 'secret2');
    expect(screen.queryByText('E-mail, username ou senha incorretos.')).toBeNull();
  });

  it('button is disabled while submitting', async () => {
    signIn.mockReturnValue(new Promise<void>(() => {}));
    await render(<LoginForm />);
    await fillLogin('ana', 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Entrar' }));
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('submits from the keyboard on the password field', async () => {
    signIn.mockResolvedValue(undefined);
    await render(<LoginForm />);
    await fillLogin('ana', 'secret');
    expect(screen.getByLabelText('Senha').props.returnKeyType).toBe('go');
    await fireEvent(screen.getByLabelText('Senha'), 'submitEditing');
    expect(signIn).toHaveBeenCalledWith('ana', 'secret');
  });

  it('ignores the keyboard submit while a sign-in is pending', async () => {
    signIn.mockReturnValue(new Promise<void>(() => {}));
    await render(<LoginForm />);
    await fillLogin('ana', 'secret');
    await fireEvent(screen.getByLabelText('Senha'), 'submitEditing');
    await fireEvent(screen.getByLabelText('Senha'), 'submitEditing');
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('shows the heading and links to the register screen', async () => {
    await render(<LoginForm />);
    expect(screen.getByRole('header', { name: 'GameTracker' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(replace).toHaveBeenCalledWith('/register');
  });
});

describe('RegisterForm', () => {
  async function fillRegister(values: {
    name: string;
    username: string;
    email: string;
    password: string;
  }) {
    await fireEvent.changeText(screen.getByLabelText('Nome'), values.name);
    await fireEvent.changeText(screen.getByLabelText('Username'), values.username);
    await fireEvent.changeText(screen.getByLabelText('E-mail'), values.email);
    await fireEvent.changeText(screen.getByLabelText('Senha'), values.password);
  }

  it('register submits all fields', async () => {
    signUp.mockResolvedValue(undefined);
    await render(<RegisterForm />);
    await fillRegister({
      name: ' Ana ',
      username: ' ana_1 ',
      email: ' ana@example.com ',
      password: 'longpassword',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(signUp).toHaveBeenCalledWith({
      username: 'ana_1',
      name: 'Ana',
      email: 'ana@example.com',
      password: 'longpassword',
    });
  });

  it('register shows field errors without calling the server', async () => {
    await render(<RegisterForm />);
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(screen.getAllByText('Campo obrigatório')).toHaveLength(4);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('register shows the server message', async () => {
    signUp.mockRejectedValue(new ApiError(409, 'conflict', 'Already exists'));
    await render(<RegisterForm />);
    await fillRegister({
      name: 'Ana',
      username: 'ana_1',
      email: 'ana@example.com',
      password: 'longpassword',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText('Username ou e-mail já cadastrado.')).toBeOnTheScreen();
  });

  it('submits from the keyboard on the password field', async () => {
    signUp.mockResolvedValue(undefined);
    await render(<RegisterForm />);
    await fillRegister({
      name: 'Ana',
      username: 'ana_1',
      email: 'ana@example.com',
      password: 'longpassword',
    });
    expect(screen.getByLabelText('Senha').props.returnKeyType).toBe('go');
    expect(screen.getByLabelText('Nome').props.returnKeyType).toBe('next');
    await fireEvent(screen.getByLabelText('Senha'), 'submitEditing');
    expect(signUp).toHaveBeenCalledWith({
      username: 'ana_1',
      name: 'Ana',
      email: 'ana@example.com',
      password: 'longpassword',
    });
  });

  it('shows the heading and links to the login screen', async () => {
    await render(<RegisterForm />);
    expect(screen.getByRole('header', { name: 'GameTracker' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Já tenho conta' }));
    expect(replace).toHaveBeenCalledWith('/login');
  });
});
