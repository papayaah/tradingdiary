import type { TransactionRecord } from '../db/schema';

/**
 * Deterministic source-identity key for an execution. The tradeId is derived
 * from a broker transaction/trade ID when one exists. Do not include inferred
 * open/close side here: that label can change when a rolling report's oldest
 * position context falls out of range. The unique index is
 * (userId, idempotencyKey), so userId is intentionally excluded here. See
 * docs/specs/journal-persistence-and-sync.md.
 */
export function executionIdempotencyKey(t: TransactionRecord): string {
  return [
    t.accountId,
    t.tradeId,
  ].join('|');
}
