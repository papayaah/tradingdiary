'use client';

import type { DailySummary } from '@/lib/trading/aggregator';
import {
  readStoredDaySummaries,
  rebuildDaySummaries,
} from '@/lib/trading/day-summaries-store';
import {
  onJournalChanged,
  onJournalSynced,
  type JournalChangeDetail,
} from '@/lib/journal/sync-bus';

/**
 * Process-wide warm cache for the journal's day summaries, backed by the
 * persisted compact read model (see day-summaries-store). On a cold load we read
 * the pre-aggregated rows from IndexedDB — no re-reading every execution, no
 * re-running the FIFO. Only a genuinely missing/invalidated account triggers a
 * full rebuild (which also re-persists). Summaries are compact (no raw
 * transactions); expand-time consumers hydrate fills on demand.
 *
 * The memory layer is invalidated only for affected accounts (or after a sync
 * merge), with a generation guard so a build in flight during an invalidation
 * isn't cached. Durable validity lives in IndexedDB, not this event listener.
 */

let cachedAccountId: string | null = null;
let cachedSummaries: DailySummary[] | null = null;
let building: { accountId: string; promise: Promise<DailySummary[]> } | null = null;
let generation = 0;
let hooked = false;

function invalidateAll(): void {
  cachedAccountId = null;
  cachedSummaries = null;
  building = null;
  generation++;
}

function invalidateChangedAccounts(detail: JournalChangeDetail): void {
  if (detail.allSummaries) {
    invalidateAll();
    return;
  }
  const affected = new Set(detail.summaryAccountIds ?? []);
  if (affected.size === 0) return;
  if (
    (cachedAccountId && affected.has(cachedAccountId))
    || (building && affected.has(building.accountId))
  ) {
    invalidateAll();
  }
}

function hookInvalidation(): void {
  if (hooked) return;
  hooked = true;
  onJournalChanged(invalidateChangedAccounts);
  // Pulls can affect several entity types/accounts. Durable metadata decides
  // whether a rebuild is needed; dropping only memory here is cheap and safe.
  onJournalSynced(invalidateAll);
}

async function build(accountId: string): Promise<DailySummary[]> {
  const stored = await readStoredDaySummaries(accountId);
  if (stored) return stored;
  return rebuildDaySummaries(accountId);
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
