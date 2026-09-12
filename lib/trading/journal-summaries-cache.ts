'use client';

import type { DailySummary } from '@/lib/trading/aggregator';
import {
  clearStoredDaySummaries,
  readStoredDaySummaries,
  rebuildDaySummaries,
} from '@/lib/trading/day-summaries-store';
import { onJournalChanged, onJournalSynced } from '@/lib/journal/sync-bus';

/**
 * Process-wide warm cache for the journal's day summaries, backed by the
 * persisted compact read model (see day-summaries-store). On a cold load we read
 * the pre-aggregated rows from IndexedDB — no re-reading every execution, no
 * re-running the FIFO. Only a genuinely missing/invalidated account triggers a
 * full rebuild (which also re-persists). Summaries are compact (no raw
 * transactions); expand-time consumers hydrate fills on demand.
 *
 * Invalidated on any local write or sync merge, with a generation guard so a
 * build in flight during an invalidation isn't cached.
 */

let cachedAccountId: string | null = null;
let cachedSummaries: DailySummary[] | null = null;
let building: { accountId: string; promise: Promise<DailySummary[]> } | null = null;
let generation = 0;
let hooked = false;
// The stale persisted read model is being dropped; the next build must await this
// so it can't read stale rows or have its fresh rebuild wiped by a late clear.
let clearInFlight: Promise<void> | null = null;

function invalidate(): void {
  cachedAccountId = null;
  cachedSummaries = null;
  building = null;
  generation++;
  // The persisted read model is now stale — drop it so the next read rebuilds
  // from executions and re-persists. The bus carries no account id, so clear all.
  clearInFlight = clearStoredDaySummaries().catch(() => {});
}

function hookInvalidation(): void {
  if (hooked) return;
  hooked = true;
  onJournalChanged(invalidate);
  onJournalSynced(invalidate);
}

async function build(accountId: string): Promise<DailySummary[]> {
  // Ensure any in-flight invalidation clear has settled before we read or
  // rebuild, so we never serve stale rows or race the clear against our persist.
  if (clearInFlight) {
    const pending = clearInFlight;
    await pending;
    if (clearInFlight === pending) clearInFlight = null;
  }
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
