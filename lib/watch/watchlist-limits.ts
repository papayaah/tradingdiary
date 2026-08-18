export const GUEST_WATCHLIST_LIMIT = 5;
export const AUTHENTICATED_WATCHLIST_LIMIT = 20;
export const ADMIN_WATCHLIST_LIMIT = 500;

export function getWatchlistLimit(
  authenticated: boolean,
  isAdmin = false,
  adminLimit = ADMIN_WATCHLIST_LIMIT,
): number {
  if (!authenticated) return GUEST_WATCHLIST_LIMIT;
  return isAdmin ? adminLimit : AUTHENTICATED_WATCHLIST_LIMIT;
}

/**
 * Existing lists above the new cap are grandfathered: they can be saved at the
 * same size or reduced, but cannot grow until they are back under the cap.
 */
export function canPersistAuthenticatedWatchlist(
  nextCount: number,
  currentCount: number,
  limit = AUTHENTICATED_WATCHLIST_LIMIT,
): boolean {
  return nextCount <= limit || nextCount <= currentCount;
}
