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

  signOut() {
    // A second tap while the hooks run joins the sign-out already in progress.
    signingOut ??= (async () => {
      try {
        await runBeforeSignOut();
        const previousToken = await sessionManager.clear();
        queryClient.clear();
        set({ status: 'signedOut', user: null });
        if (!previousToken) return;
        try {
          await authApi.logout(previousToken);
        } catch {
          // Best effort: the local session is already gone.
        }
      } finally {
        signingOut = null;
      }
    })();
    return signingOut;
  },
}));

let signingOut: Promise<void> | null = null;

type BeforeSignOut = () => Promise<void>;

/** How long one hook may hold the sign-out up. */
const BEFORE_SIGN_OUT_TIMEOUT_MS = 3000;

const beforeSignOutHooks = new Set<BeforeSignOut>();

/**
 * Runs `hook` on every sign-out the user asks for, before the session is cleared, so it can still
 * make authenticated requests (e.g. revoke this device's push registration). Best effort: errors
 * are ignored and a hook that takes longer than 3 s is no longer waited for. Not run when the
 * session expires on its own, since there is no session left by then. Returns the unregister.
 */
export function registerBeforeSignOut(hook: BeforeSignOut): () => void {
  beforeSignOutHooks.add(hook);
  return () => {
    beforeSignOutHooks.delete(hook);
  };
}

function runBounded(hook: BeforeSignOut): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, BEFORE_SIGN_OUT_TIMEOUT_MS);
    Promise.resolve()
      .then(hook)
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        resolve();
      });
  });
}

async function runBeforeSignOut(): Promise<void> {
  await Promise.all([...beforeSignOutHooks].map(runBounded));
}

sessionManager.onExpired = () => {
  queryClient.clear();
  useSession.setState({ status: 'signedOut', user: null });
};
