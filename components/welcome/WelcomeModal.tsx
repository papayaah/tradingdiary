'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Upload } from 'lucide-react';
import { useWelcome } from './WelcomeContext';

interface WelcomeModalProps {
  /** Optional video source URL (e.g. MP4 hosted link, YouTube embed, etc.) */
  videoUrl?: string;
}

interface Short {
  key: string;
  base: string;
}

const SHORTS: Short[] = [
  { key: 'analytics', base: '/analytics-promo' },
  { key: 'pattern', base: '/pattern-promo' },
  { key: 'replay', base: '/replay-promo' },
  { key: 'autoscan', base: '/auto-scan-promo' },
];

export default function WelcomeModal({ videoUrl = '/trading-diary-demo.mp4' }: WelcomeModalProps) {
  const { isOpen, closeWelcomeModal } = useWelcome();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // System & DOM Theme Detection
  useEffect(() => {
    const updateTheme = () => {
      const isDark =
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDarkMode(isDark);
    };

    updateTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', updateTheme);

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      mediaQuery.removeEventListener('change', updateTheme);
      observer.disconnect();
    };
  }, []);

  if (!isOpen) return null;

  const handleClose = () => {
    closeWelcomeModal(dontShowAgain);
  };

  const themeSuffix = isDarkMode ? '' : '-light';
  const activeDemoVideo = isDarkMode
    ? videoUrl
    : videoUrl.includes('-light')
    ? videoUrl
    : videoUrl.replace('.mp4', '-light.mp4');

  const isMp4 = activeDemoVideo.endsWith('.mp4') || activeDemoVideo.endsWith('.webm');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full h-full sm:h-auto sm:w-[95vw] max-w-6xl bg-card-bg border-0 sm:border border-card-border rounded-none sm:rounded-2xl shadow-2xl overflow-hidden max-h-full sm:max-h-[92vh] flex flex-col">
        {/* Floating close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30 p-2 text-white bg-black/60 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors shadow-lg border border-white/20"
          aria-label="Close welcome screen"
        >
          <X size={18} />
        </button>

        {/* Work-in-progress ribbon — pinned above the scroll area. Padded so the
            centered text clears the floating close button on both edges. */}
        <div className="flex-shrink-0 flex items-center justify-center gap-2 px-12 py-2.5 text-center bg-accent/10 text-accent border-b border-accent/20">
          <span aria-hidden>🚧</span>
          <p className="text-[11px] sm:text-xs leading-snug">
            <span className="font-semibold">Work in progress</span>
            <span className="hidden sm:inline"> — you&apos;re viewing an early preview. Expect rough edges, and please share feedback.</span>
            <span className="sm:hidden"> — early preview</span>
          </p>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {/* Hero demo video (16:9), full-bleed. Its background matches the app
              theme, so any contain-bars blend into card-bg rather than gray. */}
          <div className="w-full flex items-center justify-center bg-card-bg border-b border-card-border">
            {isMp4 ? (
              <video
                key={`main-video-${isDarkMode}`}
                src={activeDemoVideo}
                autoPlay
                loop
                muted
                playsInline
                controls
                className="w-full max-h-[46vh] object-contain"
              />
            ) : (
              <iframe
                src={activeDemoVideo.includes('youtube') ? `${activeDemoVideo}?autoplay=1` : activeDemoVideo}
                title="Trading Diary Overview Video"
                className="w-full aspect-video border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            )}
          </div>

          {/* Portrait shorts — real 9:16 tiles, full-bleed edge to edge with 1px
              dividers (gap-px over card-border). 2-up on mobile, 4-up on desktop. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-card-border">
            {SHORTS.map((short) => (
              <div key={short.key} className="relative aspect-[9/16] overflow-hidden bg-card-bg">
                <video
                  key={`${short.key}-${isDarkMode}`}
                  src={`${short.base}${themeSuffix}.mp4`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 px-5 sm:px-6 py-3.5 border-t border-card-border bg-muted-bg/30 flex-shrink-0">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-card-border bg-background text-accent focus:ring-accent"
            />
            <span>Don&apos;t show this welcome screen again</span>
          </label>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleClose}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold rounded-xl text-muted hover:text-foreground hover:bg-muted-bg transition-colors"
            >
              Explore App
            </button>
            <Link
              href="/import"
              onClick={handleClose}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-accent text-white hover:bg-accent/90 shadow-md shadow-accent/20 transition-all"
            >
              <Upload size={14} />
              Import First Trades
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
