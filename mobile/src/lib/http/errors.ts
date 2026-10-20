export const UNKNOWN_ERROR_MESSAGE = 'Não foi possível concluir. Tente de novo.';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The request never produced a response: fetch rejected, was aborted, or timed out. */
export class NetworkError extends Error {
  constructor(message = 'Sem conexão. Verifique sua internet e tente de novo.') {
    super(message);
    this.name = 'NetworkError';
  }
}
