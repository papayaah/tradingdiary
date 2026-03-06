'use client';

import type { DailySummary } from '@/lib/trading/aggregator';
import DayHeader from './DayHeader';
import DayStats from './DayStats';
import NotesArea from './NotesArea';
import TradeTable from './TradeTable';

import { useAccount } from '@/contexts/AccountContext';

interface DayGroupProps {
  summary: DailySummary;
  accountId: string;
}

export default function DayGroup({ summary, accountId }: DayGroupProps) {
  const { accounts } = useAccount();
  const activeAccount = accounts.find(a => a.accountId === accountId);
  const currency = activeAccount?.currency || 'USD';

  return (
    <section className="rounded-xl border border-card-border overflow-hidden shadow-sm">
      <DayHeader formattedDate={summary.formattedDate} totalPnL={summary.totalPnL} currency={currency} />
      <DayStats summary={summary} currency={currency} />
      <NotesArea date={summary.date} accountId={accountId} />
      <TradeTable trades={summary.trades} accountId={accountId} currency={currency} />
    </section>
  );
}
