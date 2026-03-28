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
  return (
    <div 
      className="flex items-center justify-between px-5 py-2.5 bg-card-bg border-b border-card-border rounded-t-xl cursor-pointer hover:bg-card-bg/80 transition-colors"
      onClick={onToggleNotes}
    >
      <div className="flex items-center gap-3">
        <div className="text-muted/60">
          {isNotesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
        <h2 className="text-sm font-bold text-foreground">{formattedDate}</h2>
        <button 
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
            isNotesOpen ? 'bg-accent/10 text-accent' : 'text-muted hover:text-foreground'
          }`}
        >
          <StickyNote size={12} />
          {isNotesOpen ? 'Hide Notes' : 'Show Notes'}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted font-bold uppercase tracking-tight">Daily P&L:</span>
        <span className={`text-sm font-black ${pnlColorClass(totalPnL)}`}>
          {formatCurrency(totalPnL, currency)}
        </span>
      </div>
    </div>
  );
}
