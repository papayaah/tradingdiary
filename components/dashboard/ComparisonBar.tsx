'use client';

interface ComparisonBarProps {
  title: string;
  winLabel: string;
  winValue: number;
  lossLabel: string;
  lossValue: number;
  formatValue: (value: number) => string;
}

export default function ComparisonBar({
  title,
  winLabel,
  winValue,
  lossLabel,
  lossValue,
  formatValue,
}: ComparisonBarProps) {
  const absWin = Math.abs(winValue);
  const absLoss = Math.abs(lossValue);
  const maxVal = Math.max(absWin, absLoss, 1);

  return (
    <div className="h-full rounded-2xl border border-card-border bg-card-bg/50 backdrop-blur-sm p-4 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col">
      <h3 className="text-xs font-normal text-muted uppercase tracking-wider mb-3 border-b border-card-border/50 pb-2">{title}</h3>
      <div className="flex-1 flex flex-col justify-center gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-normal text-muted uppercase tracking-wider">{winLabel}</span>
            <span className="text-sm font-normal tabular-nums text-profit">{formatValue(winValue)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted-bg/50 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-profit shadow-[0_0_12px_rgba(22,163,74,0.3)] transition-all duration-1000 ease-out"
              style={{ width: `${(absWin / maxVal) * 100}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-normal text-muted uppercase tracking-wider">{lossLabel}</span>
            <span className="text-sm font-normal tabular-nums text-loss">{formatValue(lossValue)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted-bg/50 overflow-hidden shadow-inner">
            <div
              className="h-full rounded-full bg-loss shadow-[0_0_12px_rgba(220,38,38,0.3)] transition-all duration-1000 ease-out"
              style={{ width: `${(absLoss / maxVal) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
