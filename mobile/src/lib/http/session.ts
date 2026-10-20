import type { TokenStore } from '@/lib/tokenStore';

import { ApiError } from './errors';

export type SessionTokens = { accessToken: string; refreshToken: string };

export type RefreshOutcome = 'refreshed' | 'invalid' | 'unavailable' | 'discarded' | 'noSession';

/**
 * Holds the in-memory access token and drives the single-flight refresh.
 *
 * `generation` identifies the current session: it changes on `start` and
 * `clear`, so work that began under an older session can detect it is stale
 * and drop its result instead of applying it.
 *
 * The refresh token is kept in memory for the life of the session; the store
 * only persists it across app restarts, so a store that fails to persist does
 * not break refreshing.
 */
export class SessionManager {
  accessToken: string | null = null;
  generation = 0;
  onExpired?: () => void;

  private refreshToken: string | null = null;
  private inFlight: Promise<RefreshOutcome> | null = null;
  // Native stores do not guarantee that operations finish in the order they
  // were issued, so every store access runs through this chain.
  private storeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: TokenStore,
    private readonly refreshCall: (refreshToken: string) => Promise<SessionTokens>,
  ) {}

  async start(tokens: SessionTokens): Promise<void> {
    this.generation += 1;
    this.inFlight = null;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    await this.enqueue(() => this.store.write(tokens.refreshToken)).catch(() => undefined);
  }

  restore(): Promise<RefreshOutcome> {
    return this.refresh();
  }

  async refreshAfterUnauthorized(usedToken: string | null): Promise<RefreshOutcome> {
    // Another request already replaced the token this one was rejected with.
    if (this.accessToken !== usedToken) return 'refreshed';
    const outcome = await this.refresh();
    // A 401 with no refresh token anywhere: the session cannot be renewed.
    if (outcome === 'noSession' && this.accessToken !== null) {
      await this.clear();
      this.onExpired?.();
    }
    return outcome;
  }

  async clear(): Promise<string | null> {
    this.generation += 1;
    this.inFlight = null;
    this.accessToken = null;
    const inMemory = this.refreshToken;
    this.refreshToken = null;
    // Read and delete run as one queued step so a write issued by a newer
    // `start` cannot land between them and be wiped.
    return this.enqueue(async () => {
      const previous = inMemory ?? (await this.store.read().catch(() => null));
      await this.store.clear().catch(() => undefined);
      return previous;
    }).catch(() => null);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storeQueue.then(operation);
    this.storeQueue = result.catch(() => undefined);
    return result;
  }

  private refresh(): Promise<RefreshOutcome> {
    if (this.inFlight) return this.inFlight;
    const attempt = this.runRefresh().finally(() => {
      // A newer session may already have replaced this attempt.
      if (this.inFlight === attempt) this.inFlight = null;
    });
    this.inFlight = attempt;
    return attempt;
  }

  private async runRefresh(): Promise<RefreshOutcome> {
    const generation = this.generation;

    // Cold start has nothing in memory yet and restores from the store.
    const current =
      this.refreshToken ?? (await this.enqueue(() => this.store.read()).catch(() => null));
    if (generation !== this.generation) return 'discarded';
    if (!current) return 'noSession';

    let tokens: SessionTokens;
    try {
      tokens = await this.refreshCall(current);
    } catch (error) {
      if (generation !== this.generation) return 'discarded';
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) {
        await this.clear();
        this.onExpired?.();
        return 'invalid';
      }
      return 'unavailable';
    }

    if (generation !== this.generation) return 'discarded';
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    await this.enqueue(() => this.store.write(tokens.refreshToken)).catch(() => undefined);
    return 'refreshed';
  }
}
