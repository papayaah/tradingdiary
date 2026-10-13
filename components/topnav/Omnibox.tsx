'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CircleDollarSign,
  CornerDownLeft,
  FileText,
  LoaderCircle,
  Navigation,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import type { SearchResult, SearchResultGroup } from '@/lib/search/types';
import { useGlobalSearch } from '@/components/global-search/useGlobalSearch';

const GROUP_ORDER: SearchResultGroup[] = ['Go to', 'Actions', 'Trades', 'Journal notes'];

function ResultIcon({ result }: { result: SearchResult }) {
  if (result.kind === 'trade') return <CircleDollarSign size={16} />;
  if (result.kind === 'note') return <FileText size={16} />;
  if (result.id === 'action-add-trade') return <Plus size={16} />;
  if (result.id === 'action-import') return <Upload size={16} />;
  if (result.id === 'action-replay') return <RotateCcw size={16} />;
  return <Navigation size={16} />;
}

function groupResults(results: SearchResult[]) {
  return GROUP_ORDER.map((group) => ({
    group,
    results: results.filter((result) => result.group === group),
  })).filter((section) => section.results.length > 0);
}

/**
 * Paper-styled unified search: instant local results as you type, with an
 * Ask-AI affordance on Enter. The field expands on focus and the results drawer
 * is fused to its bottom edge so the two read as one shape. Reuses the real
 * `useGlobalSearch` index — the AI path is a stub until a model is wired.
 */
export default function Omnibox() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const { results, isLoading, currency } = useGlobalSearch(query, open);
  const sections = useMemo(() => groupResults(results), [results]);
  const ordered = useMemo(() => sections.flatMap((section) => section.results), [sections]);
  const safeIndex = Math.min(activeIndex, Math.max(0, ordered.length - 1));

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setAsked(false);
    setActiveIndex(0);
  }, []);

  const openIt = useCallback(() => setOpen(true), []);

  const choose = useCallback((result: SearchResult) => {
    close();
    router.push(result.href);
  }, [close, router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.focus());
      } else if (event.key === 'Escape' && open) {
        inputRef.current?.blur();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close();
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, close]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(Math.min(safeIndex + 1, ordered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(Math.max(safeIndex - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (ordered[safeIndex]) choose(ordered[safeIndex]);
      else setAsked(true);
    }
  }

  const askLabel = query.trim() ? `Ask AI: “${query.trim()}”` : 'Ask your journal a question';

  return (
    <div
      ref={rootRef}
      className="relative transition-[width] duration-200 ease-out"
      style={{ width: open ? 520 : 320, maxWidth: '42vw', zIndex: open ? 50 : undefined }}
    >
      <label
        htmlFor="omnibox-input"
        className={`relative z-[2] flex cursor-text items-center gap-2.5 border-[2.5px] border-line bg-paper-card px-3.5 py-2 ${
          open ? 'rounded-t-[20px]' : 'rounded-[20px]'
        }`}
      >
        <Search size={17} className="shrink-0 text-ink-soft" />
        <input
          id="omnibox-input"
          ref={inputRef}
          value={query}
          onFocus={openIt}
          onChange={(event) => {
            setQuery(event.target.value);
            setAsked(false);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Ask your journal…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-soft"
        />
        {isLoading ? (
          <LoaderCircle size={15} className="shrink-0 animate-spin text-ink-soft" />
        ) : (
          <span className="shrink-0 rounded-md border border-line-soft px-1.5 py-0.5 text-[11px] text-ink-soft">
            {'⌘'}K
          </span>
        )}
      </label>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-[1] -mt-[2.5px] max-h-[70vh] overflow-x-hidden overflow-y-auto rounded-b-[18px] border-[2.5px] border-t-0 border-line bg-paper-card"
          style={{ boxShadow: 'var(--paper-shadow)' }}
        >
          {asked ? (
            <div className="px-4 py-5">
              <div className="mb-2 text-[13px] text-ink-soft">{query.trim() ? `“${query.trim()}”` : 'Ask your journal'}</div>
              <div className="flex items-start gap-3 rounded-[13px] border-[2.5px] border-line-soft bg-paper-2 px-4 py-4">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-paper-profit" />
                <div className="text-[14px] leading-relaxed text-ink">
                  AI answers are coming soon. This will read your real trade records and reply in plain language — grounded, never guessed.
                </div>
              </div>
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <div key={section.group} className="py-1">
                  <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    {section.group}
                  </div>
                  {section.results.map((result) => {
                    const idx = ordered.indexOf(result);
                    const active = idx === safeIndex;
                    return (
                      <button
                        type="button"
                        key={result.id}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => choose(result)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${active ? 'bg-paper-2' : ''}`}
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-paper-2 text-ink-soft">
                          <ResultIcon result={result} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] text-ink">{result.title}</span>
                          {result.subtitle && (
                            <span className="block truncate text-[12.5px] text-ink-soft">{result.subtitle}</span>
                          )}
                        </span>
                        {result.pnl !== undefined ? (
                          <span className={`shrink-0 font-hand text-[17px] tabular-nums ${result.pnl >= 0 ? 'text-paper-profit' : 'text-paper-loss'}`}>
                            {formatCurrency(result.pnl, currency)}
                          </span>
                        ) : result.group === 'Go to' ? (
                          <span className="shrink-0 rounded-md bg-paper-2 px-2 py-0.5 text-[11px] text-ink-soft">page</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}

              {!isLoading && sections.length === 0 && (
                <div className="px-4 pb-2 pt-4 text-[13px] uppercase tracking-wider text-ink-soft">
                  No matches — try Ask AI for a written answer.
                </div>
              )}

              <button
                type="button"
                onClick={() => setAsked(true)}
                className="flex w-full items-center gap-3 border-t-2 border-dashed border-line-soft px-3 py-3 text-left hover:brightness-[0.98]"
                style={{ background: 'color-mix(in srgb, var(--paper-profit) 10%, transparent)' }}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper-profit text-paper-card">
                  <Sparkles size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-paper-profit">{askLabel}</span>
                  <span className="block text-[12.5px] text-ink-soft">Grounded on your real trades · costs 1 credit</span>
                </span>
                <CornerDownLeft size={15} className="shrink-0 text-ink-soft" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
