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
  const [isTradeFocused, setIsTradeFocused] = useState(false);
  const activeAccount = accounts.find(a => a.accountId === accountId);
  const currency = activeAccount?.currency || 'USD';

  // Open-position unrealized for the day, mirroring IBKR's Realized/Unrealized/Total
  // statement rows. Only sum once every open trade has a quote, so a partial fetch
  // never shows a misleadingly small "Open" figure; until then it reads as loading.
  const openTrades = summary.trades.filter((t) => t.isOpen);
  const hasOpenPositions = openTrades.length > 0;
  const pricedOpenCount = openTrades.filter((t) => t.unrealizedPnL != null).length;
  const unrealizedReady = hasOpenPositions && pricedOpenCount === openTrades.length;
  const unrealizedPnL = unrealizedReady
    ? openTrades.reduce((sum, t) => sum + (t.unrealizedPnL ?? 0), 0)
    : undefined;
  const unrealizedLoading = hasOpenPositions && !unrealizedReady && pricesLoading;

  return (
    <section
      className={`rounded-2xl border overflow-hidden transition-all duration-300 bg-card-bg/50 backdrop-blur-sm mb-8 ${
        isTradeFocused
          ? 'relative z-[100] border-accent/50 shadow-2xl shadow-background'
          : 'border-card-border shadow-sm hover:shadow-md'
      }`}
    >
      <DayHeader
        formattedDate={summary.formattedDate}
        totalPnL={summary.totalPnL}
        currency={currency}
        unrealizedPnL={unrealizedPnL}
        hasOpenPositions={hasOpenPositions}
        unrealizedLoading={unrealizedLoading}
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
        onFocusChange={setIsTradeFocused}
      />
    </section>
  );
}
