'use client';

import { useEffect } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useJournalAI } from '@/contexts/JournalAIContext';
import AnswerContent from './AnswerContent';

/**
 * Floating, dismissible answer panel. It only appears once the search dropdown
 * closes with an active answer — i.e. the user navigated away mid-answer — so a
 * slow result isn't wasted. Non-modal: no backdrop, the page stays interactive,
 * and it closes via its X or Escape.
 */
export default function AIAnswerPanel() {
  const { status, question, dropdownOpen, dismiss } = useJournalAI();
  // Only surface once the result (or error) is ready — not while it's still
  // "Reading your trades…" in the background.
  const visible = (status === 'answer' || status === 'error') && !dropdownOpen;

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <aside
      className="fixed bottom-4 right-4 top-20 z-[60] flex w-[min(400px,calc(100vw-2rem))] flex-col rounded-[18px] border-[2.5px] border-line bg-paper-card"
      style={{
        boxShadow: 'var(--paper-shadow)',
        backgroundImage: 'radial-gradient(var(--dot) 1.4px, transparent 1.4px)',
        backgroundSize: '22px 22px',
      }}
      aria-label="Journal answer"
    >
      <div className="flex items-start gap-2.5 border-b-2 border-dashed border-line-soft p-4">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-paper-profit" />
        <div className="min-w-0 flex-1">
          <div className="font-hand text-[13px] text-ink-soft">Ask your journal</div>
          <div className="text-[15px] text-ink">{question}</div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close answer"
          className="shrink-0 text-ink-soft transition-colors hover:text-ink"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <AnswerContent />
      </div>
    </aside>
  );
}
