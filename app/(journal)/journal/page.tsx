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

        // ... prices logic remains same ...
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
              applyMarketPrices(agg, prices);
            }
          } catch {
            // Silently fail
          }
        }
        setSummaries(agg);
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
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {filterDate && (
        <div className="flex items-center justify-between bg-accent/5 p-4 rounded-xl border border-accent/10 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent/10 rounded-lg text-accent">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="font-semibold">Viewing trades for {filterDate.substring(0, 4)}-{filterDate.substring(4, 6)}-{filterDate.substring(6, 8)}</h3>
              <p className="text-xs text-muted">Showing {displaySummaries?.length || 0} trading day</p>
            </div>
          </div>
          <Link
            href="/journal"
            className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            <ArrowLeft size={16} />
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
