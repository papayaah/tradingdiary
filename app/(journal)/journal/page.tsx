'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Upload, BookOpen } from 'lucide-react';
import { getAllTransactions } from '@/lib/db/trades';
import { aggregateByDay, type DailySummary } from '@/lib/trading/aggregator';
import DayGroup from '@/components/journal/DayGroup';

export default function JournalPage() {
  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [accountId, setAccountId] = useState('');

  useEffect(() => {
    async function load() {
      const transactions = await getAllTransactions();
      if (transactions.length > 0) {
        setAccountId(transactions[0].accountId);
        setSummaries(aggregateByDay(transactions));
      } else {
        setSummaries([]);
      }
    }
    load();
  }, []);

  if (summaries === null) {
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
      {summaries.map((summary) => (
        <DayGroup key={summary.date} summary={summary} accountId={accountId} />
      ))}
    </div>
  );
}
