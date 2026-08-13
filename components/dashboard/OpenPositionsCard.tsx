'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PieChart as PieChartIcon,
  TrendingUp,
  TrendingDown,
  Plus,
  Target,
  ChevronDown,
  ChevronUp,
  ArrowUpRight
} from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { computePortfolio, Holding } from '@/lib/trading/portfolio';
import { formatCurrency } from '@/lib/currency';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { ManualTradePanel } from '@/components/trades/manual-entry/ManualTradePanel';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

interface OpenPositionsCardProps {
  onTradeAdded?: () => void;
}

export default function OpenPositionsCard({ onTradeAdded }: OpenPositionsCardProps) {
  const { selectedAccountId, accounts } = useAccount();
  const activeAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const currencyRegion = activeAccount?.currency || 'USD';

  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    let isSubscribed = true;
    async function load() {
      if (!selectedAccountId) {
        if (isSubscribed) {
          setHoldings([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const transactions = await getTransactionsByAccount(selectedAccountId);
      const computed = computePortfolio(transactions);

      // Fetch live market quotes for open holdings
      if (computed.length > 0) {
        try {
          const symbols = computed.map((h) => h.symbol);
          const res = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
          if (res.ok) {
            const prices = await res.json();
            computed.forEach((h) => {
              const latestPrice = prices[h.symbol];
              if (typeof latestPrice === 'number') {
                h.currentPrice = latestPrice;
                h.marketValue = latestPrice * Math.abs(h.quantity) * h.multiplier;
                h.unrealizedPnL =
                  h.quantity > 0
                    ? h.marketValue - h.totalCost
                    : h.totalCost - h.marketValue;
                h.unrealizedPnLPercent =
                  h.totalCost > 0 ? (h.unrealizedPnL / h.totalCost) * 100 : 0;
              }
            });
          }
        } catch (err) {
          console.error('Failed to fetch prices:', err);
        }
      }

      if (isSubscribed) {
        setHoldings(computed);
        setLoading(false);
      }
    }
    load();
    return () => {
      isSubscribed = false;
    };
  }, [selectedAccountId, refreshKey]);

  const handleSaved = () => {
    setRefreshKey((k) => k + 1);
    setShowManualEntry(false);
    if (onTradeAdded) onTradeAdded();
  };

  const stats = useMemo(() => {
    if (!holdings) return null;
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalMarketValue = holdings.reduce(
      (sum, h) => sum + (h.marketValue || h.totalCost),
      0
    );
    const totalPnL = totalMarketValue - totalCost;
    const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    const allocationData = holdings
      .map((h) => ({
        name: h.symbol,
        value: h.marketValue || h.totalCost,
      }))
      .sort((a, b) => b.value - a.value);

    return { totalCost, totalMarketValue, totalPnL, pnlPercent, allocationData };
  }, [holdings]);

  if (loading) {
    return (
      <div className="h-32 rounded-2xl bg-card-bg border border-card-border animate-pulse w-full" />
    );
  }

  // Case 1: No open positions
  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-card-bg border border-card-border rounded-2xl p-5 shadow-sm transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-muted-bg text-muted border border-card-border">
              <PieChartIcon size={20} />
            </div>
            <div>
              <h3 className="font-normal text-foreground text-base">Open Positions</h3>
              <p className="text-xs text-muted font-normal">You currently have 0 active open holdings.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowManualEntry((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-normal text-white transition hover:bg-accent/90 self-start sm:self-auto"
          >
            <Plus size={15} />
            {showManualEntry ? 'Close Form' : 'Add Position'}
          </button>
        </div>

        {showManualEntry && (
          <div className="mt-5 pt-5 border-t border-card-border">
            <ManualTradePanel
              title="Add your first position"
              onSaved={handleSaved}
              onClose={() => setShowManualEntry(false)}
            />
          </div>
        )}
      </div>
    );
  }

  // Case 2: User has open positions
  return (
    <div className="bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm transition-all">
      {/* Header bar */}
      <div className="p-5 border-b border-card-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
            <Target size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground text-base">Open Positions</h3>
              <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-accent/10 text-accent">
                {holdings.length} Active
              </span>
            </div>
            <p className="text-xs text-muted">Active holdings for your current account</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="text-right">
            <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Market Value</p>
            <p className="text-base font-black text-foreground">
              {formatCurrency(stats?.totalMarketValue || 0, currencyRegion)}
            </p>
          </div>
          {stats && (
            <div
              className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                stats.totalPnL >= 0 ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
              }`}
            >
              {stats.totalPnL >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              <span>
                {stats.totalPnL >= 0 ? '+' : ''}
                {formatCurrency(stats.totalPnL, currencyRegion)} ({stats.pnlPercent.toFixed(1)}%)
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowManualEntry((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white transition hover:bg-accent/90"
          >
            <Plus size={14} />
            Add Position
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted-bg transition-colors"
            title={isExpanded ? 'Collapse section' : 'Expand section'}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Manual Entry Collapsible Panel */}
      {showManualEntry && (
        <div className="p-5 bg-muted-bg/30 border-b border-card-border">
          <ManualTradePanel
            title="Add a position"
            onClose={() => setShowManualEntry(false)}
            onSaved={handleSaved}
          />
        </div>
      )}

      {/* Expanded Table & Asset Allocation */}
      {isExpanded && (
        <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Holdings Table */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-card-border text-muted text-[10px] uppercase font-bold tracking-wider">
                  <th className="text-left py-3 px-2">Symbol</th>
                  <th className="text-right py-3 px-2">Quantity</th>
                  <th className="text-right py-3 px-2">Avg Cost</th>
                  <th className="text-right py-3 px-2">Current</th>
                  <th className="text-right py-3 px-2">Market Value</th>
                  <th className="text-right py-3 px-2">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50">
                {holdings.map((h) => (
                  <tr key={h.symbol} className="hover:bg-table-row-hover transition-colors">
                    <td className="py-3 px-2">
                      <div className="flex flex-col">
                        <span className="font-bold text-foreground text-sm">{h.symbol}</span>
                        <span className="text-[11px] text-muted truncate max-w-[100px]">
                          {h.companyName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-right font-medium text-foreground">
                      {h.quantity.toLocaleString()}
                    </td>
                    <td className="py-3 px-2 text-right text-muted">
                      {formatCurrency(h.averageCost, currencyRegion)}
                    </td>
                    <td className="py-3 px-2 text-right font-semibold text-foreground">
                      {h.currentPrice ? formatCurrency(h.currentPrice, currencyRegion) : '---'}
                    </td>
                    <td className="py-3 px-2 text-right font-bold text-foreground">
                      {h.marketValue
                        ? formatCurrency(h.marketValue, currencyRegion)
                        : formatCurrency(h.totalCost, currencyRegion)}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {h.unrealizedPnL !== undefined ? (
                        <div className="flex flex-col items-end">
                          <span
                            className={`font-bold ${
                              h.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'
                            }`}
                          >
                            {h.unrealizedPnL >= 0 ? '+' : ''}
                            {formatCurrency(h.unrealizedPnL, currencyRegion)}
                          </span>
                          <span
                            className={`text-[10px] font-medium ${
                              h.unrealizedPnL >= 0 ? 'text-profit/70' : 'text-loss/70'
                            }`}
                          >
                            {h.unrealizedPnLPercent?.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">---</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Asset Allocation Donut Mini-Card */}
          <div className="bg-muted-bg/30 border border-card-border rounded-xl p-4 flex flex-col justify-between">
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted mb-2 flex items-center gap-1.5">
                <ArrowUpRight size={14} className="text-accent" />
                Allocation Breakdown
              </h4>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.allocationData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {stats?.allocationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--card-bg)',
                        borderColor: 'var(--card-border)',
                        borderRadius: '8px',
                        fontSize: '11px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-1.5 mt-2">
              {stats?.allocationData.slice(0, 4).map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-semibold text-foreground">{entry.name}</span>
                  </div>
                  <span className="text-muted font-medium">
                    {((entry.value / (stats.totalMarketValue || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
