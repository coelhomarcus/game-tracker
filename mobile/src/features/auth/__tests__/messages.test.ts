import { ApiError, NetworkError } from '@/lib/http/errors';

import { authErrorMessage } from '../messages';

test.each([
  [
    'a network failure',
    new NetworkError(),
    'Sem conexão com o servidor. Verifique a internet e tente de novo.',
  ],
  [
    'invalid credentials',
    new ApiError(401, 'invalid_credentials', 'Invalid credentials'),
    'E-mail, username ou senha incorretos.',
  ],
  [
    'a conflict',
    new ApiError(409, 'conflict', 'Already exists'),
    'Username ou e-mail já cadastrado.',
  ],
  [
    'rate limiting',
    new ApiError(429, 'rate_limited', 'Muitas tentativas. Aguarde um pouco.'),
    'Muitas tentativas. Aguarde um pouco.',
  ],
  [
    'a server error',
    new ApiError(503, 'unavailable', 'Servidor indisponível.'),
    'Servidor indisponível.',
  ],
  [
    'a validation error',
    new ApiError(400, 'validation_error', 'Invalid body'),
    'Dados inválidos. Revise os campos.',
  ],
  [
    'another API error',
    new ApiError(403, 'forbidden', 'Forbidden'),
    'Não foi possível concluir. Tente de novo.',
  ],
  ['an unknown value', new Error('boom'), 'Não foi possível concluir. Tente de novo.'],
])('maps %s to its copy', (_label, error, expected) => {
  expect(authErrorMessage(error)).toBe(expected);
});
