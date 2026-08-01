'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  TrendingUp,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useWelcome } from './WelcomeContext';

interface WelcomeModalProps {
  /** Optional video source URL (e.g. MP4 hosted link, YouTube embed, etc.) */
  videoUrl?: string;
  /** Optional custom title */
  title?: string;
}

export default function WelcomeModal({ videoUrl = '/trading-diary-demo.mp4', title }: WelcomeModalProps) {
  const { isOpen, closeWelcomeModal } = useWelcome();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="relative w-[94vw] max-w-6xl 2xl:max-w-7xl bg-card-bg border border-card-border rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col transition-all">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-card-border bg-muted-bg/40">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-accent text-white shadow-md shadow-accent/20">
              <TrendingUp size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="welcome-modal-title" className="text-lg font-bold text-foreground tracking-tight">
                  {title || 'Welcome to Trading Diary'}
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20">
                  <Sparkles size={11} /> Next-Gen Journal
                </span>
              </div>
              <p className="text-xs text-muted">
                Elevate your trading with automated analytics, pattern watching, and trade replays.
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 text-muted hover:text-foreground rounded-lg hover:bg-muted-bg transition-colors"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Video Showcase Section */}
          <div className="relative aspect-video w-full rounded-xl border border-card-border overflow-hidden bg-black group shadow-inner">
            {isPlaying ? (
              <div className="relative w-full h-full bg-black flex items-center justify-center">
                {isMp4 ? (
                  <video
                    src={activeDemoVideo}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={activeDemoVideo.includes('youtube') ? `${activeDemoVideo}?autoplay=1` : activeDemoVideo}
                    title="Trading Diary Overview Video"
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                )}
                <button
                  onClick={() => setIsPlaying(false)}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-semibold backdrop-blur-sm hover:bg-black/90 transition-colors z-20"
                >
                  Close Video
                </button>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-accent/20 via-background to-muted-bg/80 p-6 text-center">
                {/* Decorative Background Pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/25 via-transparent to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-4">
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="relative group/btn flex items-center justify-center w-16 h-16 rounded-full bg-accent text-white shadow-xl shadow-accent/50 hover:scale-105 active:scale-95 transition-all duration-200"
                    aria-label="Play Walkthrough Video"
                  >
                    <Play size={26} className="ml-1 fill-white" />
                    <span className="absolute -inset-1 rounded-full bg-accent/40 animate-ping pointer-events-none" />
                  </button>

                  <div>
                    <span className="text-xs font-bold text-accent uppercase tracking-widest block mb-1">
                      30-Second Comic Product Promo Video
                    </span>
                    <h3 className="text-base font-bold text-foreground">
                      See How Trading Diary Transforms Your Edge
                    </h3>
                    <p className="text-xs text-muted max-w-md mt-1">
                      Watch the 30-second high-energy comic promo showing broker imports, visual analytics, trade replays, and pattern scanners.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Value Proposition Grid — 4 Full-Bleed Vertical Shorts (Auto-Theme Adapted) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Visual Analytics Short */}
            <div className="relative rounded-xl border border-card-border hover:border-accent/40 transition-all overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg">
              <video
                key={`analytics-${isDarkMode}`}
                src={`/analytics-promo${themeSuffix}.mp4`}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300 min-h-[180px]"
              />
            </div>

            {/* 2. Market Pattern Watch Short */}
            <div className="relative rounded-xl border border-card-border hover:border-accent/40 transition-all overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg">
              <video
                key={`pattern-${isDarkMode}`}
                src={`/pattern-promo${themeSuffix}.mp4`}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300 min-h-[180px]"
              />
            </div>

            {/* 3. Bar-by-Bar Replay Short */}
            <div className="relative rounded-xl border border-card-border hover:border-accent/40 transition-all overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg">
              <video
                key={`replay-${isDarkMode}`}
                src={`/replay-promo${themeSuffix}.mp4`}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300 min-h-[180px]"
              />
            </div>

            {/* 4. Multi-Broker Import Short */}
            <div className="relative rounded-xl border border-card-border hover:border-accent/40 transition-all overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg">
              <video
                key={`import-${isDarkMode}`}
                src={`/import-promo${themeSuffix}.mp4`}
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300 min-h-[180px]"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-card-border bg-muted-bg/30">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-muted hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="rounded border-card-border bg-background text-accent focus:ring-accent"
            />
            <span>Don't show this welcome screen again</span>
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
