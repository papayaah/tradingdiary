'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { LayoutGrid, List, Loader2, Search, X } from 'lucide-react';
import type { SymbolSearchCategory } from '@/lib/market/symbol-search';

export type WatchlistView = 'compact' | 'table';

export const WatchlistViewToggle = React.memo(function WatchlistViewToggle({
  value,
  onChange,
}: {
  value: WatchlistView;
  onChange: (value: WatchlistView) => void;
}) {
  return (
    <div className="flex items-center rounded-xl border border-card-border bg-card-bg p-0.5">
      <button
        type="button"
        onClick={() => onChange('compact')}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
          value === 'compact' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
        }`}
      >
        <LayoutGrid size={14} /> Compact
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
          value === 'table' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
        }`}
      >
        <List size={14} /> Table
      </button>
    </div>
  );
});

export interface TickerInputHandle {
  add: () => void;
}

interface TickerInputProps {
  placeholder: string;
  category: SymbolSearchCategory;
  onSearch: (value: string) => void;
  onAdd: (value: string) => boolean | Promise<boolean>;
  disabled?: boolean;
  className?: string;
}

interface SymbolSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

const TickerInputComponent = forwardRef<TickerInputHandle, TickerInputProps>(
function TickerInput({ placeholder, category, onSearch, onAdd, disabled = false, className }, ref) {
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
    // Allow single-character queries — real tickers exist (U, W, F, T, X…).
    if (query.length < 1) {
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
        const params = new URLSearchParams({ q: query, category });
        const res = await fetch(`${base}/api/symbol-search?${params.toString()}`, {
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
  }, [category, value]);

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

  const add = async () => {
    if (disabled) return;
    if (await onAdd(value)) {
      setValue('');
      setSuggestions([]);
      setOpen(false);
    }
  };
  useImperativeHandle(ref, () => ({ add }));

  const selectSuggestion = async (symbol: string) => {
    setOpen(false);
    setSuggestions([]);
    if (await onAdd(symbol)) {
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
    <div ref={containerRef} className={className || "sm:col-span-9 relative"}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold z-10">
        TICKER
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={onKeyDown}
        className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-16 pr-8 text-sm text-foreground outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
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
        <ul className="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-card-border bg-card-bg py-1 shadow-xl">
          {suggestions.map((s, i) => (
            <li key={`${s.symbol}-${i}`}>
              <button
                type="button"
                // onMouseDown (not onClick) so it fires before the input blur.
                onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s.symbol); }}
                onMouseEnter={() => setHighlight(i)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === highlight ? 'bg-accent/15' : 'hover:bg-muted-bg'
                }`}
              >
                <Search size={12} className="mt-1 shrink-0 text-muted/50" />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono font-semibold text-foreground">{s.symbol}</span>
                    <span className="truncate text-[10px] uppercase tracking-wide text-muted/70">
                      {[s.type, s.exchange].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {s.name ? (
                    <span className="mt-0.5 block truncate text-xs text-muted">{s.name}</span>
                  ) : null}
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
