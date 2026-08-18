import { describe, expect, it } from 'vitest';
import {
  ADMIN_WATCHLIST_LIMIT,
  AUTHENTICATED_WATCHLIST_LIMIT,
  GUEST_WATCHLIST_LIMIT,
  canPersistAuthenticatedWatchlist,
  getWatchlistLimit,
} from './watchlist-limits';

describe('watchlist limits', () => {
  it('uses a smaller device-local limit for guests', () => {
    expect(getWatchlistLimit(false)).toBe(GUEST_WATCHLIST_LIMIT);
    expect(getWatchlistLimit(true)).toBe(AUTHENTICATED_WATCHLIST_LIMIT);
    expect(getWatchlistLimit(true, true)).toBe(ADMIN_WATCHLIST_LIMIT);
    expect(getWatchlistLimit(true, true, 750)).toBe(750);
    expect(GUEST_WATCHLIST_LIMIT).toBeLessThan(AUTHENTICATED_WATCHLIST_LIMIT);
  });

  it('accepts signed-in watchlists at or below the cap', () => {
    expect(canPersistAuthenticatedWatchlist(AUTHENTICATED_WATCHLIST_LIMIT, 0)).toBe(true);
  });

  it('rejects a new signed-in watchlist above the cap', () => {
    expect(canPersistAuthenticatedWatchlist(AUTHENTICATED_WATCHLIST_LIMIT + 1, 0)).toBe(false);
  });

  it('allows admins to grow their watchlist up to the admin cap', () => {
    expect(canPersistAuthenticatedWatchlist(177, 176, ADMIN_WATCHLIST_LIMIT)).toBe(true);
    expect(canPersistAuthenticatedWatchlist(ADMIN_WATCHLIST_LIMIT + 1, 0, ADMIN_WATCHLIST_LIMIT)).toBe(false);
  });

  it('does not force a grandfathered watchlist to be deleted or truncated', () => {
    expect(canPersistAuthenticatedWatchlist(25, 25)).toBe(true);
    expect(canPersistAuthenticatedWatchlist(24, 25)).toBe(true);
    expect(canPersistAuthenticatedWatchlist(26, 25)).toBe(false);
  });
});
