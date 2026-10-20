import { create } from 'zustand';

import { ApiError } from '@/lib/http/errors';
import { queryClient } from '@/lib/queryClient';

import { authApi, type RegisterInput, type User } from './api';
import { api, sessionManager } from './client';

export type SessionStatus = 'restoring' | 'signedOut' | 'signedIn' | 'unreachable';

type SessionState = {
  status: SessionStatus;
  user: User | null;
  bootstrap(): Promise<void>;
  signIn(identifier: string, password: string): Promise<void>;
  signUp(input: RegisterInput): Promise<void>;
  signOut(): Promise<void>;
};

export const useSession = create<SessionState>((set) => ({
  status: 'restoring',
  user: null,

  async bootstrap() {
    const outcome = await sessionManager.restore();
    if (outcome === 'discarded') return;
    if (outcome === 'noSession' || outcome === 'invalid') {
      set({ status: 'signedOut', user: null });
      return;
    }
    if (outcome === 'unavailable') {
      set({ status: 'unreachable', user: null });
      return;
    }

    try {
      const user = await authApi.me(api);
      set({ status: 'signedIn', user });
    } catch (error) {
      // The session changed while the profile was loading; that change owns the status.
      if (error instanceof ApiError && error.code === 'cancelled') return;
      if (error instanceof ApiError && error.status === 401) {
        // Drop the in-memory access token and the stored refresh token too.
        await sessionManager.clear();
        set({ status: 'signedOut', user: null });
        return;
      }
      set({ status: 'unreachable', user: null });
    }
  },

  async signIn(identifier, password) {
    const { user, ...tokens } = await authApi.login(identifier, password);
    await sessionManager.start(tokens);
    set({ status: 'signedIn', user });
  },

  async signUp(input) {
    const { user, ...tokens } = await authApi.register(input);
    await sessionManager.start(tokens);
    set({ status: 'signedIn', user });
  },

  async signOut() {
    const previousToken = await sessionManager.clear();
    queryClient.clear();
    set({ status: 'signedOut', user: null });
    if (!previousToken) return;
    try {
      await authApi.logout(previousToken);
    } catch {
      // Best effort: the local session is already gone.
    }
  },
}));

sessionManager.onExpired = () => {
  queryClient.clear();
  useSession.setState({ status: 'signedOut', user: null });
};
