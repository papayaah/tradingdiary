import { StickyNote, BarChart2, ChevronDown, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { pnlColorClass } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';

interface DayHeaderProps {
  formattedDate: string;
  totalPnL: number;
  currency?: string;
  /** Day's open-position unrealized P&L (account currency). Undefined when there
   * is nothing open or quotes haven't priced every open position yet. */
  unrealizedPnL?: number;
  /** True when the day still holds open positions (whether or not priced yet). */
  hasOpenPositions?: boolean;
  /** True while open-position quotes are still in flight. */
  unrealizedLoading?: boolean;
  isNotesOpen: boolean;
  onToggleNotes: () => void;
  isStatsOpen?: boolean;
  onToggleStats?: () => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  hasPrevDay?: boolean;
  hasNextDay?: boolean;
}

function signed(amount: number, currency: string): string {
  return `${amount >= 0 ? '+' : ''}${formatCurrency(amount, currency)}`;
}

export default function DayHeader({
  formattedDate,
  totalPnL,
  currency = 'USD',
  unrealizedPnL,
  hasOpenPositions = false,
  unrealizedLoading = false,
  isNotesOpen,
  onToggleNotes,
  isStatsOpen = false,
  onToggleStats,
  onPrevDay,
  onNextDay,
  hasPrevDay = false,
  hasNextDay = false,
}: DayHeaderProps) {
  const isProfit = totalPnL >= 0;
  const totalMtm = unrealizedPnL != null ? totalPnL + unrealizedPnL : null;

  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 bg-card-bg/80 backdrop-blur-md border-b border-card-border/50 rounded-t-2xl cursor-pointer hover:bg-card-bg/90 transition-all"
      onClick={onToggleNotes}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="text-muted/60 bg-muted-bg/50 p-1 rounded-md shrink-0">
          {isNotesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <div className="flex items-center gap-1">
          {onPrevDay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasPrevDay) onPrevDay();
              }}
              disabled={!hasPrevDay}
              title="Previous day (Left Arrow)"
              aria-label="Previous day (Left Arrow)"
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-muted-bg/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <h2 className="text-lg font-semibold text-foreground tracking-tight whitespace-nowrap">{formattedDate}</h2>
          {onNextDay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasNextDay) onNextDay();
              }}
              disabled={!hasNextDay}
              title="Next day (Right Arrow)"
              aria-label="Next day (Right Arrow)"
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-muted-bg/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleNotes();
          }}
          className={`flex shrink-0 items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-normal uppercase tracking-wider transition-all ${
            isNotesOpen ? 'bg-accent/20 text-accent ring-1 ring-accent/30' : 'bg-muted-bg/30 text-muted hover:bg-muted-bg/50 hover:text-foreground'
          }`}
        >
          <StickyNote size={12} />
          {isNotesOpen ? 'Notes' : 'Notes'}
        </button>

        {onToggleStats && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleStats();
            }}
            className={`flex shrink-0 items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-normal uppercase tracking-wider transition-all ${
              isStatsOpen ? 'bg-accent/20 text-accent ring-1 ring-accent/30' : 'bg-muted-bg/30 text-muted hover:bg-muted-bg/50 hover:text-foreground'
            }`}
          >
            <BarChart2 size={12} />
            {isStatsOpen ? 'Hide Stats' : 'Stats'}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <span className="text-[10px] font-medium text-muted uppercase tracking-widest bg-muted-bg/50 px-2 py-1 rounded-lg">Day P&amp;L</span>
        <div className="flex flex-col items-end gap-0.5">
          <span className={`text-base font-normal tabular-nums whitespace-nowrap ${pnlColorClass(totalPnL)}`}>
            {isProfit ? '+' : ''}{formatCurrency(totalPnL, currency)}
          </span>
          {hasOpenPositions ? (
            <>
              <div className="flex items-center gap-1.5 text-[10px] tabular-nums text-muted whitespace-nowrap">
                <span className="uppercase tracking-wider text-muted/60">Realized</span>
                <span className="text-muted/40">·</span>
                <span className="uppercase tracking-wider text-muted/60">Open</span>
                {unrealizedLoading && unrealizedPnL == null ? (
                  <Loader2 size={9} className="animate-spin" />
                ) : unrealizedPnL != null ? (
                  <span className={pnlColorClass(unrealizedPnL)}>{signed(unrealizedPnL, currency)}</span>
                ) : (
                  <span className="text-muted/40">—</span>
                )}
              </div>
              {totalMtm != null && (
                <span
                  className="flex items-center gap-1 text-[10px] tabular-nums whitespace-nowrap"
                  title="Total P&L marked to market: realized (closed trades) plus unrealized on open positions. Approximates IBKR's account 'Total' — it excludes marks on residual currency balances, so it can differ by a few dollars."
                >
                  <span className="uppercase tracking-wider text-muted/60">Total (MTM)</span>
                  <span className={pnlColorClass(totalMtm)}>{signed(totalMtm, currency)}</span>
                  <span className="text-muted/40 normal-case tracking-normal">approx</span>
                </span>
              )}
            </>
          ) : (
            <span
              className="text-[9px] font-normal text-muted/60 uppercase tracking-wider"
              title="All positions were closed on this day, so realized P&L is the full day total — matching IBKR's account total for the day."
            >
              Realized · all positions closed
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
