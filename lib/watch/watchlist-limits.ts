export const GUEST_WATCHLIST_LIMIT = 5;
export const AUTHENTICATED_WATCHLIST_LIMIT = 20;

export function getWatchlistLimit(authenticated: boolean): number {
  return authenticated ? AUTHENTICATED_WATCHLIST_LIMIT : GUEST_WATCHLIST_LIMIT;
}

/**
 * Existing lists above the new cap are grandfathered: they can be saved at the
 * same size or reduced, but cannot grow until they are back under the cap.
 */
export function canPersistAuthenticatedWatchlist(
  nextCount: number,
  currentCount: number,
): boolean {
  return nextCount <= AUTHENTICATED_WATCHLIST_LIMIT || nextCount <= currentCount;
}
