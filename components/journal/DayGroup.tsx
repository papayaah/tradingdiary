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
  focusSymbol?: string;
  openNotes?: boolean;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  hasPrevDay?: boolean;
  hasNextDay?: boolean;
  showBaseCurrency?: boolean;
  pricesLoading?: boolean;
}

export default function DayGroup({
  summary,
  accountId,
  focusSymbol,
  openNotes = false,
  onPrevDay,
  onNextDay,
  hasPrevDay = false,
  hasNextDay = false,
  showBaseCurrency = false,
  pricesLoading = false,
}: DayGroupProps) {
  const { accounts } = useAccount();
  const [isNotesOpen, setIsNotesOpen] = useState(openNotes);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const activeAccount = accounts.find(a => a.accountId === accountId);
  const currency = activeAccount?.currency || 'USD';

  return (
    <section className="rounded-2xl border border-card-border overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 bg-card-bg/50 backdrop-blur-sm mb-8">
      <DayHeader 
        formattedDate={summary.formattedDate} 
        totalPnL={summary.totalPnL}
        currency={currency}
        isNotesOpen={isNotesOpen}
        onToggleNotes={() => setIsNotesOpen(!isNotesOpen)}
        isStatsOpen={isStatsOpen}
        onToggleStats={() => setIsStatsOpen(!isStatsOpen)}
        onPrevDay={onPrevDay}
        onNextDay={onNextDay}
        hasPrevDay={hasPrevDay}
        hasNextDay={hasNextDay}
      />
      {isStatsOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <DayStats summary={summary} currency={currency} />
        </div>
      )}
      {isNotesOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <NotesArea date={summary.date} accountId={accountId} />
        </div>
      )}
      <TradeTable
        trades={summary.trades}
        accountId={accountId}
        currency={currency}
        focusSymbol={focusSymbol}
        showBaseCurrency={showBaseCurrency}
        pricesLoading={pricesLoading}
      />
    </section>
  );
}
