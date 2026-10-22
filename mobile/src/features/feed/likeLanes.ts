/**
 * Toggle requests (likes, follows) are serialized per item and rolled back per item.
 *
 * A lane exists while an item has requests in flight. It remembers the last state the
 * server is known to hold (`confirmed`), so a failure never needs a stale cache snapshot.
 */
type Lane = { tail: Promise<void>; pending: number; confirmed: boolean };

export function createLanes() {
  const lanes = new Map<string, Lane>();

  return {
    /** Registers a tap, synchronously and before any await, with the state the user saw. */
    begin(key: string, seen: boolean): void {
      const lane = lanes.get(key);
      if (lane) {
        lane.pending += 1;
      } else {
        lanes.set(key, { tail: Promise.resolve(), pending: 1, confirmed: seen });
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

const likes = createLanes();

export const beginLike = likes.begin;
export const runInLane = likes.run;
export const settleLike = likes.settle;
/** Whether any like request, of any post or comment, is still in flight. */
export const anyLikeInFlight = likes.anyInFlight;
