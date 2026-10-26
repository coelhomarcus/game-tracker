/**
 * Toggle requests (likes, reposts, bookmarks, follows) are serialized per lane and rolled back
 * per lane; a lane is one action on one item.
 *
 * A lane exists while an item has requests in flight. It remembers the last state the
 * server is known to hold (`confirmed`), so a failure never needs a stale cache snapshot.
 */
type Queued = { start: () => void; skip: () => void };
type Lane = {
  tail: Promise<void>;
  pending: number;
  confirmed: boolean;
  /** `runLatest` only: whether a request of the lane is on the wire. */
  active: boolean;
  /** `runLatest` only: the one request waiting for the active one. */
  queued: Queued | null;
};

/** What `runLatest` resolves with for a request that a later tap made pointless. */
export const SUPERSEDED: unique symbol = Symbol('superseded');
export type Superseded = typeof SUPERSEDED;

export function createLanes() {
  const lanes = new Map<string, Lane>();

  return {
    /** Registers a tap, synchronously and before any await, with the state the user saw. */
    begin(key: string, seen: boolean): void {
      const lane = lanes.get(key);
      if (lane) {
        lane.pending += 1;
      } else {
        lanes.set(key, {
          tail: Promise.resolve(),
          pending: 1,
          confirmed: seen,
          active: false,
          queued: null,
        });
      }
    },

    /** Runs `request` after every earlier request of the same item settled; failures do not break the chain. */
    run<T>(key: string, request: () => Promise<T>): Promise<T> {
      const lane = lanes.get(key);
      if (!lane) return request();
      const result = lane.tail.then(request);
      lane.tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    /**
     * Like `run`, but collapses rapid taps: at most one request is on the wire and one waits.
     * A waiting request that a later tap replaces never starts and resolves with `SUPERSEDED`;
     * close its tap with `skip`. The last tap always runs, so the server ends where the user did.
     */
    runLatest<T>(key: string, request: () => Promise<T>): Promise<T | Superseded> {
      const lane = lanes.get(key);
      if (!lane) return request();
      return new Promise<T | Superseded>((resolve, reject) => {
        const start = () => {
          lane.active = true;
          request()
            .then(resolve, reject)
            .finally(() => {
              lane.active = false;
              const next = lane.queued;
              lane.queued = null;
              next?.start();
            });
        };
        if (!lane.active) {
          start();
          return;
        }
        lane.queued?.skip();
        lane.queued = { start, skip: () => resolve(SUPERSEDED) };
      });
    },

    /**
     * Closes a tap. Returns the state to roll the item back to, or `undefined` when no
     * rollback is needed: it succeeded, or a later tap is still pending and decides the outcome.
     */
    settle(key: string, target: boolean, ok: boolean): boolean | undefined {
      const lane = lanes.get(key);
      if (!lane) return undefined;
      if (ok) lane.confirmed = target;
      lane.pending -= 1;
      if (lane.pending > 0) return undefined;
      lanes.delete(key);
      return ok ? undefined : lane.confirmed;
    },

    /** Closes a superseded tap: it told the server nothing, and a later tap decides the outcome. */
    skip(key: string): void {
      const lane = lanes.get(key);
      if (!lane) return;
      lane.pending -= 1;
      if (lane.pending <= 0) lanes.delete(key);
    },

    /** Whether the item still has a request in flight. */
    has(key: string): boolean {
      return lanes.has(key);
    },

    /** Whether any item still has a request in flight. */
    anyInFlight(): boolean {
      return lanes.size > 0;
    },
  };
}

/** What a post or comment toggle is about. */
export type ToggleAction = 'like' | 'repost' | 'bookmark' | 'commentLike';

/**
 * The lane of one action on one item. Each action has its own lane, so a like and a repost of
 * the same post neither wait for nor roll back each other.
 */
export function toggleLane(action: ToggleAction, id: string): string {
  return `${action}:${id}`;
}

const toggles = createLanes();

export const beginToggle = toggles.begin;
/** Post and comment toggles collapse rapid taps (see `runLatest`). */
export const runInLane = toggles.runLatest;
export const settleToggle = toggles.settle;
export const skipToggle = toggles.skip;
/**
 * Whether any toggle request, of any post or comment, is still in flight. Until none is, a fetch
 * the toggles cancelled stays stopped: its response could undo an optimistic write.
 */
export const anyToggleInFlight = toggles.anyInFlight;
