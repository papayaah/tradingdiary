'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { LayoutGrid, List, Loader2, RefreshCw, Search, X } from 'lucide-react';

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
  fail: (message: string) => void;
}

interface BatchScanControlProps {
  disabled: boolean;
  isParallel: boolean;
  onScan: () => void;
}

const BatchScanControlComponent = forwardRef<BatchScanControlHandle, BatchScanControlProps>(
function BatchScanControl({ disabled, isParallel, onScan }, ref) {
  const [progress, setProgress] = useState<BatchScanProgress | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
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
      setFailure(null);
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
    fail(message) {
      setProgress(null);
      setFailure(message);
      clearCompletionTimer();
      clearTimerRef.current = window.setTimeout(() => {
        setFailure(null);
        clearTimerRef.current = null;
      }, 5000);
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
      {failure ? (
        <div
          role="alert"
          className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-loss/40 bg-card-bg p-3.5 text-xs font-semibold text-loss shadow-xl"
        >
          {failure}
        </div>
      ) : null}
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

interface SymbolSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

const TickerInputComponent = forwardRef<TickerInputHandle, TickerInputProps>(
function TickerInput({ placeholder, onSearch, onAdd }, ref) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter the watchlist as the user types (existing behavior).
  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(value), 150);
    return () => window.clearTimeout(timer);
  }, [value, onSearch]);

  // Debounced symbol autocomplete against the server proxy. Aborts stale
  // in-flight requests so results always match the latest keystrokes.
  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const base = process.env.NEXT_PUBLIC_SERVER_URL || '';
        const res = await fetch(`${base}/api/symbol-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: SymbolSuggestion[] };
        const results = Array.isArray(data.results) ? data.results : [];
        setSuggestions(results);
        setHighlight(-1);
        setOpen(results.length > 0);
      } catch {
        // aborted or network error — ignore
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const add = () => {
    if (onAdd(value)) {
      setValue('');
      setSuggestions([]);
      setOpen(false);
    }
  };
  useImperativeHandle(ref, () => ({ add }));

  const selectSuggestion = (symbol: string) => {
    setOpen(false);
    setSuggestions([]);
    if (onAdd(symbol)) {
      setValue('');
    } else {
      setValue(symbol);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (open && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
        return;
      }
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key === 'Enter' && highlight >= 0 && suggestions[highlight]) {
        event.preventDefault();
        selectSuggestion(suggestions[highlight].symbol);
        return;
      }
    }
    if (event.key === 'Enter') add();
  };

  return (
    <div ref={containerRef} className="sm:col-span-4 relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold z-10">
        TICKER
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-16 pr-8 text-sm text-foreground outline-none transition-all"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted">
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : value ? (
          <button
            type="button"
            onClick={() => { setValue(''); setSuggestions([]); setOpen(false); }}
            className="hover:text-foreground"
            title="Clear ticker"
            aria-label="Clear ticker"
          >
            <X size={14} />
          </button>
        ) : null}
      </span>

      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-40 max-h-72 overflow-y-auto rounded-xl border border-card-border bg-card-bg shadow-xl py-1">
          {suggestions.map((s, i) => (
            <li key={`${s.symbol}-${i}`}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input blur.
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s.symbol); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === highlight ? 'bg-accent/15' : 'hover:bg-muted-bg'
                }`}
              >
                <Search size={12} className="shrink-0 text-muted/50" />
                <span className="font-semibold font-mono text-foreground shrink-0">{s.symbol}</span>
                {s.name && <span className="text-muted truncate">{s.name}</span>}
                <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-muted/70">
                  {[s.type, s.exchange].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export const TickerInput = React.memo(TickerInputComponent);
