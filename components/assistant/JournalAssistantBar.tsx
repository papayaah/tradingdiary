'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowRight,
  ChevronUp,
  ExternalLink,
  LockKeyhole,
  LoaderCircle,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { useAccount } from '@/contexts/AccountContext';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import type {
  JournalAnalyticsResult,
  JournalAssistantResponse,
  JournalAssistantEvidence,
  JournalNoteResult,
  JournalPrimitive,
} from '@/lib/ai/journal-assistant-contract';
import type { LLMProvider } from '@/packages/ai-connect/src/types';

const DRAFT_KEY = 'tradingdiary:assistant-draft';

interface ConversationEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: JournalAssistantResponse;
}

function formatMoney(value: number, currency: string, absolute = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: absolute ? 'never' : 'auto',
  }).format(absolute ? Math.abs(value) : value);
}

function formatTradingDay(value: string): string {
  if (!/^\d{8}$/.test(value)) return value;
  const date = new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  );
  const readable = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${readable} (${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)})`;
}

function columnLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function isMoneyColumn(column: string): boolean {
  return /(pnl|commission|price)/i.test(column);
}

function formatQueryValue(
  value: JournalPrimitive,
  column: string,
  row: Record<string, JournalPrimitive>,
  result: JournalAnalyticsResult,
): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string') {
    if ((/date|day/i.test(column)) && /^\d{8}$/.test(value)) return formatTradingDay(value);
    return value;
  }
  if (/win.?rate/i.test(column)) return `${value.toFixed(1)}%`;
  if (/profit.?factor/i.test(column)) return `${value.toFixed(2)}×`;
  const currency = typeof row.currency === 'string'
    ? row.currency
    : result.currencies.length === 1 ? result.currencies[0] : '';
  if (currency && isMoneyColumn(column)) return formatMoney(value, currency);
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function VerifiedQueries({ response }: { response: JournalAssistantResponse }) {
  if (!response.grounding.analytics.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {response.grounding.analytics.slice(-3).map((result, resultIndex) => (
        <div key={`${result.dataAsOf}-${resultIndex}`} className="border border-card-border bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-card-border px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Verified query result</span>
            <span className="truncate text-[10px] text-muted">{result.accountScopeLabel}</span>
          </div>
          {result.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wide text-muted">
                  <tr>
                    {result.columns.map((column) => (
                      <th key={column} className="px-3 py-1.5 font-semibold">{columnLabel(column)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 8).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-card-border">
                      {result.columns.map((column) => {
                        const value = row[column];
                        const numericTone = typeof value === 'number' && isMoneyColumn(column)
                          ? value > 0 ? 'text-profit' : value < 0 ? 'text-loss' : 'text-foreground'
                          : 'text-foreground';
                        return (
                          <td key={column} className={`px-3 py-2 font-medium tabular-nums ${numericTone}`}>
                            {formatQueryValue(value, column, row, result)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-3 py-2 text-xs text-muted">No matching trades.</div>
          )}
          {result.currencyWarning ? (
            <div className="border-t border-card-border px-3 py-1.5 text-[10px] text-muted">
              {result.currencyWarning}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RetrievedNotes({ notes, onOpen }: { notes: JournalNoteResult[]; onOpen: (note: JournalNoteResult) => void }) {
  if (!notes.length) return null;
  return (
    <div className="mt-3 border-t border-card-border pt-3">
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">Retrieved journal notes</div>
      <div className="space-y-1.5">
        {notes.slice(0, 6).map((note, index) => (
          <button
            key={`${note.kind}-${note.accountId}-${note.date}-${index}`}
            type="button"
            onClick={() => onOpen(note)}
            className="block w-full border border-card-border bg-background px-3 py-2 text-left transition hover:border-accent/50"
          >
            <span className="block text-[10px] font-semibold text-muted">
              {note.symbol ? `${note.symbol} · ` : ''}{formatTradingDay(note.date)} · {note.accountName}
            </span>
            <span className="mt-0.5 block line-clamp-2 text-xs text-foreground">{note.content}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EvidenceList({
  evidence,
  onOpen,
}: {
  evidence: JournalAssistantEvidence[];
  onOpen: (item: JournalAssistantEvidence) => void;
}) {
  if (!evidence.length) return null;
  return (
    <div className="mt-3 border-t border-card-border pt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        <ShieldCheck size={12} className="text-accent" /> Supporting trades
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {evidence.slice(0, 6).map((item) => (
          <button
            key={item.tradeGroupId}
            type="button"
            onClick={() => onOpen(item)}
            className="flex items-center gap-2 border border-card-border bg-background px-2.5 py-2 text-left transition-colors hover:border-accent/50 hover:bg-accent/5"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">
                {item.symbol} · {item.side.toLowerCase()}
              </span>
              <span className="block truncate text-[10px] text-muted">
                {formatTradingDay(item.tradingDay)} · {item.accountName}
              </span>
            </span>
            <span className={`shrink-0 text-xs font-bold tabular-nums ${item.netPnL >= 0 ? 'text-profit' : 'text-loss'}`}>
              {formatMoney(item.netPnL, item.currency)}
            </span>
            <ExternalLink size={12} className="shrink-0 text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JournalAssistantBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const { selectedAccountId, setSelectedAccountId, accounts } = useAccount();
  const aiContext = useAIManagementContextOptional();
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const signedIn = Boolean(session?.user);
  const activeAccount = useMemo(
    () => accounts.find((account) => account.accountId === selectedAccountId),
    [accounts, selectedAccountId],
  );

  useEffect(() => {
    if (!signedIn) return;
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) {
      setQuestion(draft);
      setExpanded(true);
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, [signedIn]);

  useEffect(() => {
    if (expanded) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [entries, expanded, loading]);

  function requestSignIn() {
    if (question.trim()) sessionStorage.setItem(DRAFT_KEY, question.trim());
    const returnTo = pathname || '/dashboard';
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  function openEvidence(item: JournalAssistantEvidence) {
    setSelectedAccountId(item.accountId);
    router.push(item.href);
  }

  function openNote(note: JournalNoteResult) {
    setSelectedAccountId(note.accountId);
    router.push(note.href);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const content = question.trim();
    if (!content || loading || sessionPending) return;
    if (!signedIn) {
      requestSignIn();
      return;
    }

    const userEntry: ConversationEntry = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };
    const nextEntries = [...entries, userEntry].slice(-10);
    setEntries(nextEntries);
    setQuestion('');
    setError('');
    setExpanded(true);
    setLoading(true);

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
          messages: nextEntries.map(({ role, content: messageContent }) => ({
            role,
            content: messageContent,
          })),
          selectedAccountId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<JournalAssistantResponse> & {
        error?: string;
        code?: string;
      };
      if (response.status === 401 && body.code === 'AI_AUTHENTICATION_REQUIRED') {
        sessionStorage.setItem(DRAFT_KEY, content);
        requestSignIn();
        return;
      }
      if (!response.ok || !body.answer || !body.grounding) {
        throw new Error(body.error || 'The journal assistant could not answer that question.');
      }

      const assistantResponse = body as JournalAssistantResponse;
      setEntries((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant' as const,
          content: assistantResponse.answer,
          response: assistantResponse,
        },
      ].slice(-12));
      if (assistantResponse.usage && aiContext?.recordUsage) {
        aiContext.recordUsage(assistantResponse.provider as LLMProvider, assistantResponse.model, {
          inputTokens: assistantResponse.usage.promptTokens,
          outputTokens: assistantResponse.usage.completionTokens,
          totalTokens: assistantResponse.usage.totalTokens,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The journal assistant is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  function clearConversation() {
    setEntries([]);
    setError('');
    setExpanded(false);
  }

  return (
    <section className="shrink-0 border-b border-card-border bg-card-bg" aria-label="Journal assistant">
      <div className="mx-auto w-full max-w-5xl px-3 py-2 sm:px-5">
        <form onSubmit={submit} className="flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 border border-card-border bg-background px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/10">
            {signedIn ? (
              <Sparkles size={17} className="shrink-0 text-accent" />
            ) : (
              <LockKeyhole size={16} className="shrink-0 text-muted" />
            )}
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onFocus={() => entries.length > 0 && setExpanded(true)}
              disabled={sessionPending || loading}
              maxLength={2_000}
              placeholder={signedIn ? 'Ask your journal — “How much did I lose on NVDA?”' : 'Sign in to ask questions about your trading'}
              aria-label="Ask your trading journal"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted disabled:cursor-wait"
            />
            {activeAccount && signedIn ? (
              <span className="hidden max-w-36 truncate border-l border-card-border pl-2 text-[10px] font-semibold text-muted sm:block">
                {activeAccount.name}
              </span>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={sessionPending || loading || (signedIn && !question.trim())}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 bg-accent px-3 text-xs font-bold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <LoaderCircle size={15} className="animate-spin" /> : signedIn ? <ArrowRight size={15} /> : <LockKeyhole size={14} />}
            <span className="hidden sm:inline">{signedIn ? 'Ask' : 'Sign in'}</span>
          </button>
          {entries.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-card-border bg-background text-muted transition hover:text-foreground"
              aria-label={expanded ? 'Collapse assistant' : 'Expand assistant'}
            >
              {expanded ? <ChevronUp size={16} /> : <MessageSquareText size={16} />}
            </button>
          ) : null}
        </form>

        {expanded ? (
          <div className="mt-2 border border-card-border bg-muted-bg">
            <div className="flex items-center justify-between border-b border-card-border px-3 py-2">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-accent" />
                <span className="text-xs font-semibold text-foreground">Grounded in your synchronized journal</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearConversation}
                  className="flex h-7 items-center gap-1 px-2 text-[10px] font-semibold text-muted hover:bg-background hover:text-foreground"
                >
                  <Trash2 size={12} /> Clear
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="flex h-7 w-7 items-center justify-center text-muted hover:bg-background hover:text-foreground"
                  aria-label="Collapse assistant"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div ref={scrollRef} className="max-h-[min(42vh,390px)] space-y-3 overflow-y-auto p-3">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className={entry.role === 'user' ? 'ml-auto max-w-[85%]' : 'mr-auto w-full'}
                >
                  {entry.role === 'user' ? (
                    <div className="bg-accent px-3 py-2 text-sm text-white">{entry.content}</div>
                  ) : (
                    <div className="border border-card-border bg-card-bg p-3">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                        <Sparkles size={12} /> Journal answer
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
                        {entry.content}
                      </p>
                      {entry.response ? <VerifiedQueries response={entry.response} /> : null}
                      {entry.response ? (
                        <RetrievedNotes
                          notes={entry.response.grounding.notes.flatMap((result) => result.notes)}
                          onOpen={openNote}
                        />
                      ) : null}
                      {entry.response ? (
                        <EvidenceList evidence={entry.response.grounding.evidence} onOpen={openEvidence} />
                      ) : null}
                      {entry.response ? (
                        <div className="mt-2 text-[10px] text-muted">
                          {entry.response.grounding.analytics.length
                            ? (() => {
                                const result = entry.response!.grounding.analytics.at(-1)!;
                                return `Queried ${result.matchedTradeCount} matching trade${result.matchedTradeCount === 1 ? '' : 's'} · ${result.accountScopeLabel}`;
                              })()
                            : `Retrieved ${entry.response.grounding.notes.reduce((count, result) => count + result.notes.length, 0)} journal notes`}
                          {entry.response.credits ? ` · ${entry.response.credits.remaining} AI credits remaining` : ''}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {loading ? (
                <div className="flex items-center gap-2 text-xs text-muted">
                  <LoaderCircle size={14} className="animate-spin text-accent" /> Building a verified journal query…
                </div>
              ) : null}
              {error ? (
                <div className="border border-loss/30 bg-loss/5 px-3 py-2 text-xs text-loss">{error}</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
