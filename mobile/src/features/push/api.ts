import { api } from '@/features/auth';

/** Revoking runs while signing out, so it may not hold the sign-out up for long. */
const REVOKE_TIMEOUT_MS = 3000;

const installationPath = (installationId: string) =>
  `/push/installations/${encodeURIComponent(installationId)}`;

export const pushApi = {
  /** Links this installation's FCM token to the signed-in account (moves it from another one). */
  async register(installationId: string, token: string): Promise<void> {
    await api.put<void>(installationPath(installationId), {
      provider: 'fcm',
      platform: 'android',
      token,
    });
  },

  async revoke(installationId: string): Promise<void> {
    await api.delete<void>(installationPath(installationId), { timeoutMs: REVOKE_TIMEOUT_MS });
  },
};
