'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  PieChart as PieChartIcon, 
  TrendingUp, 
  TrendingDown, 
  Info, 
  Wallet,
  ArrowUpRight,
  Target
} from 'lucide-react';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { computePortfolio, Holding } from '@/lib/trading/portfolio';
import { formatCurrency } from '@/lib/currency';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function PortfolioPage() {
  const { selectedAccountId, accounts } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === selectedAccountId);
  const currencyRegion = activeAccount?.currency || 'USD';

  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setHoldings([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const transactions = await getTransactionsByAccount(selectedAccountId);
      const computed = computePortfolio(transactions);

      // Fetch market prices for open positions
      if (computed.length > 0) {
        try {
          const symbols = computed.map(h => h.symbol);
          const res = await fetch(`/api/quotes?symbols=${symbols.join(',')}`);
          if (res.ok) {
            const prices = await res.json();
            // prices is Record<string, Record<string, number>>
            // We want the latest price for each symbol
            computed.forEach(h => {
              const symbolPrices = prices[h.symbol];
              if (symbolPrices) {
                const dates = Object.keys(symbolPrices).sort();
                const latestPrice = symbolPrices[dates[dates.length - 1]];
                if (latestPrice) {
                  h.currentPrice = latestPrice;
                  h.marketValue = latestPrice * Math.abs(h.quantity);
                  h.unrealizedPnL = h.marketValue - h.totalCost;
                  h.unrealizedPnLPercent = (h.unrealizedPnL / h.totalCost) * 100;
                }
              }
            });
          }
        } catch (err) {
          console.error("Failed to fetch prices:", err);
        }
      }

      setHoldings(computed);
      setLoading(false);
    }
    load();
  }, [selectedAccountId]);

  const stats = useMemo(() => {
    if (!holdings) return null;
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalMarketValue = holdings.reduce((sum, h) => sum + (h.marketValue || h.totalCost), 0);
    const totalPnL = totalMarketValue - totalCost;
    const pnlPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

    const allocationData = holdings.map(h => ({
      name: h.symbol,
      value: h.marketValue || h.totalCost
    })).sort((a, b) => b.value - a.value);

    return { totalCost, totalMarketValue, totalPnL, pnlPercent, allocationData };
  }, [holdings]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-48 rounded-2xl bg-card-bg border border-card-border animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 rounded-2xl bg-card-bg border border-card-border animate-pulse" />
          <div className="h-96 rounded-2xl bg-card-bg border border-card-border animate-pulse" />
        </div>
      </div>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-muted-bg border border-card-border">
          <PieChartIcon size={40} className="text-muted" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">No open positions</h2>
        <p className="text-sm text-muted max-w-sm">
          Your portfolio is currently empty. Any buys you haven't sold yet will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header & Overall Stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-foreground tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-muted font-medium flex items-center gap-2">
            <Wallet size={14} className="text-accent" />
            Current holdings for account: <span className="text-foreground">{activeAccount?.name || 'Main Account'}</span>
          </p>
        </div>

        <div className="flex gap-4">
          <div className="bg-card-bg/50 backdrop-blur-md border border-card-border p-5 rounded-2xl shadow-sm min-w-[200px]">
             <p className="text-[10px] font-bold text-muted uppercase tracking-widest mb-1">Total Market Value</p>
             <p className="text-2xl font-black text-foreground">
               {formatCurrency(stats?.totalMarketValue || 0, currencyRegion)}
             </p>
             <div className={`flex items-center gap-1 text-[11px] font-bold mt-1 ${stats && stats.totalPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
               {stats && stats.totalPnL >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
               {formatCurrency(stats?.totalPnL || 0, currencyRegion)} ({stats?.pnlPercent.toFixed(2)}%)
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Table */}
        <div className="lg:col-span-2 bg-card-bg border border-card-border rounded-2xl overflow-hidden shadow-sm self-start">
          <div className="px-6 py-4 border-b border-card-border flex items-center justify-between">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Target size={16} className="text-accent" />
              Active Inventory
            </h3>
            <span className="text-xs text-muted font-medium">{holdings.length} assets held</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-table-header-bg text-muted text-[10px] uppercase font-bold tracking-tighter">
                  <th className="text-left px-6 py-4">Symbol</th>
                  <th className="text-right px-6 py-4">Quantity</th>
                  <th className="text-right px-6 py-4">Avg Cost</th>
                  <th className="text-right px-6 py-4">Market Price</th>
                  <th className="text-right px-6 py-4">Market Value</th>
                  <th className="text-right px-6 py-4">Unrealized P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {holdings.map((h) => (
                  <tr key={h.symbol} className="hover:bg-table-row-hover transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-black text-foreground text-sm group-hover:text-accent transition-colors">{h.symbol}</span>
                        <span className="text-[11px] text-muted truncate max-w-[120px]">{h.companyName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right font-medium text-foreground">
                      {h.quantity.toLocaleString()}
                    </td>
                    <td className="px-6 py-5 text-right text-muted-foreground">
                      {formatCurrency(h.averageCost, currencyRegion)}
                    </td>
                    <td className="px-6 py-5 text-right font-bold text-foreground">
                      {h.currentPrice ? formatCurrency(h.currentPrice, currencyRegion) : '---'}
                    </td>
                    <td className="px-6 py-5 text-right font-black text-foreground">
                      {h.marketValue ? formatCurrency(h.marketValue, currencyRegion) : formatCurrency(h.totalCost, currencyRegion)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      {h.unrealizedPnL !== undefined ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-black ${h.unrealizedPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
                            {h.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(h.unrealizedPnL, currencyRegion)}
                          </span>
                          <span className={`text-[10px] font-bold ${h.unrealizedPnL >= 0 ? 'text-profit/70' : 'text-loss/70'}`}>
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
        </div>

        {/* Side panels */}
        <div className="space-y-6">
          {/* Allocation Donut */}
          <div className="bg-card-bg border border-card-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              <ArrowUpRight size={16} className="text-accent" />
              Allocation
            </h3>
            <div className="h-[220px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={stats?.allocationData}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={90}
                     paddingAngle={5}
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
                       borderRadius: '12px',
                       fontSize: '12px'
                     }}
                   />
                 </PieChart>
               </ResponsiveContainer>
            </div>
            <div className="mt-6 space-y-3">
              {stats?.allocationData.slice(0, 5).map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="font-bold text-foreground">{entry.name}</span>
                  </div>
                  <span className="text-muted-foreground font-medium">
                    {((entry.value / (stats.totalMarketValue || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Tip */}
          <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-accent/10 rounded-xl text-accent">
                <Info size={20} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-foreground mb-1">Portfolio Tracking</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Positions are calculated using FIFO (First-In-First-Out). We automatically group multiple buys of the same stock into a single average cost.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
