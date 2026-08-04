// Physical-request quota gate (Phase 7 of shared-market-data-scanning).
//
// A fast, atomic backstop that counts REAL upstream fetches per provider scope
// in Redis at hourly and daily resolution, and answers "may I make one more
// request?" against the scope's budget. It is deliberately separate from the
// durable Postgres audit (provider_request_stats): that table is the reconciled
// record of truth for admin/reporting; this is the low-latency gate consulted on
// the hot path before every fetch. The governor keeps cadence under the cap in
// normal operation — this gate is the hard ceiling for when cadence estimation
// is wrong (retries, fallback, manual bursts, another process on the same key).
//
// Keys are bucketed by wall-clock hour/day (UTC), so they roll on their own; the
// TTLs only need to outlive their bucket. Counting and checking are split:
// checkQuota() reads and decides before the fetch, recordRequest() increments
// after a fetch actually happens, so denied attempts never inflate the counter.

import type { CacheStore } from './cache-store';
import type { ProviderBudget } from './governor';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export interface QuotaUsage {
  hourly: number;
  daily: number;
}

export interface QuotaDecision {
  allowed: boolean;
  reason?: string; // set when denied: which term bound and by how much
  usage: QuotaUsage;
}

/** UTC hour bucket key, e.g. quota:req:tiingo:server:h:2026080418. */
export function hourKey(scope: string, nowMs: number): string {
  const stamp = new Date(nowMs).toISOString().slice(0, 13).replace(/[-T]/g, '');
  return `quota:req:${scope}:h:${stamp}`;
}

/** UTC day bucket key, e.g. quota:req:tiingo:server:d:20260804. */
export function dayKey(scope: string, nowMs: number): string {
  const stamp = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, '');
  return `quota:req:${scope}:d:${stamp}`;
}

function toCount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Read the current hourly + daily physical-request counts for a scope. */
export async function readUsage(
  store: CacheStore,
  scope: string,
  nowMs: number,
): Promise<QuotaUsage> {
  try {
    const [h, d] = await Promise.all([
      store.get(hourKey(scope, nowMs)),
      store.get(dayKey(scope, nowMs)),
    ]);
    return { hourly: toCount(h), daily: toCount(d) };
  } catch {
    // Redis unavailable: report zero usage. Enforcement decides how to treat a
    // read failure (fail-open here; the caller's config governs fetching).
    return { hourly: 0, daily: 0 };
  }
}

/**
 * Decide whether one more physical request fits under the scope's caps. The gate
 * uses the FULL plan caps (not the governor's headroom-reduced target): headroom
 * is the governor's margin for smooth cadence, whereas this is the real ceiling.
 */
export function checkQuota(usage: QuotaUsage, budget: ProviderBudget): QuotaDecision {
  if (budget.hourlyCap > 0 && usage.hourly >= budget.hourlyCap) {
    return {
      allowed: false,
      reason: `hourly cap reached (${usage.hourly}/${budget.hourlyCap})`,
      usage,
    };
  }
  if (budget.dailyCap > 0 && usage.daily >= budget.dailyCap) {
    return {
      allowed: false,
      reason: `daily cap reached (${usage.daily}/${budget.dailyCap})`,
      usage,
    };
  }
  return { allowed: true, usage };
}

/**
 * Record one physical request against a scope's hourly + daily counters. Call
 * only when a fetch actually happens. TTLs outlive the bucket so a roll never
 * resurrects a stale count; the bucketed key already scopes the number to its
 * window. Best-effort: a counter write failure never breaks the fetch.
 */
export async function recordRequest(store: CacheStore, scope: string, nowMs: number): Promise<void> {
  try {
    await Promise.all([
      store.incr(hourKey(scope, nowMs), 2 * HOUR_MS),
      store.incr(dayKey(scope, nowMs), 2 * DAY_MS),
    ]);
  } catch {
    // Fire-and-forget: the durable Postgres audit still records the request.
  }
}
