'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Upload, BookOpen, ArrowLeft } from 'lucide-react';
import { getAllTransactions } from '@/lib/db/trades';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay, applyMarketPrices, type DailySummary } from '@/lib/trading/aggregator';
import DayGroup from '@/components/journal/DayGroup';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';

export default function JournalPage() {
  const searchParams = useSearchParams();
  const filterDate = searchParams.get('date');
  const { selectedAccountId } = useAccount();

  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);

  useEffect(() => {
    async function load() {
      if (!selectedAccountId) {
        setSummaries([]);
        return;
      }

      setSummaries(null); // Show loading state on switch
      const transactions = await getTransactionsByAccount(selectedAccountId);

      if (transactions.length > 0) {
        const agg = aggregateByDay(transactions, getTradeDateCutoff());

        // --- 1. SET INITIAL DATA IMMEDIATELY ---
        setSummaries([...agg]);

        // Fetch historical market prices for open positions
        const openSymbols = new Set<string>();
        let minDate = '';
        let maxDate = '';
        for (const day of agg) {
          for (const trade of day.trades) {
            if (trade.isOpen) {
              openSymbols.add(trade.symbol);
              if (!minDate || day.date < minDate) minDate = day.date;
              if (!maxDate || day.date > maxDate) maxDate = day.date;
            }
          }
        }
        if (openSymbols.size > 0) {
          try {
            const params = new URLSearchParams({
              symbols: [...openSymbols].join(','),
              from: minDate,
              to: maxDate,
            });
            const res = await fetch(`/api/quotes?${params}`);
            if (res.ok) {
              const prices = await res.json();

              // --- 2. UPDATE WITH MARKET PRICES ---
              applyMarketPrices(agg, prices);
              setSummaries([...agg]);
            }
          } catch {
            // Silently fail
          }
        }
      } else {
        setSummaries([]);
      }
    }
    load();
  }, [selectedAccountId]);

  const displaySummaries = useMemo(() => {
    if (!summaries || !filterDate) return summaries;
    return summaries.filter(s => s.date === filterDate);
  }, [summaries, filterDate]);

  if (summaries === null) {
    // ... animation placeholder
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-48 rounded-xl bg-card-bg border border-card-border animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    // ... empty state logic
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-4 text-center p-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted-bg">
          <BookOpen size={32} className="text-muted" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">No trades yet</h2>
        <p className="text-sm text-muted max-w-sm">
          Import your trading data to see your journal. Drop a .tlg file on the Import page to get started.
        </p>
        <Link
          href="/import"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <Upload size={16} />
          Import Trades
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight mb-1">Trading Journal</h1>
          <p className="text-sm text-muted font-medium">Capture your trades, thoughts, and market analysis.</p>
        </div>
      </div>

      {filterDate && (
        <div className="flex items-center justify-between bg-accent/5 backdrop-blur-sm p-5 rounded-2xl border border-accent/20 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-accent/10 rounded-xl text-accent shadow-inner">
              <BookOpen size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Showing {filterDate.substring(0, 4)}-{filterDate.substring(4, 6)}-{filterDate.substring(6, 8)}</h3>
              <p className="text-[10px] font-bold text-muted uppercase tracking-widest mt-0.5">Focusing on {displaySummaries?.length || 0} trading day</p>
            </div>
          </div>
          <Link
            href="/journal"
            className="flex items-center gap-2 text-xs font-bold text-accent hover:text-accent/80 transition-colors bg-accent/10 hover:bg-accent/20 px-4 py-2 rounded-xl border border-accent/10"
          >
            <ArrowLeft size={14} />
            Show All History
          </Link>
        </div>
      )}

      {displaySummaries?.map((summary) => (
        <DayGroup key={summary.date} summary={summary} accountId={selectedAccountId || ''} />
      ))}

      {filterDate && displaySummaries?.length === 0 && (
        <div className="py-20 text-center">
          <p className="text-muted">No trades found for this specific date.</p>
          <Link href="/journal" className="text-accent hover:underline mt-2 inline-block">Back to full journal</Link>
        </div>
      )}
    </div>
  );
}
