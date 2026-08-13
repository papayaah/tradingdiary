import { StickyNote, BarChart2, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { pnlColorClass } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';

interface DayHeaderProps {
  formattedDate: string;
  totalPnL: number;
  currency?: string;
  isNotesOpen: boolean;
  onToggleNotes: () => void;
  isStatsOpen?: boolean;
  onToggleStats?: () => void;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  hasPrevDay?: boolean;
  hasNextDay?: boolean;
}

export default function DayHeader({ 
  formattedDate, 
  totalPnL, 
  currency = 'USD',
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
        <span className="text-[10px] font-medium text-muted uppercase tracking-widest bg-muted-bg/50 px-2 py-1 rounded-lg">Day P&L</span>
        <span className={`text-base font-normal tabular-nums whitespace-nowrap ${pnlColorClass(totalPnL)}`}>
          {isProfit ? '+' : ''}{formatCurrency(totalPnL, currency)}
        </span>
      </div>
    </div>
  );
}

