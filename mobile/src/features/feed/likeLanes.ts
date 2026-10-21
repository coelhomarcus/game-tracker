/**
 * Like requests are serialized per item (post or comment) and rolled back per item.
 *
 * A lane exists while an item has requests in flight. It remembers the last state the
 * server is known to hold (`confirmed`), so a failure never needs a stale cache snapshot.
 */
type Lane = { tail: Promise<void>; pending: number; confirmed: boolean };

const lanes = new Map<string, Lane>();

/** Registers a tap, synchronously and before any await, with the like state the user saw. */
export function beginLike(key: string, seenLiked: boolean): void {
  const lane = lanes.get(key);
  if (lane) {
    lane.pending += 1;
  } else {
    lanes.set(key, {
      tail: Promise.resolve(),
      pending: 1,
      confirmed: seenLiked,
    });
  }
}

/** Runs `request` after every earlier request of the same item settled; failures do not break the chain. */
export function runInLane<T>(
  key: string,
  request: () => Promise<T>,
): Promise<T> {
  const lane = lanes.get(key);
  if (!lane) return request();
  const result = lane.tail.then(request);
  lane.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/**
 * Closes a tap. Returns the like state to roll the item back to, or `undefined` when no
 * rollback is needed: it succeeded, or a later tap is still pending and decides the outcome.
 */
export function settleLike(
  key: string,
  target: boolean,
  ok: boolean,
): boolean | undefined {
  const lane = lanes.get(key);
  if (!lane) return undefined;
  if (ok) lane.confirmed = target;
  lane.pending -= 1;
  if (lane.pending > 0) return undefined;
  lanes.delete(key);
  return ok ? undefined : lane.confirmed;
}
