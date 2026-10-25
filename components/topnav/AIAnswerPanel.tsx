'use client';

import { useEffect } from 'react';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import { useJournalAI } from '@/contexts/JournalAIContext';
import AnswerContent from './AnswerContent';

/**
 * Floating, dismissible answer panel. It only appears once the search closes
 * with an active answer — i.e. the user navigated away mid-answer — so a slow
 * result isn't wasted. Non-modal: no backdrop, the page stays interactive, and
 * it closes via its X or Escape.
 *
 * Responsive: a right-side panel on desktop, a sheet rising from the bottom
 * (above the mobile tab bar) on phones.
 */
export default function AIAnswerPanel() {
  const { status, question, dropdownOpen, setDropdownOpen, dismiss } = useJournalAI();
  // Surface once the result (or error) is ready and the search has closed.
  const ready = (status === 'answer' || status === 'error') && !dropdownOpen;
  // Still working after the user moved on — show a lightweight indicator so the
  // pending answer isn't a mystery.
  const pending = status === 'loading' && !dropdownOpen;

  useEffect(() => {
    if (!ready) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ready, dismiss]);

  if (pending) {
    return (
      <button
        type="button"
        onClick={() => setDropdownOpen(true)}
        aria-label="Reading your trades — tap to view"
        className="fixed z-[60] flex items-center gap-2 rounded-full border-2 border-line bg-paper-card px-4 py-2.5
          bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2
          sm:bottom-4 sm:left-auto sm:right-4 sm:translate-x-0
          animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={{ boxShadow: 'var(--paper-shadow)' }}
      >
        <LoaderCircle size={15} className="animate-spin text-paper-profit" />
        <span className="text-[13px] text-ink">Reading your trades…</span>
      </button>
    );
  }

  if (!ready) return null;

  return (
    <aside
      className="fixed z-[60] flex flex-col border-[2.5px] border-line bg-paper-card
        inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] max-h-[72vh] rounded-[12px]
        sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-20 sm:max-h-none sm:w-[min(400px,calc(100vw-2rem))]
        animate-in fade-in slide-in-from-bottom-3 duration-200 sm:slide-in-from-right-3"
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
