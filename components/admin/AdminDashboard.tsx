'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Eye,
  Layers,
  Activity,
  Bell,
  Cpu,
  RefreshCw,
  Download,
  AlertTriangle,
  Server,
  Zap,
  HardDrive,
  TrendingUp,
  Gauge,
  CheckCircle2,
} from 'lucide-react';

interface OverviewData {
  users: {
    total: number;
    active24h: number;
    active7d: number;
    activated: number;
  };
  watches: {
    total: number;
    enabled: number;
    disabled: number;
    uniqueSymbols: number;
    sharingRatio: number;
  };
  activity: {
    upstreamRequestsToday: number;
    alertsToday: number;
  };
  scanner: {
    status: 'healthy' | 'stale' | 'offline';
    workerCount: number;
    lastBeatAt: string | null;
  };
}

interface QueueData {
  redisConnected: boolean;
  redisMemory: {
    usedMemoryHuman: string;
    usedMemoryPeakHuman: string;
    maxmemoryHuman: string;
    utilizationPct: number | null;
  };
  queue: {
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    waiting: number;
  };
  workers: Array<{ workerId: string; lastBeatAt: string }>;
}

interface WatchData {
  assetClasses: Array<{ assetClass: string; watchCount: number; uniqueSymbols: number }>;
  intervals: Array<{ interval: string; count: number }>;
  topSymbols: Array<{
    symbol: string;
    assetClass: string;
    watcherCount: number;
    totalWatches: number;
    overlapMultiplier: number;
  }>;
}

interface CacheData {
  hits: number;
  misses: number;
  waiters: number;
  upstream: number;
  errors: number;
  hitRatePct: number;
  snapshotCount: number;
}

interface GovernorItem {
  providerScope: string;
  cadenceSeconds: number;
  uniqueKeys: number;
  bindingTerm: string;
  predictedReqPerHour: number;
  updatedAt: string | null;
  dailyCap: number;
  floorSeconds: number;
}

interface ProviderStatRow {
  day: string;
  provider: string;
  keyOwner: string;
  count: number;
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [queueInfo, setQueueInfo] = useState<QueueData | null>(null);
  const [watchMetrics, setWatchMetrics] = useState<WatchData | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheData | null>(null);
  const [governorItems, setGovernorItems] = useState<GovernorItem[]>([]);
  const [providerStats, setProviderStats] = useState<ProviderStatRow[]>([]);
  const [allowlistConfigured, setAllowlistConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [statusRes, overviewRes, queueRes, watchesRes, providerRes, cacheRes, governorRes] = await Promise.all([
        fetch('/api/admin/status').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/overview').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/queues').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/watches').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/provider-stats?days=7').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/cache').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/governor').then((r) => r.json()).catch(() => null),
      ]);

      if (statusRes) {
        setAllowlistConfigured(Boolean(statusRes.allowlistConfigured));
      }
      if (overviewRes?.success) {
        setOverview(overviewRes);
      }
      if (queueRes?.success) {
        setQueueInfo(queueRes);
      }
      if (watchesRes?.success) {
        setWatchMetrics(watchesRes);
      }
      if (providerRes?.stats) {
        setProviderStats(providerRes.stats);
      }
      if (cacheRes?.success && cacheRes.cache) {
        setCacheMetrics(cacheRes.cache);
      }
      if (governorRes?.success && governorRes.governor) {
        setGovernorItems(governorRes.governor);
      }
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();

    // Auto refresh every 30 seconds if tab is visible
    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchAllData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchAllData]);

  const handleExportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      overview,
      queueInfo,
      watchMetrics,
      cacheMetrics,
      governorItems,
      providerStatsSummary: providerStats.slice(0, 10),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradingdiary-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-muted">
          <RefreshCw className="animate-spin" size={20} />
          <span>Loading admin observability metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-card-border pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Cpu className="text-accent" size={24} />
            Admin Observability Dashboard
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time monitoring of scanner workload, governor cadence, cache hit efficiency, and provider costs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>

          <button
            onClick={fetchAllData}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-muted-bg text-foreground hover:bg-card-border rounded-lg transition-colors border border-card-border disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExportDiagnostics}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-accent text-white hover:opacity-90 rounded-lg transition-all shadow-sm"
            title="Export diagnostic snapshot JSON"
          >
            <Download size={14} />
            Export JSON
          </button>
        </div>
      </div>

      {/* Security Alert Banner (if allowlist not configured) */}
      {!allowlistConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Development Warning: Admin Allowlist Empty</span>
            No <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">ADMIN_EMAILS</code> or <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">ADMIN_EMAIL</code> env var is configured. Any signed-in user has admin access in non-production environments.
          </div>
        </div>
      )}

      {/* KPI Overview Tiles */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Tile 1: Users */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Total Users</span>
              <Users size={16} className="text-accent" />
            </div>
            <div className="text-2xl font-bold text-foreground">{overview.users.total}</div>
            <div className="text-[11px] text-muted mt-2 flex items-center gap-2">
              <span>24h active: <strong className="text-foreground">{overview.users.active24h}</strong></span>
              <span>•</span>
              <span>7d: <strong className="text-foreground">{overview.users.active7d}</strong></span>
            </div>
          </div>

          {/* Tile 2: Total & Unique Watches */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Unique Symbols</span>
              <Eye size={16} className="text-accent" />
            </div>
            <div className="text-2xl font-bold text-foreground">{overview.watches.uniqueSymbols}</div>
            <div className="text-[11px] text-muted mt-2">
              Total watches: <strong className="text-foreground">{overview.watches.enabled}</strong> enabled ({overview.watches.total} total)
            </div>
          </div>

          {/* Tile 3: Headline Metric - Sharing Ratio */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Cache Sharing Ratio</span>
              <Layers size={16} className="text-profit" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-profit">{overview.watches.sharingRatio}x</span>
              <span className="text-xs text-muted">watches / symbol</span>
            </div>
            <div className="text-[11px] text-muted mt-2">
              Higher ratio = greater candle fetch cache savings
            </div>
          </div>

          {/* Tile 4: Upstream Requests & Alerts Today */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Activity Today</span>
              <Activity size={16} className="text-accent" />
            </div>
            <div className="text-2xl font-bold text-foreground">{overview.activity.upstreamRequestsToday}</div>
            <div className="text-[11px] text-muted mt-2 flex items-center justify-between">
              <span>Upstream requests</span>
              <span className="flex items-center gap-1 text-accent font-semibold">
                <Bell size={12} /> {overview.activity.alertsToday} alerts
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Phase 2 Metrics — Governor Cadence & Shared-Cache Efficiency */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel A: Cache Efficiency */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CheckCircle2 size={16} className="text-profit" />
              Shared-Cache Performance
            </h2>
            {cacheMetrics && (
              <span className="text-xs font-semibold text-profit">
                {cacheMetrics.hitRatePct}% Hit Rate
              </span>
            )}
          </div>

          {cacheMetrics ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">Cache Hits</span>
                  <span className="text-base font-bold text-profit">{cacheMetrics.hits}</span>
                </div>

                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">Single-Flight Waiters</span>
                  <span className="text-base font-bold text-accent">{cacheMetrics.waiters}</span>
                </div>

                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">Active Snapshots</span>
                  <span className="text-base font-bold text-foreground">{cacheMetrics.snapshotCount}</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-muted mb-1">
                  <span>Cache Efficiency Ratio</span>
                  <span className="font-semibold text-foreground">{cacheMetrics.hitRatePct}%</span>
                </div>
                <div className="w-full h-2 bg-muted-bg rounded-full overflow-hidden">
                  <div
                    className="h-full bg-profit transition-all duration-300"
                    style={{ width: `${cacheMetrics.hitRatePct}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-muted text-[11px] pt-1">
                <span>Upstream Fetches: <strong className="text-foreground">{cacheMetrics.upstream}</strong></span>
                <span>Errors: <strong className="text-loss">{cacheMetrics.errors}</strong></span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted italic">Waiting for cache emission counters...</p>
          )}
        </div>

        {/* Panel B: Governor Cadence */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Gauge size={16} className="text-accent" />
              Adaptive Governor Cadence
            </h2>
          </div>

          {governorItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-card-border text-muted font-medium">
                    <th className="py-2 px-2">Provider Scope</th>
                    <th className="py-2 px-2">Keys (N)</th>
                    <th className="py-2 px-2">Cadence</th>
                    <th className="py-2 px-2">Constraint</th>
                    <th className="py-2 px-2 text-right">Predicted Req/hr</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border/50">
                  {governorItems.map((gov) => (
                    <tr key={gov.providerScope} className="hover:bg-muted-bg/40">
                      <td className="py-2 px-2 font-mono text-foreground">{gov.providerScope}</td>
                      <td className="py-2 px-2 text-foreground font-medium">{gov.uniqueKeys}</td>
                      <td className="py-2 px-2 text-accent font-semibold">{gov.cadenceSeconds}s</td>
                      <td className="py-2 px-2 capitalize text-muted">{gov.bindingTerm}</td>
                      <td className="py-2 px-2 text-right font-semibold text-foreground">{gov.predictedReqPerHour}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted italic">No active governor scopes reported.</p>
          )}
        </div>
      </div>

      {/* Row 3: Infrastructure Health (Scanner & Redis Memory) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Scanner Status & Queue Depth */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Server size={16} className="text-accent" />
              Scanner & Worker Health
            </h2>
            {overview && (
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  overview.scanner.status === 'healthy'
                    ? 'bg-profit/10 text-profit'
                    : overview.scanner.status === 'stale'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-loss/10 text-loss'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {overview.scanner.status.toUpperCase()}
              </span>
            )}
          </div>

          {queueInfo && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                <span className="text-muted block mb-1">Worker Instances</span>
                <span className="text-base font-bold text-foreground">{queueInfo.workers.length}</span>
              </div>

              <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                <span className="text-muted block mb-1">Queue Active / Waiting</span>
                <span className="text-base font-bold text-foreground">
                  {queueInfo.queue.active} active <span className="text-muted text-xs font-normal">({queueInfo.queue.waiting} waiting)</span>
                </span>
              </div>
            </div>
          )}

          {queueInfo?.workers && queueInfo.workers.length > 0 ? (
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted">Active Scanner Workers</span>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {queueInfo.workers.map((w) => (
                  <div key={w.workerId} className="flex items-center justify-between text-xs p-2 bg-muted-bg/50 rounded-lg">
                    <span className="font-mono text-foreground">{w.workerId}</span>
                    <span className="text-muted text-[11px]">
                      Beat {new Date(w.lastBeatAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted italic">No active scanner worker heartbeats reported.</p>
          )}
        </div>

        {/* Redis & Memory Footprint */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <HardDrive size={16} className="text-accent" />
              Redis Infrastructure & Memory
            </h2>
            {queueInfo && (
              <span className={`text-xs font-medium ${queueInfo.redisConnected ? 'text-profit' : 'text-loss'}`}>
                {queueInfo.redisConnected ? '● Redis Connected' : '○ Disconnected'}
              </span>
            )}
          </div>

          {queueInfo?.redisMemory && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">RAM Used</span>
                  <span className="text-base font-bold text-foreground">{queueInfo.redisMemory.usedMemoryHuman}</span>
                </div>

                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">Peak Memory</span>
                  <span className="text-base font-bold text-foreground">{queueInfo.redisMemory.usedMemoryPeakHuman}</span>
                </div>

                <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                  <span className="text-muted block mb-1">Max Memory</span>
                  <span className="text-base font-bold text-foreground">{queueInfo.redisMemory.maxmemoryHuman}</span>
                </div>
              </div>

              {queueInfo.redisMemory.utilizationPct !== null ? (
                <div>
                  <div className="flex justify-between text-xs text-muted mb-1">
                    <span>Memory Capacity Utilization</span>
                    <span className="font-semibold text-foreground">{queueInfo.redisMemory.utilizationPct}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        queueInfo.redisMemory.utilizationPct > 80 ? 'bg-loss' : 'bg-accent'
                      }`}
                      style={{ width: `${queueInfo.redisMemory.utilizationPct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-muted italic">
                  Max memory limit is unset (unlimited RAM mode). Monitor RAM footprint closely.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Top Watched Symbols & Sharing Efficiency */}
      {watchMetrics && watchMetrics.topSymbols.length > 0 && (
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp size={16} className="text-profit" />
                Top Watched Symbols & Cache Overlap Multipliers
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Symbols watched by multiple users. Overlap multiplier shows how many watch evaluations are served per single fetch.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted font-medium">
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Asset Class</th>
                  <th className="py-2.5 px-3">Distinct Watchers</th>
                  <th className="py-2.5 px-3">Total Watches</th>
                  <th className="py-2.5 px-3 text-right">Overlap Savings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {watchMetrics.topSymbols.map((item) => (
                  <tr key={item.symbol} className="hover:bg-muted-bg/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-foreground font-mono">{item.symbol}</td>
                    <td className="py-2.5 px-3 text-muted capitalize">{item.assetClass}</td>
                    <td className="py-2.5 px-3 text-foreground">{item.watcherCount} users</td>
                    <td className="py-2.5 px-3 text-muted">{item.totalWatches} watches</td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          item.overlapMultiplier > 1
                            ? 'bg-profit/10 text-profit'
                            : 'bg-muted-bg text-muted'
                        }`}
                      >
                        {item.overlapMultiplier}x
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Row 5: Provider Usage */}
      {providerStats.length > 0 && (
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap size={16} className="text-accent" />
              Recent Upstream Provider Request Volume
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted font-medium">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Provider</th>
                  <th className="py-2.5 px-3">Key Owner</th>
                  <th className="py-2.5 px-3 text-right">Request Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {providerStats.slice(0, 10).map((row, idx) => (
                  <tr key={`${row.day}-${row.provider}-${row.keyOwner}-${idx}`} className="hover:bg-muted-bg/40">
                    <td className="py-2.5 px-3 font-mono text-foreground">{row.day}</td>
                    <td className="py-2.5 px-3 capitalize text-foreground">{row.provider}</td>
                    <td className="py-2.5 px-3 text-muted">{row.keyOwner}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-foreground">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
