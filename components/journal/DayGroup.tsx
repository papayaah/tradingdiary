'use client';

import type { DailySummary } from '@/lib/trading/aggregator';
import DayHeader from './DayHeader';
import DayStats from './DayStats';
import NotesArea from './NotesArea';
import TradeTable from './TradeTable';

interface DayGroupProps {
  summary: DailySummary;
  accountId: string;
}

export default function DayGroup({ summary, accountId }: DayGroupProps) {
  return (
    <section className="rounded-xl border border-card-border overflow-hidden shadow-sm">
      <DayHeader formattedDate={summary.formattedDate} netPnL={summary.netPnL} />
      <DayStats summary={summary} />
      <NotesArea date={summary.date} accountId={accountId} />
      <TradeTable trades={summary.trades} />
    </section>
  );
}
