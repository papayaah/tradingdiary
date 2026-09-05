'use client';

import { getTransactionsByAccount } from '@/lib/db/trades';
import { aggregateByDay, type DailySummary } from '@/lib/trading/aggregator';
import { onJournalChanged, onJournalSynced } from '@/lib/journal/sync-bus';

/**
 * Process-wide warm cache for the journal's day summaries. Aggregating a whole
 * account's history is the expensive part of loading the journal, so we do it
 * once and reuse it when the page remounts (e.g. navigating in from global
 * search or another route). Invalidated on any local write or sync merge, with a
 * generation guard so a build in flight during an invalidation isn't cached.
 */

let cachedAccountId: string | null = null;
let cachedSummaries: DailySummary[] | null = null;
let building: { accountId: string; promise: Promise<DailySummary[]> } | null = null;
let generation = 0;
let hooked = false;

function invalidate(): void {
  cachedAccountId = null;
  cachedSummaries = null;
  building = null;
  generation++;
}

function hookInvalidation(): void {
  if (hooked) return;
  hooked = true;
  onJournalChanged(invalidate);
  onJournalSynced(invalidate);
}

async function build(accountId: string): Promise<DailySummary[]> {
  const transactions = await getTransactionsByAccount(accountId);
  return transactions.length > 0 ? aggregateByDay(transactions) : [];
}

/** Synchronous cache read — lets the page skip its loading skeleton when warm. */
export function peekJournalSummaries(accountId: string): DailySummary[] | null {
  return cachedSummaries && cachedAccountId === accountId ? cachedSummaries : null;
}

/** Get the account's day summaries — instantly if warm, otherwise build once. */
export function getJournalSummaries(accountId: string): Promise<DailySummary[]> {
  hookInvalidation();

  if (cachedSummaries && cachedAccountId === accountId) {
    return Promise.resolve(cachedSummaries);
  }
  if (building && building.accountId === accountId) {
    return building.promise;
  }

  const gen = generation;
  const promise = build(accountId)
    .then((summaries) => {
      if (gen === generation) {
        cachedAccountId = accountId;
        cachedSummaries = summaries;
      }
      if (building?.promise === promise) building = null;
      return summaries;
    })
    .catch((error) => {
      if (building?.promise === promise) building = null;
      throw error;
    });

  building = { accountId, promise };
  return promise;
}
