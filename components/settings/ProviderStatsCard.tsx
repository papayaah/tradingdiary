'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Database, RefreshCw } from 'lucide-react';

interface UsageRow {
  day: string;
  provider: string;
  keyOwner: 'owner' | 'user';
  count: number;
}

interface ProviderAgg {
  provider: string;
  todayOwner: number;
  todayUser: number;
  totalOwner: number;
  totalUser: number;
}

function aggregate(rows: UsageRow[]): { providers: ProviderAgg[]; todayOwner: number; totalOwner: number } {
  const today = new Date().toISOString().slice(0, 10);
  const byProvider = new Map<string, ProviderAgg>();
  let todayOwner = 0;
  let totalOwner = 0;

  for (const r of rows) {
    const agg = byProvider.get(r.provider) ?? {
      provider: r.provider,
      todayOwner: 0,
      todayUser: 0,
      totalOwner: 0,
      totalUser: 0,
    };
    const isToday = r.day === today;
    if (r.keyOwner === 'owner') {
      agg.totalOwner += r.count;
      totalOwner += r.count;
      if (isToday) {
        agg.todayOwner += r.count;
        todayOwner += r.count;
      }
    } else {
      agg.totalUser += r.count;
      if (isToday) agg.todayUser += r.count;
    }
    byProvider.set(r.provider, agg);
  }

  const providers = [...byProvider.values()].sort((a, b) => b.totalOwner + b.totalUser - (a.totalOwner + a.totalUser));
  return { providers, todayOwner, totalOwner };
}

export default function ProviderStatsCard() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/provider-stats?days=30');
      if (res.status === 403) {
        setHidden(true); // not an admin — hide the card entirely
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRows(Array.isArray(data.stats) ? data.stats : []);
      }
    } catch (e) {
      console.error('Failed to fetch provider stats', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Non-admins (403) and the initial pre-load render nothing.
  if (hidden || rows === null) return null;

  const { providers, todayOwner, totalOwner } = aggregate(rows);

  return (
    <div className="p-6 rounded-2xl border border-card-border bg-card-bg shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400">
            <Database size={22} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Market-Data Provider Requests</h2>
            <p className="text-xs text-muted">
              Server-side outbound requests per provider (admin only). “Your key” requests count against
              your quota/cost; “user key” requests use a viewer’s own key.
            </p>
          </div>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted-bg hover:bg-card-border transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Your-key requests today</div>
          <div className="text-lg font-bold text-sky-400">{todayOwner.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-xl bg-muted-bg/30 border border-card-border text-center">
          <div className="text-xs text-muted mb-1">Your-key requests (30 days)</div>
          <div className="text-lg font-bold text-sky-400">{totalOwner.toLocaleString()}</div>
        </div>
      </div>

      {providers.length === 0 ? (
        <div className="p-3 rounded-lg bg-muted-bg/50 border border-card-border text-xs text-muted text-center">
          No provider requests recorded yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-card-border">
                <th className="py-2 pr-3 font-medium">Provider</th>
                <th className="py-2 px-3 font-medium text-right">Today (your&nbsp;/&nbsp;user)</th>
                <th className="py-2 pl-3 font-medium text-right">30&nbsp;days (your&nbsp;/&nbsp;user)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/40">
              {providers.map((p) => (
                <tr key={p.provider}>
                  <td className="py-2 pr-3 font-medium text-foreground">{p.provider}</td>
                  <td className="py-2 px-3 text-right font-mono">
                    <span className="text-sky-400 font-semibold">{p.todayOwner.toLocaleString()}</span>
                    <span className="text-muted"> / {p.todayUser.toLocaleString()}</span>
                  </td>
                  <td className="py-2 pl-3 text-right font-mono">
                    <span className="text-sky-400 font-semibold">{p.totalOwner.toLocaleString()}</span>
                    <span className="text-muted"> / {p.totalUser.toLocaleString()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
