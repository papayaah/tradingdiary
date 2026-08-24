import { createHash, randomUUID } from 'node:crypto';
import { scannerConfig } from '@/lib/scanner/env';
import { getSharedCacheStore, type CacheStore } from '@/lib/scanner/shared/cache-store';
import {
  loadAcquisitionSeries,
  type AcquisitionEntry,
} from '@/lib/scanner/shared/acquisition-inventory';
import { getSharedCandleService, type SharedCandleService } from '@/lib/scanner/shared/shared-candle-service';
import { blacklistSymbol, isSymbolBlacklistedSync } from '@/lib/scanner/shared/invalid-symbols';
import type { AssetClass } from '@/lib/scanner/sessions';

const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_RETRY_MS = 10_000;

export function acquisitionSeriesId(series: AcquisitionEntry): string {
  return createHash('sha256')
    .update(`${series.providerScope}\u0000${series.canonicalSymbol}\u0000${series.interval}`)
    .digest('hex')
    .slice(0, 32);
}

function lastKey(series: AcquisitionEntry): string {
  return `market-data:acquisition:last:${acquisitionSeriesId(series)}`;
}

function retryKey(series: AcquisitionEntry): string {
  return `market-data:acquisition:retry:${acquisitionSeriesId(series)}`;
}

function scopeDispatchKey(scope: string): string {
  const id = createHash('sha256').update(scope).digest('hex').slice(0, 20);
  return `market-data:acquisition:dispatch:${id}`;
}

interface AcquisitionSchedulerDeps {
  store?: CacheStore;
  service?: SharedCandleService;
  now?: () => number;
  cadenceForScope?: (scope: string) => number;
  inventoryRefreshMs?: number;
  loadSeries?: (now: Date) => Promise<AcquisitionEntry[]>;
}

/**
 * Provider-owned acquisition loop. It has no knowledge of user intervals,
 * evaluation frequency, or pattern settings. Across scanner instances a short
 * Redis dispatch lease staggers each provider scope; the shared service's lock
 * remains the final single-flight guard for an exact series.
 */
export class AcquisitionScheduler {
  private readonly store: CacheStore;
  private readonly service: SharedCandleService;
  private readonly now: () => number;
  private readonly cadenceForScope: (scope: string) => number;
  private readonly inventoryRefreshMs: number;
  private readonly loadSeries: (now: Date) => Promise<AcquisitionEntry[]>;
  private inventory: AcquisitionEntry[] = [];
  private inventoryLoadedAt = 0;
  private running = false;
  private pausedClasses: Set<AssetClass> = new Set();

  constructor(deps: AcquisitionSchedulerDeps = {}) {
    this.store = deps.store ?? getSharedCacheStore();
    this.service = deps.service ?? getSharedCandleService();
    this.now = deps.now ?? (() => Date.now());
    this.cadenceForScope = deps.cadenceForScope ?? (() => Math.max(1, scannerConfig.acquisitionBucketMs / 1000));
    this.inventoryRefreshMs = deps.inventoryRefreshMs ?? scannerConfig.governorRecomputeMs;
    this.loadSeries = deps.loadSeries ?? ((now) => loadAcquisitionSeries(now));
  }

  /** Force provider-aware inventory to be rebuilt on the next tick. */
  invalidateInventory(): void {
    this.inventory = [];
    this.inventoryLoadedAt = 0;
  }

  /**
   * Asset classes whose acquisition is paused by admin control. Applied as a
   * live filter each tick (no inventory rebuild needed), so acquisition stops
   * and resumes for a class within the control poll interval.
   */
  setPausedClasses(classes: Set<AssetClass>): void {
    this.pausedClasses = new Set(classes);
  }

  private async refreshInventory(): Promise<void> {
    if (this.inventory.length && this.now() - this.inventoryLoadedAt < this.inventoryRefreshMs) return;
    this.inventory = await this.loadSeries(new Date(this.now()));
    this.inventoryLoadedAt = this.now();
  }

  async tick(): Promise<{ acquired: number; scopes: number }> {
    if (this.running) return { acquired: 0, scopes: 0 };
    this.running = true;
    try {
      await this.refreshInventory();
      // Group by cadence scope (provider×class) so each class refreshes at its
      // own governed/overridden cadence and paces itself independently.
      const byScope = new Map<string, AcquisitionEntry[]>();
      for (const series of this.inventory) {
        // Skip acquisition for admin-paused asset classes; the series stays in
        // inventory so it resumes immediately when the class is unpaused.
        if (this.pausedClasses.has(series.assetClass)) continue;
        const rows = byScope.get(series.cadenceScope) ?? [];
        rows.push(series);
        byScope.set(series.cadenceScope, rows);
      }

      let acquired = 0;
      await Promise.all([...byScope].map(async ([scope, series]) => {
        const now = this.now();
        const cadenceMs = Math.max(1000, this.cadenceForScope(scope) * 1000);
        const scored = await Promise.all(series.map(async (entry) => {
          const [lastRaw, retryRaw] = await Promise.all([
            this.store.get(lastKey(entry)),
            this.store.get(retryKey(entry)),
          ]);
          return {
            entry,
            last: Number(lastRaw) || 0,
            retryAt: Number(retryRaw) || 0,
          };
        }));
        const due = scored
          .filter(({ entry, last, retryAt }) => {
            if (isSymbolBlacklistedSync(entry.sourceSymbol) || isSymbolBlacklistedSync(entry.canonicalSymbol)) {
              return false;
            }
            const required = Math.max(cadenceMs, (entry.minimumCadenceSeconds ?? 0) * 1000);
            return retryAt <= now && now - last >= required;
          })
          .sort((a, b) => a.last - b.last || acquisitionSeriesId(a.entry).localeCompare(acquisitionSeriesId(b.entry)));
        const candidate = due[0]?.entry;
        if (!candidate) return;

        const spacingMs = Math.max(
          scannerConfig.acquisitionTickMs,
          Math.floor(cadenceMs / Math.max(1, series.length)),
        );
        const dispatchToken = randomUUID();
        const mayDispatch = await this.store.acquireLock(
          scopeDispatchKey(scope),
          dispatchToken,
          spacingMs,
        );
        if (!mayDispatch) return;

        try {
          await this.service.getCandlesForWatch(
            candidate.sourceSymbol,
            candidate.interval,
            candidate.assetClass,
          );
          await this.store.set(lastKey(candidate), String(this.now()), STATE_TTL_MS);
          acquired += 1;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const is404 = msg.includes('404') || msg.toLowerCase().includes('not found');
          if (is404) {
            void blacklistSymbol(candidate.sourceSymbol, msg, scope);
            void blacklistSymbol(candidate.canonicalSymbol, msg, scope);
          }
          const retryTtlMs = is404 ? 86_400_000 : FAILED_RETRY_MS;
          await this.store.set(retryKey(candidate), String(this.now() + retryTtlMs), retryTtlMs);
          console.error(
            `[scanner] acquisition ${candidate.canonicalSymbol} (${candidate.interval}) failed${is404 ? ' [PERMANENTLY BLACKLISTED IN DB]' : ''}:`,
            msg,
          );
        }
      }));
      return { acquired, scopes: byScope.size };
    } finally {
      this.running = false;
    }
  }
}
