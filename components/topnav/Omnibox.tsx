'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
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
import { authClient } from '@/lib/auth-client';
import { useAccount } from '@/contexts/AccountContext';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import type { SearchResult, SearchResultGroup } from '@/lib/search/types';
import type { JournalAssistantResponse } from '@/lib/ai/journal-assistant-contract';
import type { LLMProvider } from '@/packages/ai-connect/src/types';
import { useGlobalSearch } from '@/components/global-search/useGlobalSearch';

const GROUP_ORDER: SearchResultGroup[] = ['Go to', 'Actions', 'Trades', 'Journal notes'];
const DRAFT_KEY = 'tradingdiary:assistant-draft';

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

type AiStatus = 'idle' | 'loading' | 'answer' | 'error';

/**
 * Paper-styled unified search: instant local results as you type, and a real
 * AI answer on Enter / "Ask AI" (same `/api/ai/journal-assistant` backend the
 * journal assistant uses). The field expands on focus and the results drawer is
 * fused to its bottom edge so the two read as one shape.
 */
export default function Omnibox() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { selectedAccountId } = useAccount();
  const aiContext = useAIManagementContextOptional();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const [aiStatus, setAiStatus] = useState<AiStatus>('idle');
  const [aiAnswer, setAiAnswer] = useState<JournalAssistantResponse | null>(null);
  const [aiError, setAiError] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');

  const signedIn = Boolean(session?.user);
  const { results, isLoading, currency } = useGlobalSearch(query, open);
  const sections = useMemo(() => groupResults(results), [results]);
  const ordered = useMemo(() => sections.flatMap((section) => section.results), [sections]);
  const safeIndex = Math.min(activeIndex, Math.max(0, ordered.length - 1));

  const resetAi = useCallback(() => {
    setAiStatus('idle');
    setAiAnswer(null);
    setAiError('');
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    resetAi();
  }, [resetAi]);

  const choose = useCallback((result: SearchResult) => {
    close();
    router.push(result.href);
  }, [close, router]);

  const requestSignIn = useCallback((content: string) => {
    if (content) sessionStorage.setItem(DRAFT_KEY, content);
    router.push(`/login?returnTo=${encodeURIComponent(pathname || '/calendar')}`);
  }, [pathname, router]);

  const askAI = useCallback(async () => {
    const content = query.trim();
    if (!content || aiStatus === 'loading' || sessionPending) return;
    if (!signedIn) {
      requestSignIn(content);
      return;
    }

    setAskedQuestion(content);
    setAiError('');
    setAiAnswer(null);
    setAiStatus('loading');

    const config = aiContext?.config;
    const custom = config?.type === 'custom-llm' ? config.customLLM : undefined;
    try {
      const response = await fetch('/api/ai/journal-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(custom?.apiKey ? { 'x-api-key': custom.apiKey } : {}),
          ...(custom?.provider ? { 'x-provider': custom.provider } : {}),
          ...(custom?.model ? { 'x-model': custom.model } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          selectedAccountId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<JournalAssistantResponse> & {
        error?: string;
        code?: string;
      };
      if (response.status === 401 && body.code === 'AI_AUTHENTICATION_REQUIRED') {
        requestSignIn(content);
        return;
      }
      if (!response.ok || !body.answer || !body.grounding) {
        throw new Error(body.error || 'The journal assistant could not answer that question.');
      }
      const assistantResponse = body as JournalAssistantResponse;
      setAiAnswer(assistantResponse);
      setAiStatus('answer');
      if (assistantResponse.usage && aiContext?.recordUsage) {
        aiContext.recordUsage(assistantResponse.provider as LLMProvider, assistantResponse.model, {
          inputTokens: assistantResponse.usage.promptTokens,
          outputTokens: assistantResponse.usage.completionTokens,
          totalTokens: assistantResponse.usage.totalTokens,
        });
      }
    } catch (caught) {
      setAiError(caught instanceof Error ? caught.message : 'The journal assistant is unavailable.');
      setAiStatus('error');
    }
  }, [query, aiStatus, sessionPending, signedIn, requestSignIn, aiContext, selectedAccountId]);

  // Restore a question saved before a sign-in redirect, once signed in.
  useEffect(() => {
    if (!signedIn) return;
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) {
      sessionStorage.removeItem(DRAFT_KEY);
      setQuery(draft);
      setOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [signedIn]);

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
      else void askAI();
    }
  }

  const askLabel = query.trim()
    ? `Ask AI: “${query.trim()}”`
    : signedIn
      ? 'Ask your journal a question'
      : 'Sign in to ask about your trading';

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
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            resetAi();
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
          {aiStatus === 'idle' ? (
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
                  No matches — press Enter for a written answer.
                </div>
              )}

              <button
                type="button"
                onClick={() => void askAI()}
                className="flex w-full items-center gap-3 border-t-2 border-dashed border-line-soft px-3 py-3 text-left hover:brightness-[0.98]"
                style={{ background: 'color-mix(in srgb, var(--paper-profit) 10%, transparent)' }}
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-paper-profit text-paper-card">
                  <Sparkles size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-paper-profit">{askLabel}</span>
                  <span className="block text-[12.5px] text-ink-soft">Grounded on your real trades</span>
                </span>
                <CornerDownLeft size={15} className="shrink-0 text-ink-soft" />
              </button>
            </>
          ) : (
            <div className="px-4 py-4">
              <button
                type="button"
                onClick={resetAi}
                className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft hover:text-ink"
              >
                <ArrowLeft size={14} /> Back to results
              </button>

              <div className="mb-2 text-[13px] text-ink-soft">{`“${askedQuestion}”`}</div>

              {aiStatus === 'loading' && (
                <div className="flex items-center gap-2 text-[14px] text-ink-soft">
                  <LoaderCircle size={16} className="animate-spin" /> Reading your trades…
                </div>
              )}

              {aiStatus === 'answer' && aiAnswer && (
                <>
                  <div className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{aiAnswer.answer}</div>
                  <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                    <Sparkles size={13} className="text-paper-profit" /> Grounded on your real trades
                  </div>
                </>
              )}

              {aiStatus === 'error' && (
                <div className="flex items-start gap-3 rounded-[13px] border-[2.5px] border-line-soft bg-paper-2 px-4 py-3 text-[14px] text-ink">
                  {aiError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
