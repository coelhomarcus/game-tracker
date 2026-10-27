const REQUIRED = 'Campo obrigatório';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export type LoginErrors = Partial<Record<'identifier' | 'password', string>>;
export type RegisterErrors = Partial<Record<'name' | 'username' | 'email' | 'password', string>>;

function passwordError(password: string): string | undefined {
  if (password.length === 0) return REQUIRED;
  if (password.length < 8) return 'Use pelo menos 8 caracteres';
  if (password.length > 72) return 'Use no máximo 72 caracteres';
  return undefined;
}

export function usernameError(username: string): string | undefined {
  if (username.length === 0) return REQUIRED;
  if (username.length < 3) return 'Use pelo menos 3 caracteres';
  if (!USERNAME_PATTERN.test(username)) return 'Use apenas letras, números e _';
  if (username.length > 30) return 'Use no máximo 30 caracteres';
  return undefined;
}

function nameError(name: string): string | undefined {
  if (name.length === 0) return REQUIRED;
  if (name.length > 50) return 'Use no máximo 50 caracteres';
  return undefined;
}

function emailError(email: string): string | undefined {
  if (email.length === 0) return REQUIRED;
  if (!EMAIL_PATTERN.test(email)) return 'Informe um e-mail válido';
  return undefined;
}

export function validateLogin(input: { identifier: string; password: string }): LoginErrors {
  const errors: LoginErrors = {};
  if (input.identifier.trim().length === 0) errors.identifier = REQUIRED;
  if (input.password.length === 0) errors.password = REQUIRED;
  return errors;
}

export function validateRegister(input: {
  name: string;
  username: string;
  email: string;
  password: string;
}): RegisterErrors {
  const checks = {
    name: nameError(input.name.trim()),
    username: usernameError(input.username.trim()),
    email: emailError(input.email.trim()),
    password: passwordError(input.password),
  };
  const errors: RegisterErrors = {};
  for (const [field, message] of Object.entries(checks)) {
    if (message) errors[field as keyof RegisterErrors] = message;
  }
  return errors;
}

export type ChangePasswordInput = { current: string; next: string; confirm: string };
export type ChangePasswordErrors = Partial<Record<keyof ChangePasswordInput, string>>;

/** The new password follows the sign-up rules; the confirmation must repeat it exactly. */
export function validateChangePassword(input: ChangePasswordInput): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {};
  if (input.current.length === 0) errors.current = REQUIRED;
  const next = passwordError(input.next);
  if (next) errors.next = next;
  if (input.confirm.length === 0) errors.confirm = REQUIRED;
  else if (input.confirm !== input.next) errors.confirm = 'As senhas não coincidem';
  return errors;
}
