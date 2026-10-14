'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { useAccount } from '@/contexts/AccountContext';
import { useAIManagementContextOptional } from '@/packages/ai-connect/src/components';
import type { JournalAssistantResponse } from '@/lib/ai/journal-assistant-contract';
import type { LLMProvider } from '@/packages/ai-connect/src/types';

const DRAFT_KEY = 'tradingdiary:assistant-draft';

type Status = 'idle' | 'loading' | 'answer' | 'error';

interface JournalAIState {
  status: Status;
  question: string;
  answer: JournalAssistantResponse | null;
  error: string;
  // True while the search dropdown is open and showing the answer inline. The
  // floating panel only appears once this goes false (the user navigated away).
  dropdownOpen: boolean;
  setDropdownOpen: (open: boolean) => void;
  ask: (question: string) => void;
  dismiss: () => void;
}

const JournalAIContext = createContext<JournalAIState | null>(null);

/**
 * Holds the journal-assistant question/answer so the result lives in a floating
 * panel independent of the search dropdown — a ~10s answer survives clicking
 * away, and dismisses only on its own close. Reuses the real
 * `/api/ai/journal-assistant` endpoint.
 */
export function JournalAIProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const { selectedAccountId } = useAccount();
  const aiContext = useAIManagementContextOptional();

  const [status, setStatus] = useState<Status>('idle');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<JournalAssistantResponse | null>(null);
  const [error, setError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const signedIn = Boolean(session?.user);

  const dismiss = useCallback(() => {
    setStatus('idle');
    setAnswer(null);
    setError('');
    setQuestion('');
  }, []);

  const ask = useCallback(async (raw: string) => {
    const content = raw.trim();
    // One question at a time — a second request while loading would burn another
    // credit for no benefit.
    if (!content || isPending || status === 'loading') return;
    if (!signedIn) {
      sessionStorage.setItem(DRAFT_KEY, content);
      router.push(`/login?returnTo=${encodeURIComponent(pathname || '/calendar')}`);
      return;
    }

    setQuestion(content);
    setAnswer(null);
    setError('');
    setStatus('loading');

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
        sessionStorage.setItem(DRAFT_KEY, content);
        router.push(`/login?returnTo=${encodeURIComponent(pathname || '/calendar')}`);
        return;
      }
      if (!response.ok || !body.answer || !body.grounding) {
        throw new Error(body.error || 'The journal assistant could not answer that question.');
      }
      const assistantResponse = body as JournalAssistantResponse;
      setAnswer(assistantResponse);
      setStatus('answer');
      if (assistantResponse.usage && aiContext?.recordUsage) {
        aiContext.recordUsage(assistantResponse.provider as LLMProvider, assistantResponse.model, {
          inputTokens: assistantResponse.usage.promptTokens,
          outputTokens: assistantResponse.usage.completionTokens,
          totalTokens: assistantResponse.usage.totalTokens,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The journal assistant is unavailable.');
      setStatus('error');
    }
  }, [isPending, status, signedIn, router, pathname, aiContext, selectedAccountId]);

  // After a sign-in redirect, answer the question that was saved before leaving.
  useEffect(() => {
    if (!signedIn) return;
    const draft = sessionStorage.getItem(DRAFT_KEY);
    if (draft) {
      sessionStorage.removeItem(DRAFT_KEY);
      void ask(draft);
    }
  }, [signedIn, ask]);

  return (
    <JournalAIContext.Provider value={{ status, question, answer, error, dropdownOpen, setDropdownOpen, ask, dismiss }}>
      {children}
    </JournalAIContext.Provider>
  );
}

export function useJournalAI() {
  const ctx = useContext(JournalAIContext);
  if (!ctx) throw new Error('useJournalAI must be used within a JournalAIProvider');
  return ctx;
}
