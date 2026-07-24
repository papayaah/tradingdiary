'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { LayoutGrid, List, RefreshCw } from 'lucide-react';

export type WatchlistView = 'compact' | 'table';

export const WatchlistViewToggle = React.memo(function WatchlistViewToggle({
  value,
  onChange,
}: {
  value: WatchlistView;
  onChange: (value: WatchlistView) => void;
}) {
  return (
    <div className="flex items-center rounded-lg border border-card-border bg-card-bg p-0.5">
      <button
        type="button"
        onClick={() => onChange('compact')}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          value === 'compact' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
        }`}
      >
        <LayoutGrid size={12} /> Compact
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
          value === 'table' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
        }`}
      >
        <List size={12} /> Table
      </button>
    </div>
  );
});

const formatCountdown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
};

export const ScanCountdown = React.memo(function ScanCountdown({
  seconds,
}: {
  seconds: number;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemaining(Math.max(0, seconds - elapsed));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  return <>{formatCountdown(remaining)}</>;
});

interface BatchScanProgress {
  current: number;
  total: number;
  percent: number;
}

export interface BatchScanControlHandle {
  start: (total: number) => void;
  update: (current: number, total: number) => void;
  complete: (total: number) => void;
}

interface BatchScanControlProps {
  disabled: boolean;
  isParallel: boolean;
  onScan: () => void;
}

const BatchScanControlComponent = forwardRef<BatchScanControlHandle, BatchScanControlProps>(
function BatchScanControl({ disabled, isParallel, onScan }, ref) {
  const [progress, setProgress] = useState<BatchScanProgress | null>(null);
  const clearTimerRef = useRef<number | null>(null);
  const isScanning = progress !== null && progress.percent < 100;

  const clearCompletionTimer = () => {
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  useImperativeHandle(ref, () => ({
    start(total) {
      clearCompletionTimer();
      setProgress({ current: 0, total, percent: 0 });
    },
    update(current, total) {
      setProgress({
        current,
        total,
        percent: Math.min(100, Math.round((current / Math.max(1, total)) * 100)),
      });
    },
    complete(total) {
      setProgress({ current: total, total, percent: 100 });
      clearCompletionTimer();
      clearTimerRef.current = window.setTimeout(() => {
        setProgress(null);
        clearTimerRef.current = null;
      }, 2500);
    },
  }), []);

  useEffect(() => () => clearCompletionTimer(), []);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onScan}
        disabled={disabled || isScanning}
        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/80 text-white disabled:opacity-50 disabled:hover:bg-accent transition-colors shadow-sm cursor-pointer"
      >
        <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
        <span>{isScanning ? `Scanning (${progress?.percent ?? 0}%)` : 'Scan Now All'}</span>
      </button>

      {progress && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] p-3.5 bg-card-bg border border-accent/40 rounded-xl shadow-xl flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-2 font-semibold text-accent">
              <RefreshCw size={14} className={isScanning ? 'animate-spin shrink-0' : 'shrink-0'} />
              {progress.percent === 100
                ? 'Scan Complete!'
                : isParallel
                  ? 'Batch scanning watchlist…'
                  : 'Scanning watchlist…'}
            </span>
            <span className="font-mono text-xs font-bold text-foreground whitespace-nowrap">
              {progress.current} / {progress.total} ({progress.percent}%)
            </span>
          </div>
          <div className="w-full bg-muted-bg rounded-full h-2 overflow-hidden border border-card-border/40">
            <div
              className="bg-accent h-full transition-all duration-200 rounded-full"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
});

export const BatchScanControl = React.memo(BatchScanControlComponent);

export interface TickerInputHandle {
  add: () => void;
}

interface TickerInputProps {
  placeholder: string;
  onSearch: (value: string) => void;
  onAdd: (value: string) => boolean;
}

const TickerInputComponent = forwardRef<TickerInputHandle, TickerInputProps>(
function TickerInput({ placeholder, onSearch, onAdd }, ref) {
  const [value, setValue] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(value), 150);
    return () => window.clearTimeout(timer);
  }, [value, onSearch]);

  const add = () => {
    if (onAdd(value)) {
      setValue('');
    }
  };
  useImperativeHandle(ref, () => ({ add }));

  return (
    <div className="sm:col-span-4 relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">
        TICKER
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') add();
        }}
        className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-16 pr-8 text-sm text-foreground outline-none transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xs"
          title="Clear ticker filter"
        >
          ✕
        </button>
      )}
    </div>
  );
});

export const TickerInput = React.memo(TickerInputComponent);
