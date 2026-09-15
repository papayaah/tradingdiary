/**
 * Increment when the scalar shape or aggregation semantics of persisted day
 * summaries change. A mismatch forces a clean rebuild from executions.
 */
export const DAY_SUMMARY_SCHEMA_VERSION = 1;

type SummaryMetaWriter = {
  delete(accountId: string): Promise<void>;
};

/**
 * Mark derived summaries invalid inside the caller's existing source-data
 * transaction. Keeping this delete atomic with the execution/account write is
 * what makes the materialized view safe across crashes and unopened routes.
 */
export async function invalidateDaySummaryAccounts(
  store: SummaryMetaWriter,
  accountIds: Iterable<string>,
): Promise<void> {
  const uniqueIds = new Set(accountIds);
  await Promise.all([...uniqueIds].map((accountId) => store.delete(accountId)));
}
