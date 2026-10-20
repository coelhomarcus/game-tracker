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
 */
export class SessionManager {
  accessToken: string | null = null;
  generation = 0;
  onExpired?: () => void;

  private inFlight: Promise<RefreshOutcome> | null = null;

  constructor(
    private readonly store: TokenStore,
    private readonly refreshCall: (refreshToken: string) => Promise<SessionTokens>,
  ) {}

  async start(tokens: SessionTokens): Promise<void> {
    this.generation += 1;
    this.inFlight = null;
    this.accessToken = tokens.accessToken;
    await this.store.write(tokens.refreshToken).catch(() => undefined);
  }

  restore(): Promise<RefreshOutcome> {
    return this.refresh();
  }

  async refreshAfterUnauthorized(usedToken: string | null): Promise<RefreshOutcome> {
    // Another request already replaced the token this one was rejected with.
    if (this.accessToken !== usedToken) return 'refreshed';
    return this.refresh();
  }

  async clear(): Promise<string | null> {
    this.generation += 1;
    this.inFlight = null;
    this.accessToken = null;
    const previous = await this.store.read().catch(() => null);
    await this.store.clear().catch(() => undefined);
    return previous;
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

    const stored = await this.store.read().catch(() => null);
    if (generation !== this.generation) return 'discarded';
    if (!stored) return 'noSession';

    let tokens: SessionTokens;
    try {
      tokens = await this.refreshCall(stored);
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
    await this.store.write(tokens.refreshToken).catch(() => undefined);
    return 'refreshed';
  }
}
