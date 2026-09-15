'use client';

import { getDB } from '@/lib/db/database';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { DAY_SUMMARY_SCHEMA_VERSION } from '@/lib/db/day-summary-state';
import { aggregateByDay, type AggregatedTrade, type DailySummary } from '@/lib/trading/aggregator';
import type { StoredDaySummary, TransactionRecord } from '@/lib/db/schema';

/**
 * Materialized read model for day summaries. Aggregating an account's whole
 * history (FX backfill + cross-day FIFO) is the expensive part of loading the
 * dashboard and journal; we rebuild it after source data becomes dirty and
 * persist the compact result (no raw transactions) so later loads just read rows.
 *
 * Expand-time consumers (trade detail, replay, chart, AI review) hydrate the raw
 * executions on demand via loadTransactionsByIds using each trade's
 * `transactionIds`.
 */

/** Drop raw transactions from a trade, keeping the compact read-model fields. */
function toLiteTrade(trade: AggregatedTrade): AggregatedTrade {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { transactions, ...lite } = trade;
  return lite;
}

function toStored(accountId: string, summaries: DailySummary[]): StoredDaySummary[] {
  return summaries.map((day) => ({
    ...day,
    accountId,
    trades: day.trades.map(toLiteTrade),
  }));
}

function fromStored(rows: StoredDaySummary[]): DailySummary[] {
  return rows
    .map((row) => {
      const { accountId, ...summary } = row;
      void accountId;
      return summary;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Rebuild an account's summaries from its executions and persist the compact
 * model. Returns that same compact shape so all callers consistently hydrate
 * fills only at the point where they are needed.
 */
export async function rebuildDaySummaries(accountId: string): Promise<DailySummary[]> {
  // Complete any historical FX enrichment first. It may update executions and
  // invalidate the marker, so the authoritative snapshot is read again below.
  await getTransactionsByAccount(accountId);

  const db = await getDB();
  // Reading source executions and replacing the derived model in one transaction
  // prevents a concurrent import/sync from slipping between snapshot and persist.
  const tx = db.transaction(
    ['transactions', 'daySummaries', 'daySummaryMeta'],
    'readwrite',
  );
  const transactions = await tx
    .objectStore('transactions')
    .index('by-accountId')
    .getAll(accountId);
  const summaries = transactions.length > 0 ? aggregateByDay(transactions) : [];
  const storedRows = toStored(accountId, summaries);

  const summaryStore = tx.objectStore('daySummaries');
  const keys = await summaryStore.index('by-accountId').getAllKeys(accountId);
  await Promise.all([
    ...keys.map((key) => summaryStore.delete(key)),
    ...storedRows.map((row) => summaryStore.put(row)),
  ]);
  await tx.objectStore('daySummaryMeta').put({
    accountId,
    schemaVersion: DAY_SUMMARY_SCHEMA_VERSION,
    builtAt: Date.now(),
  });
  await tx.done;

  // Keep the in-memory contract compact too. A rebuild should not make every
  // trade carry fills for the rest of the session.
  return fromStored(storedRows);
}

/**
 * Read the persisted compact summaries for an account (newest first), or null
 * when nothing is stored yet (never built, or invalidated) — the caller should
 * then rebuild.
 */
export async function readStoredDaySummaries(accountId: string): Promise<DailySummary[] | null> {
  const db = await getDB();
  const tx = db.transaction(['daySummaries', 'daySummaryMeta'], 'readonly');
  const [meta, rows] = await Promise.all([
    tx.objectStore('daySummaryMeta').get(accountId),
    tx.objectStore('daySummaries').index('by-accountId').getAll(accountId),
  ]);
  await tx.done;
  if (!meta || meta.schemaVersion !== DAY_SUMMARY_SCHEMA_VERSION) return null;
  // A valid marker plus zero rows is a genuinely empty account, not a cache miss.
  return fromStored(rows);
}

/** Drop an account's persisted summaries (or all accounts') so the next read rebuilds. */
export async function clearStoredDaySummaries(accountId?: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['daySummaries', 'daySummaryMeta'], 'readwrite');
  const store = tx.objectStore('daySummaries');
  if (accountId) {
    const keys = await store.index('by-accountId').getAllKeys(accountId);
    await Promise.all(keys.map((key) => store.delete(key)));
    await tx.objectStore('daySummaryMeta').delete(accountId);
  } else {
    await Promise.all([
      store.clear(),
      tx.objectStore('daySummaryMeta').clear(),
    ]);
  }
  await tx.done;
}

/** Load raw executions by their ids (keyed gets) — the lazy hydration primitive. */
export async function loadTransactionsByIds(ids: string[]): Promise<TransactionRecord[]> {
  if (ids.length === 0) return [];
  const db = await getDB();
  const tx = db.transaction('transactions', 'readonly');
  const store = tx.objectStore('transactions');
  const records = await Promise.all(ids.map((id) => store.get(id)));
  await tx.done;
  return records.filter((record): record is TransactionRecord => record != null);
}

/** Raw executions for one compact trade (returns already-attached fills if present). */
export async function hydrateTradeTransactions(trade: AggregatedTrade): Promise<TransactionRecord[]> {
  if (trade.transactions && trade.transactions.length > 0) return trade.transactions;
  return loadTransactionsByIds(trade.transactionIds ?? []);
}

/** Raw executions for a whole day across all its trades (for replay timelines). */
export async function hydrateDayTransactions(summary: DailySummary): Promise<TransactionRecord[]> {
  const ids = summary.trades.flatMap(
    (trade) => trade.transactionIds ?? trade.transactions?.map((t) => t.tradeId) ?? [],
  );
  return loadTransactionsByIds([...new Set(ids)]);
}
