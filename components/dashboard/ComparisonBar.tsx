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
    <div className="rounded-xl border border-card-border bg-card-bg p-5 flex flex-col">
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>
      <div className="flex-1 flex flex-col justify-center gap-4">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-muted">{winLabel}</span>
            <span className="text-sm font-bold text-profit">{formatValue(winValue)}</span>
          </div>
          <div className="h-3 rounded-full bg-muted-bg overflow-hidden">
            <div
              className="h-full rounded-full bg-profit transition-all duration-700 ease-out"
              style={{ width: `${(absWin / maxVal) * 100}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xs text-muted">{lossLabel}</span>
            <span className="text-sm font-bold text-loss">{formatValue(lossValue)}</span>
          </div>
          <div className="h-3 rounded-full bg-muted-bg overflow-hidden">
            <div
              className="h-full rounded-full bg-loss transition-all duration-700 ease-out"
              style={{ width: `${(absLoss / maxVal) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
