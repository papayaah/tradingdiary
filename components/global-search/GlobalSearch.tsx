'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  CornerDownLeft,
  FileText,
  LoaderCircle,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { SearchResult, SearchResultGroup } from '@/lib/search/types';
import { useGlobalSearch } from './useGlobalSearch';

const GROUP_ORDER: SearchResultGroup[] = ['Go to', 'Actions', 'Trades', 'Journal notes'];

function ResultIcon({ result }: { result: SearchResult }) {
  if (result.kind === 'trade') return <CircleDollarSign size={17} />;
  if (result.kind === 'note') return <FileText size={17} />;
  if (result.id === 'action-add-trade') return <Plus size={17} />;
  if (result.id === 'action-import') return <Upload size={17} />;
  if (result.id === 'action-replay') return <RotateCcw size={17} />;
  return <Navigation size={17} />;
}

function groupResults(results: SearchResult[]) {
  return GROUP_ORDER.map((group) => ({
    group,
    results: results.filter((result) => result.group === group),
  })).filter((section) => section.results.length > 0);
}

export default function GlobalSearch() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { results, isLoading, currency } = useGlobalSearch(query, isOpen);
  const sections = useMemo(() => groupResults(results), [results]);
  const orderedResults = useMemo(() => sections.flatMap((section) => section.results), [sections]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, orderedResults.length - 1));

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setActiveIndex(0);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const choose = useCallback((result: SearchResult) => {
    close();
    router.push(result.href);
  }, [close, router]);

  useEffect(() => {
    function onGlobalKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen) close();
        else open();
      } else if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [close, isOpen, open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }
    if (isOpen) document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [close, isOpen]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(safeActiveIndex + 1, orderedResults.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(safeActiveIndex - 1, 0));
    } else if (event.key === 'Enter' && orderedResults[safeActiveIndex]) {
      event.preventDefault();
      choose(orderedResults[safeActiveIndex]);
    }
  }

  return (
    <header className="relative z-40 shrink-0 border-b border-card-border bg-background px-3 py-2.5 sm:px-6">
      <div ref={rootRef} className="relative mx-auto max-w-2xl">
        {isOpen ? (
          <div className="flex h-11 items-center gap-3 rounded-xl border border-accent bg-card-bg px-3 shadow-sm ring-2 ring-accent/15">
            <Search size={18} className="shrink-0 text-accent" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls="global-search-results"
              aria-activedescendant={orderedResults[safeActiveIndex] ? `search-result-${orderedResults[safeActiveIndex].id}` : undefined}
              placeholder="Try AAPL losses, tag:revenge, or open positions"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
            {isLoading ? <LoaderCircle size={16} className="animate-spin text-muted" /> : null}
            <button type="button" onClick={close} className="rounded-md border border-card-border bg-muted-bg px-2 py-1 text-[10px] font-semibold text-muted hover:text-foreground">
              ESC
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={open}
            className="flex h-11 w-full items-center gap-3 rounded-xl border border-card-border bg-card-bg px-3 text-left shadow-sm transition hover:border-accent/40 hover:bg-muted-bg/40"
            aria-label="Open global search"
          >
            <Search size={18} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted">Search trades, notes, or actions…</span>
            <span className="hidden items-center gap-0.5 rounded-md border border-card-border bg-muted-bg px-2 py-1 text-[10px] font-semibold text-muted sm:flex">
              <span className="text-xs">⌘</span>K
            </span>
          </button>
        )}

        {isOpen && (
          <div
            id="global-search-results"
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-[min(68vh,560px)] overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-2 shadow-2xl"
          >
            {sections.map((section) => (
              <section key={section.group} className="py-1">
                <h2 className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-muted">{section.group}</h2>
                {section.results.map((result) => {
                  const currentIndex = orderedResults.indexOf(result);
                  const active = currentIndex === safeActiveIndex;
                  return (
                    <button
                      type="button"
                      id={`search-result-${result.id}`}
                      role="option"
                      aria-selected={active}
                      key={result.id}
                      onMouseEnter={() => setActiveIndex(currentIndex)}
                      onClick={() => choose(result)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-accent/10' : 'hover:bg-muted-bg'}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-accent text-white' : 'bg-muted-bg text-muted'}`}>
                        <ResultIcon result={result} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">{result.title}</span>
                          {result.side && <span className="text-[9px] font-bold uppercase tracking-wider text-muted">{result.side}</span>}
                          {result.isOpen && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent">Open</span>}
                        </span>
                        <span className="block truncate text-xs text-muted">{result.subtitle}</span>
                      </span>
                      {result.pnl !== undefined ? (
                        <span className={`shrink-0 text-xs font-bold tabular-nums ${result.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {formatCurrency(result.pnl, currency)}
                        </span>
                      ) : active ? <ArrowRight size={15} className="shrink-0 text-accent" /> : null}
                    </button>
                  );
                })}
              </section>
            ))}

            {!isLoading && sections.length === 0 && (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <BookOpen size={24} className="text-muted" />
                <p className="mt-3 text-sm font-semibold text-foreground">No matching trades or notes</p>
                <p className="mt-1 text-xs text-muted">Try a symbol, date, tag, or fewer filters.</p>
              </div>
            )}

            <footer className="mt-1 flex items-center justify-between border-t border-card-border px-3 py-2 text-[10px] text-muted">
              <span className="hidden sm:inline">Filters: symbol: · result: · side: · status: · tag: · date:</span>
              <span className="ml-auto flex items-center gap-1"><CornerDownLeft size={11} /> Open</span>
            </footer>
          </div>
        )}
      </div>
    </header>
  );
}
