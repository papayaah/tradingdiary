'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ReplayExperience from './ReplayExperience';

export interface ReplayRequest {
  date: string;
  symbol: string;
}

interface ReplayModalProps {
  replay: ReplayRequest;
  onClose: () => void;
}

export default function ReplayModal({ replay, onClose }: ReplayModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    const focusFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Replay ${replay.symbol} on ${replay.date}`}
      className="fixed inset-0 z-[100] flex h-[100dvh] flex-col bg-background"
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-card-border bg-card-bg/95 px-3 backdrop-blur-xl sm:h-14 sm:px-5">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted">Journal replay</div>
          <div className="truncate text-sm font-black text-foreground">
            {replay.symbol}
            <span className="ml-2 font-medium text-muted">{formatCompactDate(replay.date)}</span>
          </div>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-card-border bg-background px-3 text-xs font-bold text-muted transition-colors hover:border-accent/30 hover:text-foreground"
          aria-label="Close replay"
          title="Close replay (Esc)"
        >
          <X size={16} />
          <span className="hidden sm:inline">Close</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ReplayExperience date={replay.date} symbol={replay.symbol} />
      </div>
    </div>,
    document.body,
  );
}

function formatCompactDate(date: string): string {
  if (!/^\d{8}$/.test(date)) return date;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6)) - 1;
  const day = Number(date.slice(6, 8));
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
