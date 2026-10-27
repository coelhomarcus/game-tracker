import { api, sessionManager } from './client';

/** Changing the password and deleting the account. Both answer 204 with no body. */
export const accountApi = {
  /**
   * Sets a new password. The server ends every other session and keeps this one, which it knows
   * by the refresh token sent along. The body is built on each attempt: a retry after a refresh
   * must name the renewed token, since the old one is revoked by then.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.post<void>('/auth/password', () => ({
      currentPassword,
      newPassword,
      refreshToken: sessionManager.currentRefreshToken ?? '',
    }));
  },

  /** Deletes the account and everything in it. A wrong password is 400 `invalid_password`. */
  async deleteAccount(password: string): Promise<void> {
    await api.delete<void>('/users/me', { body: { password } });
  },
};
