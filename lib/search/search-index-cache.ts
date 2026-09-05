'use client';

import { getTransactionsByAccountRaw } from '@/lib/db/trades';
import { getAllDailyNotes, getAllTradeNotes } from '@/lib/db/notes';
import { aggregateByDay } from '@/lib/trading/aggregator';
import { onJournalChanged, onJournalSynced } from '@/lib/journal/sync-bus';
import type { SearchIndex } from './types';

/**
 * Process-wide warm cache for the global-search index. Building the index means
 * loading and aggregating the whole account history, which is expensive — so we
 * do it once, keep it warm across palette opens, and rebuild only when the
 * journal actually changes (import, edit, sync merge). A generation counter
 * discards any build that was in flight when an invalidation happened, so the
 * cache never serves stale data.
 */

let cachedAccountId: string | null = null;
let cachedIndex: SearchIndex | null = null;
let building: { accountId: string; promise: Promise<SearchIndex> } | null = null;
let generation = 0;
let invalidationHooked = false;

function invalidate(): void {
  cachedAccountId = null;
  cachedIndex = null;
  building = null;
  generation++;
}

function hookInvalidation(): void {
  if (invalidationHooked) return;
  invalidationHooked = true;
  // Rebuild on any local write and on any sync merge from another device.
  onJournalChanged(invalidate);
  onJournalSynced(invalidate);
}

async function build(accountId: string): Promise<SearchIndex> {
  const [transactions, dailyNotes, tradeNotes] = await Promise.all([
    getTransactionsByAccountRaw(accountId),
    getAllDailyNotes(),
    getAllTradeNotes(),
  ]);
  const trades = aggregateByDay(transactions).flatMap((summary) => summary.trades);
  return {
    trades,
    dailyNotes: dailyNotes.filter((note) => note.accountId === accountId),
    tradeNotes: tradeNotes.filter((note) => note.accountId === accountId),
  };
}

/** Get the account's search index — instantly if warm, otherwise build it once. */
export function getSearchIndex(accountId: string): Promise<SearchIndex> {
  hookInvalidation();

  if (cachedIndex && cachedAccountId === accountId) {
    return Promise.resolve(cachedIndex);
  }
  if (building && building.accountId === accountId) {
    return building.promise;
  }

  const gen = generation;
  const promise = build(accountId)
    .then((index) => {
      // Only cache if no invalidation / account switch happened mid-build.
      if (gen === generation) {
        cachedAccountId = accountId;
        cachedIndex = index;
      }
      if (building?.promise === promise) building = null;
      return index;
    })
    .catch((error) => {
      if (building?.promise === promise) building = null;
      throw error;
    });

  building = { accountId, promise };
  return promise;
}

/** Build the index ahead of time (fire-and-forget) so the first open is instant. */
export function prewarmSearchIndex(accountId: string): void {
  void getSearchIndex(accountId).catch(() => {});
}
