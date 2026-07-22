import { StickyNote, ChevronDown, ChevronRight } from 'lucide-react';
import { pnlColorClass } from '@/lib/utils/format';
import { formatCurrency } from '@/lib/currency';

interface DayHeaderProps {
  formattedDate: string;
  totalPnL: number;
  currency?: string;
  isNotesOpen: boolean;
  onToggleNotes: () => void;
}

export default function DayHeader({ 
  formattedDate, 
  totalPnL, 
  currency = 'USD',
  isNotesOpen,
  onToggleNotes
}: DayHeaderProps) {
  const isProfit = totalPnL >= 0;

  return (
    <div 
      className="flex items-center justify-between px-6 py-4 bg-card-bg/80 backdrop-blur-md border-b border-card-border/50 rounded-t-2xl cursor-pointer hover:bg-card-bg/90 transition-all"
      onClick={onToggleNotes}
    >
      <div className="flex items-center gap-4">
        <div className="text-muted/60 bg-muted-bg/50 p-1 rounded-md">
          {isNotesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <h2 className="text-lg font-black text-foreground tracking-tight">{formattedDate}</h2>
        <div 
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
            isNotesOpen ? 'bg-accent/20 text-accent ring-1 ring-accent/30' : 'bg-muted-bg/30 text-muted hover:bg-muted-bg/50 hover:text-foreground'
          }`}
        >
          <StickyNote size={12} />
          {isNotesOpen ? 'Hide Notes' : 'Show Notes'}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold text-muted uppercase tracking-widest bg-muted-bg/50 px-2 py-1 rounded-lg">Day P&L</span>
        <span className={`text-base font-black ${pnlColorClass(totalPnL)} drop-shadow-sm`}>
          {isProfit ? '+' : ''}{formatCurrency(totalPnL, currency)}
        </span>
      </div>
    </div>
  );
}

