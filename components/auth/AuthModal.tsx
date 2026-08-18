'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { AuthCard } from '@/packages/better-auth-connect/src/components';
import { defaultIconSet } from '@/packages/better-auth-connect/src/icons';
import { tailwindPreset } from '@/packages/better-auth-connect/src/presets/tailwind';

interface AuthModalProps {
  callbackURL: string;
  onClose: () => void;
}

export default function AuthModal({ callbackURL, onClose }: AuthModalProps) {
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
      aria-label="Sign in to Trading Diary"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close sign-in"
          title="Close sign-in (Esc)"
          className="absolute right-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full border border-card-border bg-card-bg/90 text-muted shadow-lg backdrop-blur-md transition-colors hover:bg-muted-bg hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <X size={18} />
        </button>

        <AuthCard
          preset={tailwindPreset}
          icons={defaultIconSet}
          title="Sign in to Trading Diary"
          description="Sync your watchlist and receive server alerts across devices."
          buttonLabel="Continue with Google"
          callbackURL={callbackURL}
          showSignedIn={false}
          footer={
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              Your journal remains private and is not posted to Google.
            </p>
          }
        />
      </div>
    </div>,
    document.body,
  );
}
