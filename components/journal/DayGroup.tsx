import { useState } from 'react';
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
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const activeAccount = accounts.find(a => a.accountId === accountId);
  const currency = activeAccount?.currency || 'USD';

  return (
    <section className="rounded-2xl border border-card-border overflow-hidden shadow-sm bg-card-bg mb-8 transition-all hover:shadow-md">
      <DayHeader 
        formattedDate={summary.formattedDate} 
        totalPnL={summary.totalPnL} 
        currency={currency} 
        isNotesOpen={isNotesOpen}
        onToggleNotes={() => setIsNotesOpen(!isNotesOpen)}
      />
      <DayStats summary={summary} currency={currency} />
      {isNotesOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <NotesArea date={summary.date} accountId={accountId} />
        </div>
      )}
      <TradeTable trades={summary.trades} accountId={accountId} currency={currency} />
    </section>
  );
}
