'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { LayoutGrid, List } from 'lucide-react';

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
