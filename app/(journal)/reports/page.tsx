'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { getJournalSummaries } from '@/lib/trading/journal-summaries-cache';
import type { DailySummary } from '@/lib/trading/aggregator';
import { resolveDashboardDateRange, type DashboardRangeType } from '@/lib/trading/dashboard-range';
import {
  computeReportMetrics,
  computeBreakdown,
  type ReportTrade,
  type ReportDimension,
  type ReportMetrics,
} from '@/lib/trading/report-metrics';
import { formatCurrency } from '@/lib/currency';
import { pnlColorClass } from '@/lib/utils/format';
import { formatExchangeTime } from '@/lib/trading/exchange-time';

type RangeType = Extract<DashboardRangeType, '7d' | '30d' | 'mtd' | 'ytd'> | 'all';
const RANGES: { value: RangeType; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: 'mtd', label: 'MTD' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
];

const DIMENSIONS: { value: ReportDimension; label: string }[] = [
  { value: 'symbol', label: 'Symbol' },
  { value: 'weekday', label: 'Weekday' },
  { value: 'month', label: 'Month' },
  { value: 'hour', label: 'Entry hour' },
  { value: 'side', label: 'Side' },
  { value: 'outcome', label: 'Outcome' },
];

function toReportTrades(
  summaries: DailySummary[],
  accountId: string,
  accountName: string,
  fallbackCurrency: string,
): ReportTrade[] {
  const trades: ReportTrade[] = [];
  for (const summary of summaries) {
    for (const trade of summary.trades) {
      trades.push({
        key: trade.groupKey ?? `${trade.date}-${trade.symbol}`,
        symbol: trade.symbol,
        side: trade.side,
        tradingDay: trade.date,
        firstTradeTime: trade.firstTradeTime,
        netPnL: trade.netPnL,
        grossPnL: trade.grossPnL,
        totalCommissions: trade.totalCommissions,
        volume: trade.volume,
        isOpen: trade.isOpen,
        holdMinutes: trade.holdMinutes,
        currency: trade.accountCurrency ?? fallbackCurrency,
        accountId,
        accountName,
      });
    }
  }
  return trades;
}

function fmtNumber(value: number, digits = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function ratio(value: number | null): string {
  return value == null ? '∞' : `${value.toFixed(2)}×`;
}

function holdLabel(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ReportsPage() {
  const { accounts, selectedAccountId } = useAccount();
  const activeAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const accountName = activeAccount?.name ?? 'Account';
  const currency = activeAccount?.currency ?? 'USD';

  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [rangeType, setRangeType] = useState<RangeType>('30d');
  const [side, setSide] = useState<'all' | 'LONG' | 'SHORT'>('all');
  const [outcome, setOutcome] = useState<'all' | 'win' | 'loss'>('all');
  const [symbol, setSymbol] = useState('');
  const [dimension, setDimension] = useState<ReportDimension>('symbol');
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedAccountId) return;
    let active = true;
    getJournalSummaries(selectedAccountId)
      .then((rows) => { if (active) { setSummaries(rows); setLoadedFor(selectedAccountId); } })
      .catch(() => { if (active) { setSummaries([]); setLoadedFor(selectedAccountId); } });
    return () => { active = false; };
  }, [selectedAccountId]);

  const ready = summaries !== null && loadedFor === selectedAccountId;
  const allTrades = useMemo(
    () => (ready && summaries ? toReportTrades(summaries, selectedAccountId ?? '', accountName, currency) : []),
    [ready, summaries, selectedAccountId, accountName, currency],
  );

  const range = useMemo(() => {
    if (rangeType === 'all') return { start: '', end: '' };
    const latest = summaries?.[0]?.date;
    return resolveDashboardDateRange(rangeType, latest ?? undefined);
  }, [rangeType, summaries]);

  const filtered = useMemo(() => {
    const sym = symbol.trim().toUpperCase();
    return allTrades.filter((t) => {
      if (range.start && t.tradingDay < range.start) return false;
      if (range.end && t.tradingDay > range.end) return false;
      if (side !== 'all' && t.side !== side) return false;
      if (sym && !t.symbol.toUpperCase().includes(sym)) return false;
      if (outcome === 'win' && !(!t.isOpen && t.netPnL > 0)) return false;
      if (outcome === 'loss' && !(!t.isOpen && t.netPnL < 0)) return false;
      return true;
    });
  }, [allTrades, range, side, symbol, outcome]);

  const metrics = useMemo(() => computeReportMetrics(filtered), [filtered]);
  const breakdown = useMemo(() => computeBreakdown(filtered, dimension), [filtered, dimension]);

  const loading = Boolean(selectedAccountId) && !ready;
  const empty = !loading && allTrades.length === 0;

  const money = (v: number) => `${v >= 0 ? '' : '-'}${formatCurrency(Math.abs(v), currency)}`;

  const tiles: { label: string; value: string; color?: string }[] = [
    { label: 'Net P&L', value: money(metrics.netPnL), color: pnlColorClass(metrics.netPnL) },
    { label: 'Trades', value: fmtNumber(metrics.tradeCount), color: 'text-foreground' },
    { label: 'Win rate', value: `${metrics.winRate.toFixed(1)}%`, color: 'text-accent' },
    { label: 'Profit factor', value: ratio(metrics.profitFactor), color: 'text-foreground' },
    { label: 'Expectancy', value: money(metrics.expectancy), color: pnlColorClass(metrics.expectancy) },
    { label: 'Avg win', value: money(metrics.avgWin), color: 'text-profit' },
    { label: 'Avg loss', value: money(metrics.avgLoss), color: 'text-loss' },
    { label: 'Payoff ratio', value: ratio(metrics.payoffRatio), color: 'text-foreground' },
    { label: 'Max drawdown', value: money(metrics.maxDrawdown), color: 'text-loss' },
    { label: 'Commissions', value: money(-metrics.commissions), color: 'text-muted' },
    { label: 'Max win streak', value: fmtNumber(metrics.maxWinStreak), color: 'text-foreground' },
    { label: 'Avg hold', value: holdLabel(metrics.avgHoldMinutes), color: 'text-foreground' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={20} className="text-accent" />
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">Reports</h1>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-card-border bg-card-bg/50 p-1">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setRangeType(r.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                rangeType === r.value ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Segment label="Side" value={side} onChange={setSide} options={[['all', 'All'], ['LONG', 'Long'], ['SHORT', 'Short']]} />
        <Segment label="Outcome" value={outcome} onChange={setOutcome} options={[['all', 'All'], ['win', 'Wins'], ['loss', 'Losses']]} />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Symbol</span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="All symbols"
            className="w-36 rounded-lg border border-card-border bg-background/60 px-3 py-1.5 text-sm text-foreground outline-none focus:border-accent"
          />
        </label>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-card-border bg-card-bg/40" />
          ))}
        </div>
      )}

      {empty && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-card-border bg-card-bg/40 p-12 text-center">
          <BarChart3 size={28} className="text-muted" />
          <p className="text-sm text-muted">No trades yet. Import or add trades to see reports.</p>
          <Link href="/import" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">Import trades</Link>
        </div>
      )}

      {!loading && !empty && (
        <>
          {/* Metric tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-2xl border border-card-border bg-card-bg/50 p-4">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{tile.label}</p>
                <p className={`text-lg font-normal tabular-nums ${tile.color ?? 'text-foreground'}`}>{tile.value}</p>
              </div>
            ))}
          </div>

          {/* Breakdown */}
          <div className="rounded-2xl border border-card-border bg-card-bg/50 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-card-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Breakdown</h2>
              <div className="flex items-center gap-1 rounded-lg border border-card-border bg-background/40 p-0.5">
                {DIMENSIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => { setDimension(d.value); setOpenRow(null); }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      dimension === d.value ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-card-border/60 text-[10px] uppercase tracking-wider text-muted">
                    <th className="w-6 px-2 py-2.5" />
                    <th className="px-3 py-2.5 text-left font-medium">{DIMENSIONS.find((d) => d.value === dimension)?.label}</th>
                    <th className="px-3 py-2.5 text-right font-medium">Trades</th>
                    <th className="px-3 py-2.5 text-right font-medium">Win %</th>
                    <th className="px-3 py-2.5 text-right font-medium">Net P&amp;L</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Avg</th>
                    <th className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Profit factor</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <BreakdownRow
                      key={row.key}
                      label={row.key}
                      metrics={row.metrics}
                      trades={row.trades}
                      accountId={selectedAccountId ?? ''}
                      isOpen={openRow === row.key}
                      onToggle={() => setOpenRow((prev) => (prev === row.key ? null : row.key))}
                      money={money}
                    />
                  ))}
                  {breakdown.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">No trades match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Segment<T extends string>({ label, value, onChange, options }: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-card-border bg-background/40 p-0.5">
        {options.map(([val, text]) => (
          <button
            key={val}
            onClick={() => onChange(val)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              value === val ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function BreakdownRow({ label, metrics, trades, accountId, isOpen, onToggle, money }: {
  label: string;
  metrics: ReportMetrics;
  trades: ReportTrade[];
  accountId: string;
  isOpen: boolean;
  onToggle: () => void;
  money: (v: number) => string;
}) {
  const sorted = [...trades].sort((a, b) => (a.tradingDay + a.firstTradeTime).localeCompare(b.tradingDay + b.firstTradeTime));
  return (
    <>
      <tr className="cursor-pointer border-b border-card-border/30 hover:bg-muted-bg/30" onClick={onToggle}>
        <td className="px-2 py-2.5 text-center text-muted">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
        <td className="px-3 py-2.5 font-medium text-foreground">{label}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{metrics.tradeCount}</td>
        <td className="px-3 py-2.5 text-right tabular-nums text-muted">{metrics.winRate.toFixed(0)}%</td>
        <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${pnlColorClass(metrics.netPnL)}`}>{money(metrics.netPnL)}</td>
        <td className={`hidden px-3 py-2.5 text-right tabular-nums sm:table-cell ${pnlColorClass(metrics.avgTrade)}`}>{money(metrics.avgTrade)}</td>
        <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted md:table-cell">{metrics.profitFactor == null ? '∞' : `${metrics.profitFactor.toFixed(2)}×`}</td>
      </tr>
      {isOpen && (
        <tr className="bg-muted-bg/20">
          <td />
          <td colSpan={6} className="px-3 py-2">
            <div className="divide-y divide-card-border/30">
              {sorted.map((t) => (
                <Link
                  key={t.key}
                  href={`/journal?account=${encodeURIComponent(accountId)}&date=${t.tradingDay}&symbol=${encodeURIComponent(t.symbol)}`}
                  className="flex items-center justify-between gap-3 py-1.5 text-xs hover:text-accent"
                >
                  <span className="flex items-center gap-2 text-muted">
                    <span className="font-medium text-foreground">{t.symbol}</span>
                    <span className="rounded bg-muted-bg/60 px-1.5 py-0.5 text-[10px] uppercase">{t.side}</span>
                    <span className="font-mono">{formatExchangeTime(t.firstTradeTime, t.tradingDay)}</span>
                  </span>
                  <span className={`tabular-nums font-medium ${pnlColorClass(t.netPnL)}`}>{money(t.netPnL)}</span>
                </Link>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
