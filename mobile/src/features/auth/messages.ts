import { ApiError, NetworkError } from '@/lib/http/errors';

export function authErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'invalid_credentials') return 'E-mail, username ou senha incorretos.';
    if (error.status === 409) return 'Username ou e-mail já cadastrado.';
    if (error.status === 429 || error.status >= 500) return error.message;
    if (error.status === 400) return 'Dados inválidos. Revise os campos.';
  }
  return 'Não foi possível concluir. Tente de novo.';
}
