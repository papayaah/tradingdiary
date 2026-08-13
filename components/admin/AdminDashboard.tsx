'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  PieChart as PieIcon,
  BarChart3,
  Radio,
  Play,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { DueCountdown } from './DueCountdown';
import { parseServerTimestampMs } from '@/lib/utils/serverTime';

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
  concurrency?: {
    workerConcurrency: number;
    rateMax: number;
    rateDurationMs: number;
  };
  activeJobs?: Array<{
    id: string;
    watchId: string;
    symbol?: string;
    interval?: string;
    assetClass?: string;
    mode?: string;
    processedOn?: number;
  }>;
  upcomingScans?: Array<{
    id: string;
    symbol: string;
    interval: string;
    assetClass: string;
    nextScanAt: string;
    scanFrequencySeconds: number;
  }>;
  recentScans?: Array<{
    watchId: string;
    symbol: string;
    interval: string;
    assetClass: string;
    status: string;
    lastPrice: number | null;
    lastProvider: string | null;
    lastError: string | null;
    lastScannedAt: string | null;
  }>;
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

interface ProviderSummaryMap {
  [scope: string]: {
    todayCount: number;
    projectedDaily: number;
    dailyCap: number;
    hourlyCap: number;
    utilizationPct: number;
  };
}

interface UserTrendItem {
  day: string;
  count: number;
}

interface AlertAnalyticsData {
  trend: Array<{ day: string; count: number }>;
  byDirection: Array<{ direction: string; count: number }>;
  byPattern: Array<{ patternId: string; count: number }>;
  topSymbols: Array<{ symbol: string; count: number }>;
}

interface LivePresenceData {
  activeConnections: number;
  distinctUsers: number;
}

interface AIUsageData {
  days: number;
  summary: {
    requests: number;
    credits: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    uniqueUsers: number;
    uniqueGuests: number;
    failedRequests: number;
  };
  byAction: Array<{
    action: string;
    requests: number;
    credits: number;
    tokens: number;
    costUsd: number;
  }>;
  trend: Array<{ day: string; requests: number; credits: number; costUsd: number }>;
}

export default function AdminDashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [queueInfo, setQueueInfo] = useState<QueueData | null>(null);
  const [watchMetrics, setWatchMetrics] = useState<WatchData | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheData | null>(null);
  const [governorItems, setGovernorItems] = useState<GovernorItem[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderSummaryMap>({});
  const [userTrends, setUserTrends] = useState<UserTrendItem[]>([]);
  const [alertAnalytics, setAlertAnalytics] = useState<AlertAnalyticsData | null>(null);
  const [livePresence, setLivePresence] = useState<LivePresenceData | null>(null);
  const [aiUsage, setAIUsage] = useState<AIUsageData | null>(null);
  const [allowlistConfigured, setAllowlistConfigured] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [controlActionMsg, setControlActionMsg] = useState<string | null>(null);
  const queueRefreshInFlight = useRef(false);

  const fetchLiveQueue = useCallback(async () => {
    if (queueRefreshInFlight.current || document.hidden) return;
    queueRefreshInFlight.current = true;
    try {
      const response = await fetch('/api/admin/queues');
      const data = await response.json().catch(() => null);
      if (data?.success) setQueueInfo(data);
    } finally {
      queueRefreshInFlight.current = false;
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [
        statusRes,
        overviewRes,
        queueRes,
        watchesRes,
        providerRes,
        cacheRes,
        governorRes,
        usersRes,
        alertsRes,
        liveRes,
        aiUsageRes,
      ] = await Promise.all([
        fetch('/api/admin/status').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/overview').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/queues').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/watches').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/provider-stats?days=30').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/cache').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/governor').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/users?days=30').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/alerts?days=30').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/live').then((r) => r.json()).catch(() => null),
        fetch('/api/admin/ai-usage?days=30').then((r) => r.json()).catch(() => null),
      ]);

      if (statusRes) setAllowlistConfigured(Boolean(statusRes.allowlistConfigured));
      if (overviewRes?.success) setOverview(overviewRes);
      if (queueRes?.success) setQueueInfo(queueRes);
      if (watchesRes?.success) setWatchMetrics(watchesRes);
      if (providerRes?.stats) {
        if (providerRes.summary) setProviderSummary(providerRes.summary);
      }
      if (cacheRes?.success && cacheRes.cache) setCacheMetrics(cacheRes.cache);
      if (governorRes?.success && governorRes.governor) setGovernorItems(governorRes.governor);
      if (usersRes?.success && usersRes.signups) setUserTrends(usersRes.signups);
      if (alertsRes?.success) setAlertAnalytics(alertsRes);
      if (liveRes?.success) setLivePresence(liveRes);
      if (aiUsageRes?.success) setAIUsage(aiUsageRes);

      setLastUpdated(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();

    const interval = setInterval(() => {
      if (!document.hidden) {
        fetchAllData();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchAllData]);

  useEffect(() => {
    // Queue state changes much faster than the analytics panels. Keep this
    // authoritative list close to the scanner's 5s scheduler tick without
    // reloading every admin metric on the same cadence.
    const interval = window.setInterval(fetchLiveQueue, 2_000);
    return () => window.clearInterval(interval);
  }, [fetchLiveQueue]);

  const handleExportDiagnostics = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      overview,
      queueInfo,
      watchMetrics,
      cacheMetrics,
      governorItems,
      providerSummary,
      livePresence,
      alertAnalyticsSummary: alertAnalytics?.topSymbols,
      aiUsage,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tradingdiary-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTriggerGlobalScan = async () => {
    setControlActionMsg('Triggering global scan...');
    try {
      const res = await fetch('/api/admin/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger-scan-all' }),
      });
      const data = await res.json();
      if (data.success) {
        setControlActionMsg(data.message);
        fetchAllData();
      } else {
        setControlActionMsg(data.error || 'Failed');
      }
    } catch {
      setControlActionMsg('Failed to trigger scan');
    }
    setTimeout(() => setControlActionMsg(null), 4000);
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
          <h1 className="text-2xl font-bold text-foreground hidden sm:flex items-center gap-2">
            <Cpu className="text-accent" size={24} />
            Admin Observability Dashboard
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time monitoring of scanner workload, governor cadence, cache efficiency, trends, and live presence.
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Tile 1: Users */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Total Users</span>
              <Users size={16} className="text-accent" />
            </div>
            <div className="text-2xl font-bold text-foreground">{overview.users.total}</div>
            <div className="text-[11px] text-muted mt-2 flex items-center gap-1.5">
              <span>24h: <strong className="text-foreground">{overview.users.active24h}</strong></span>
              <span>•</span>
              <span>7d: <strong className="text-foreground">{overview.users.active7d}</strong></span>
            </div>
          </div>

          {/* Tile 2: Live SSE Presence (Phase 4) */}
          <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between text-muted mb-2">
              <span className="text-xs font-medium">Live SSE Presence</span>
              <Radio size={16} className="text-profit animate-pulse" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-profit">{livePresence?.activeConnections ?? 0}</span>
              <span className="text-xs text-muted">browsers open</span>
            </div>
            <div className="text-[11px] text-muted mt-2">
              Distinct users online: <strong className="text-foreground">{livePresence?.distinctUsers ?? 0}</strong>
            </div>
          </div>

          {/* Tile 3: Total & Unique Watches */}
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

          {/* Tile 4: Headline Metric - Sharing Ratio */}
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

          {/* Tile 5: Upstream Requests & Alerts Today */}
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

      {aiUsage && (
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex flex-col gap-1 border-b border-card-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Cpu size={16} className="text-accent" /> Hosted AI usage
              </h2>
              <p className="mt-0.5 text-xs text-muted">Global server-funded usage and estimated Gemini cost over the last {aiUsage.days} days.</p>
            </div>
            <span className="text-xs font-semibold text-muted">
              {aiUsage.summary.uniqueUsers} users · {aiUsage.summary.uniqueGuests} guests
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Successful requests', aiUsage.summary.requests.toLocaleString()],
              ['Credits charged', aiUsage.summary.credits.toLocaleString()],
              ['Total tokens', aiUsage.summary.totalTokens.toLocaleString()],
              ['Estimated cost', `$${aiUsage.summary.costUsd.toFixed(4)}`],
              ['Failed / refunded', aiUsage.summary.failedRequests.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-card-border bg-muted-bg p-3">
                <div className="text-[11px] text-muted">{label}</div>
                <div className="mt-1 text-lg font-bold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-card-border text-muted">
                  <th className="px-2 py-2">AI action</th>
                  <th className="px-2 py-2 text-right">Requests</th>
                  <th className="px-2 py-2 text-right">Credits</th>
                  <th className="px-2 py-2 text-right">Tokens</th>
                  <th className="px-2 py-2 text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {aiUsage.byAction.length > 0 ? aiUsage.byAction.map((item) => (
                  <tr key={item.action} className="hover:bg-muted-bg/40">
                    <td className="px-2 py-2 font-mono font-semibold text-foreground">{item.action}</td>
                    <td className="px-2 py-2 text-right text-foreground">{item.requests}</td>
                    <td className="px-2 py-2 text-right text-foreground">{item.credits}</td>
                    <td className="px-2 py-2 text-right text-muted">{item.tokens.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right text-muted">${item.costUsd.toFixed(4)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className="px-2 py-6 text-center text-muted">No hosted AI usage recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Operator Controls Bar (Phase 4) */}
      <div className="bg-card-bg border border-card-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-accent" />
          <div>
            <span className="text-xs font-semibold text-foreground">Operator Controls</span>
            <p className="text-[11px] text-muted">Trigger global scanner passes or manage active scanner jobs.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {controlActionMsg && (
            <span className="text-xs font-medium text-accent animate-pulse">{controlActionMsg}</span>
          )}
          <button
            onClick={handleTriggerGlobalScan}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-accent text-white hover:opacity-90 rounded-lg transition-all shadow-sm"
          >
            <Play size={14} />
            Trigger Global Scan Now
          </button>
        </div>
      </div>

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

      {/* Row 3: Phase 3 Trends — User Signups & Provider Headroom Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Signups Trend Chart */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BarChart3 size={16} className="text-accent" />
              User Registration Trend (30 Days)
            </h2>
          </div>

          {userTrends.length > 0 ? (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={userTrends}>
                  <defs>
                    <linearGradient id="userGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" opacity={0.5} />
                  <XAxis dataKey="day" stroke="var(--muted)" fontSize={10} tickLine={false} />
                  <YAxis stroke="var(--muted)" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--card-bg)',
                      borderColor: 'var(--card-border)',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area type="monotone" dataKey="count" stroke="var(--accent)" fillOpacity={1} fill="url(#userGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-muted italic py-12 text-center">No signup trend data recorded in the last 30 days.</p>
          )}
        </div>

        {/* Provider Headroom Utilization Gauges */}
        <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-card-border pb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Zap size={16} className="text-accent" />
              Provider Daily Cap Utilization & Projections
            </h2>
          </div>

          {Object.keys(providerSummary).length > 0 ? (
            <div className="space-y-3.5 text-xs">
              {Object.entries(providerSummary).map(([scope, data]) => (
                <div key={scope} className="space-y-1.5 bg-muted-bg/40 p-3 rounded-lg border border-card-border/50">
                  <div className="flex justify-between font-mono">
                    <span className="font-semibold text-foreground">{scope}</span>
                    <span className="text-muted">
                      <strong className="text-foreground">{data.todayCount}</strong> / {data.dailyCap.toLocaleString()} reqs ({data.utilizationPct}%)
                    </span>
                  </div>

                  <div className="w-full h-2 bg-muted-bg rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        data.utilizationPct > 80 ? 'bg-loss' : 'bg-accent'
                      }`}
                      style={{ width: `${Math.min(100, data.utilizationPct)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-muted">
                    <span>Est. End-of-Day: <strong className="text-foreground">{data.projectedDaily.toLocaleString()}</strong></span>
                    <span>Hourly Cap: {data.hourlyCap.toLocaleString()}/hr</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted italic py-12 text-center">No provider summary metrics available.</p>
          )}
        </div>
      </div>

      {/* Row 4: Alert Analytics & Pattern Distribution */}
      {alertAnalytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Direction Ratio */}
          <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <PieIcon size={16} className="text-accent" />
                Alert Direction Breakdown
              </h2>
            </div>

            <div className="space-y-3 text-xs">
              {alertAnalytics.byDirection.map((d) => (
                <div key={d.direction} className="flex items-center justify-between p-2.5 bg-muted-bg/50 rounded-lg">
                  <span className={`capitalize font-semibold ${d.direction === 'bullish' ? 'text-profit' : 'text-loss'}`}>
                    ● {d.direction}
                  </span>
                  <span className="font-bold text-foreground">{d.count} alerts</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pattern Breakdown */}
          <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers size={16} className="text-accent" />
                Alerts by Detector Pattern
              </h2>
            </div>

            <div className="space-y-2 text-xs">
              {alertAnalytics.byPattern.map((p) => (
                <div key={p.patternId} className="flex items-center justify-between p-2 bg-muted-bg/50 rounded-lg">
                  <span className="font-mono text-foreground capitalize">{p.patternId}</span>
                  <span className="font-semibold text-foreground">{p.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Alerted Symbols */}
          <div className="bg-card-bg border border-card-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bell size={16} className="text-accent" />
                Top Alerted Symbols (30d)
              </h2>
            </div>

            <div className="space-y-1.5 text-xs">
              {alertAnalytics.topSymbols.slice(0, 5).map((s) => (
                <div key={s.symbol} className="flex items-center justify-between p-2 bg-muted-bg/50 rounded-lg">
                  <span className="font-mono font-semibold text-foreground">{s.symbol}</span>
                  <span className="text-accent font-bold">{s.count} alerts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Row 5: Infrastructure Health (Scanner & Redis Memory) */}
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
            <div className="grid grid-cols-3 gap-3 text-xs">
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

              <div className="bg-muted-bg p-3 rounded-lg border border-card-border">
                <span className="text-muted block mb-1">Parallel Concurrency</span>
                <span className="text-base font-bold text-foreground">
                  {queueInfo.concurrency?.workerConcurrency ?? 4} slots
                  <span className="text-muted text-xs font-normal block text-[11px] font-mono mt-0.5">
                    Rate: max {queueInfo.concurrency?.rateMax ?? 10} req/s
                  </span>
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
                      Beat {new Date(parseServerTimestampMs(w.lastBeatAt)).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted italic">No active scanner worker heartbeats reported.</p>
          )}

          {/* Currently Active Evaluation Jobs */}
          {queueInfo && (
            <div className="space-y-2 pt-2 border-t border-card-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Zap size={14} className={queueInfo.activeJobs && queueInfo.activeJobs.length > 0 ? "text-accent animate-pulse" : "text-muted"} />
                  Currently Evaluating ({queueInfo.activeJobs?.length ?? 0} watch jobs)
                </span>
              </div>
              {queueInfo.activeJobs && queueInfo.activeJobs.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {queueInfo.activeJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between text-xs p-2 bg-muted-bg/70 rounded-lg border border-card-border">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{job.symbol || job.watchId}</span>
                        {job.interval && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent rounded">
                            {job.interval}
                          </span>
                        )}
                        {job.assetClass && (
                          <span className="text-[10px] text-muted uppercase font-mono">
                            {job.assetClass}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted font-mono">
                        {job.mode === 'evaluate' ? 'Cache-only evaluation' : 'Legacy scan'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-2.5 bg-muted-bg/30 border border-card-border/60 rounded-lg flex items-center justify-between text-xs text-muted">
                  <span className="flex items-center gap-2 text-foreground/80">
                    <span className="w-2 h-2 rounded-full bg-profit/80" />
                    Evaluation Queue Idle — No active watch jobs right now
                  </span>
                  <span className="text-[11px]">Ready for next tick</span>
                </div>
              )}
            </div>
          )}

          {/* Upcoming Scheduled Polls */}
          {queueInfo?.upcomingScans && queueInfo.upcomingScans.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-card-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Clock size={14} className="text-accent" />
                  Next Eligible Watch Schedules ({queueInfo.upcomingScans.length} upcoming)
                </span>
                <span className="text-[10px] text-profit flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-profit" />
                  Live · 2s refresh
                </span>
              </div>
              <p className="text-[11px] text-muted">
                Out-of-session equities are omitted. Eligible watches may reuse shared cache instead of calling a provider.
              </p>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1 text-xs">
                {queueInfo.upcomingScans.map((up) => (
                  <div key={up.id} className="flex items-center justify-between p-2 rounded-lg bg-muted-bg/30 border border-card-border/40">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{up.symbol}</span>
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-muted-bg text-muted rounded">
                        {up.interval}
                      </span>
                      <span className="text-[10px] text-muted uppercase font-mono">{up.assetClass}</span>
                    </div>
                    <DueCountdown
                      dueAt={up.nextScanAt}
                      cadenceSeconds={up.scanFrequencySeconds}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Evaluation Feed */}
          {queueInfo?.recentScans && queueInfo.recentScans.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-card-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Activity size={14} className="text-accent" />
                  Recent Watch Evaluations (Last 15 completed)
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1 pr-1 text-xs">
                {queueInfo.recentScans.map((scan, idx) => {
                  const statusColor =
                    scan.status === 'bullish'
                      ? 'text-profit bg-profit/10'
                      : scan.status === 'bearish'
                      ? 'text-loss bg-loss/10'
                      : scan.status === 'error'
                      ? 'text-loss bg-loss/10'
                      : 'text-foreground bg-muted-bg';
                  return (
                    <div key={`${scan.watchId}-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-muted-bg/40 border border-card-border/50">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{scan.symbol}</span>
                        <span className="text-[10px] font-mono text-muted">{scan.interval}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase ${statusColor}`}>
                          {scan.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted">
                        {scan.lastProvider && (
                          <span className="font-mono text-muted">{scan.lastProvider}</span>
                        )}
                        <span>
                          {scan.lastScannedAt ? new Date(parseServerTimestampMs(scan.lastScannedAt)).toLocaleTimeString() : 'Just now'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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

      {/* Row 6: Top Watched Symbols & Sharing Efficiency */}
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
    </div>
  );
}
