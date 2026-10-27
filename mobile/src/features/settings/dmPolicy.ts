import { api, authErrorMessage, useSession, type DmPolicy } from '@/features/auth';
import { authApi } from '@/features/auth/api';
import { chatApi } from '@/features/chat/api';
import { showToast } from '@/lib/toast';

/** Choices run one after another, so the server ends where the user did. */
let chain: Promise<void> = Promise.resolve();

/**
 * Per account with choices not settled yet: how many, and the policy the server is known to
 * hold (where a failure goes back to).
 */
const lanes = new Map<string, { pending: number; confirmed: DmPolicy }>();

/** Counts the choices made, so a read of the server that started before one is not applied after it. */
let choices = 0;

/** Writes the policy into the session copy of `me`; nothing after a sign-out or account switch. */
function write(me: string, dmPolicy: DmPolicy): void {
  useSession.setState((state) =>
    state.user?.id === me && state.user.dmPolicy !== dmPolicy
      ? { user: { ...state.user, dmPolicy } }
      : state,
  );
}

function settle(me: string, error?: unknown): void {
  const lane = lanes.get(me);
  if (!lane) return;
  lane.pending -= 1;
  if (lane.pending > 0) return;
  lanes.delete(me);
  if (error === undefined || useSession.getState().user?.id !== me) return;
  write(me, lane.confirmed);
  showToast(authErrorMessage(error));
}

/**
 * Who may message the signed-in user. Shown at once; when the last pending choice fails, the
 * policy goes back to the one the server holds and a toast says so.
 */
export function setDmPolicy(dmPolicy: DmPolicy): void {
  const user = useSession.getState().user;
  if (!user || user.dmPolicy === dmPolicy) return;
  const me = user.id;
  choices += 1;
  const lane = lanes.get(me) ?? { pending: 0, confirmed: user.dmPolicy };
  lane.pending += 1;
  lanes.set(me, lane);
  write(me, dmPolicy);
  chain = chain
    .then(() => {
      // Signed out or switched accounts meanwhile: the choice belonged to the other session.
      if (useSession.getState().user?.id !== me) throw new Error('session changed');
      return chatApi.setDmPolicy(dmPolicy);
    })
    .then(
      () => {
        lane.confirmed = dmPolicy;
        settle(me);
      },
      (error: unknown) => settle(me, error ?? new Error('failed')),
    );
}

/**
 * Reads the policy from the server into the session copy, which is otherwise loaded only at
 * sign-in: a change made on another device shows up here. Nothing happens while a choice of this
 * device is still pending, and a choice made meanwhile wins. Best effort: a failure keeps what is shown.
 */
export async function refreshDmPolicy(): Promise<void> {
  const me = useSession.getState().user?.id;
  if (me === undefined || lanes.has(me)) return;
  const seen = choices;
  try {
    const user = await authApi.me(api);
    if (user.id === me && seen === choices && !lanes.has(me)) write(me, user.dmPolicy);
  } catch {
    // The policy on screen stays.
  }
}

/** Test helper: resolves once every choice made so far has settled. */
export function dmPolicySettled(): Promise<void> {
  return chain;
}
