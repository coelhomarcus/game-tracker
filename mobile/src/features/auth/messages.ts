import { ApiError, NetworkError } from '@/lib/http/errors';

/** The recipient's message policy refuses the person (403 `dm_not_allowed`). */
export const DM_NOT_ALLOWED_MESSAGE = 'Esta pessoa não aceita mensagens suas.';
/** A block between the two accounts refuses the action (403 `blocked`). */
export const BLOCKED_MESSAGE = 'Não é possível interagir com esta conta.';

export function authErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
  if (error instanceof ApiError) {
    if (error.code === 'dm_not_allowed') return DM_NOT_ALLOWED_MESSAGE;
    if (error.code === 'blocked') return BLOCKED_MESSAGE;
    if (error.code === 'invalid_credentials') return 'E-mail, username ou senha incorretos.';
    if (error.status === 409) return 'Username ou e-mail já cadastrado.';
    if (error.status === 429 || error.status >= 500) return error.message;
    if (error.status === 400) return 'Dados inválidos. Revise os campos.';
  }
  return 'Não foi possível concluir. Tente de novo.';
}
