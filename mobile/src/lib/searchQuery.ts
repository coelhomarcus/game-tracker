/**
 * A search answer stays fresh this long, so going back to a term (another Explorar tab, a recent
 * search) shows it again without a new request.
 */
export const SEARCH_STALE_MS = 5 * 60_000;
