'use client';

import React, { useState, useEffect } from 'react';
import { Server, Cpu, Activity, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface QueueMetrics {
  success: boolean;
  authenticated: boolean;
  user: { id: string; email: string } | null;
  redisConnected: boolean;
  queue: {
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    waiting: number;
  };
  workers: Array<{ workerId: string; lastBeatAt: string }>;
}

export default function BullMQStatusCard() {
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverUrl, setServerUrl] = useState<string>('');

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/queues');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      } else if (res.status === 403) {
        setMetrics((prev) => prev || {
          success: false,
          authenticated: false,
          user: null,
          redisConnected: false,
          queue: { active: 0, completed: 0, failed: 0, delayed: 0, waiting: 0 },
          workers: [],
        });
      }
    } catch {
      // Gracefully handle fetch exceptions
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerUrl(process.env.NEXT_PUBLIC_SERVER_URL || window.location.origin);
    }
  }, []);

  return (
    <div className="p-6 rounded-2xl border border-card-border bg-card-bg shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400">
            <Cpu size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Server Scanner & BullMQ Queue</h2>
            <p className="text-xs text-muted">24/7 Background Market Scanner & Multi-tenant Worker Status</p>
          </div>
        </div>
        <button
          onClick={fetchMetrics}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted-bg hover:bg-card-border transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Target Server URL Indicator */}
      <div className="p-3.5 rounded-xl bg-muted-bg/50 border border-card-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <Server size={16} className="text-indigo-400 shrink-0" />
          <span className="text-muted">Target API Server:</span>
          <code className="text-indigo-300 font-mono bg-card-bg px-2 py-0.5 rounded border border-card-border">
            {serverUrl}
          </code>
        </div>
        <div className="flex items-center gap-2">
          {metrics?.authenticated ? (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 size={14} /> Authenticated User Session
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
              <AlertCircle size={14} /> Guest (Local Fallback Mode)
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Active Jobs</div>
          <div className="text-lg font-bold text-emerald-400">{metrics?.queue?.active ?? 0}</div>
        </div>
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Waiting Jobs</div>
          <div className="text-lg font-bold text-amber-400">{metrics?.queue?.waiting ?? 0}</div>
        </div>
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Delayed Jobs</div>
          <div className="text-lg font-bold text-indigo-400">{metrics?.queue?.delayed ?? 0}</div>
        </div>
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Completed</div>
          <div className="text-lg font-bold text-blue-400">{metrics?.queue?.completed ?? 0}</div>
        </div>
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center col-span-2 sm:col-span-1">
          <div className="text-xs text-muted mb-1">Failed Jobs</div>
          <div className="text-lg font-bold text-rose-400">{metrics?.queue?.failed ?? 0}</div>
        </div>
      </div>

      {/* Worker Heartbeat Status */}
      <div className="space-y-2 pt-2 border-t border-card-border">
        <div className="flex items-center justify-between text-xs text-muted">
          <span className="font-medium flex items-center gap-1.5 text-foreground">
            <Activity size={14} className="text-purple-400" /> Active Worker Daemons:
          </span>
          <span>{metrics?.workers?.length ?? 0} Registered</span>
        </div>
        {metrics?.workers && metrics.workers.length > 0 ? (
          <div className="space-y-1.5">
            {metrics.workers.map((w) => (
              <div
                key={w.workerId}
                className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-mono text-emerald-300 font-medium">{w.workerId}</span>
                </div>
                <span className="text-emerald-400/80">
                  Heartbeat: {new Date(w.lastBeatAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
            <span>No standalone worker container active on this environment.</span>
            <span className="text-[11px] opacity-80">(Dev / Shadow mode available via npm run scanner)</span>
          </div>
        )}
      </div>
    </div>
  );
}
