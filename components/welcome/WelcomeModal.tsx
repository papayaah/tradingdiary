'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
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
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full sm:w-[96vw] max-w-6xl 2xl:max-w-7xl bg-card-bg border border-card-border sm:rounded-2xl shadow-2xl overflow-hidden max-h-[96vh] flex flex-col transition-all">
        {/* Sleek Floating Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-30 p-2.5 text-white bg-black/70 hover:bg-black/90 rounded-full backdrop-blur-md transition-all shadow-xl border border-white/20"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Modal Scrollable Body — Completely Zero Padding / Margin (100% Full-Bleed Video Focus) */}
        <div className="p-0 m-0 space-y-0 overflow-y-auto flex-1">
          {/* Main Video Showcase Section — Flush Edge to Edge */}
          <div className="relative aspect-video w-full overflow-hidden bg-black group shadow-inner border-b border-card-border">
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
                  className="absolute top-4 left-4 px-3.5 py-1.5 rounded-lg bg-black/70 text-white text-xs font-semibold backdrop-blur-md hover:bg-black/90 transition-colors z-20 border border-white/10"
                >
                  Close Video
                </button>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-accent/20 via-background to-muted-bg/80 p-4 text-center">
                {/* Decorative Background Pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/25 via-transparent to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-3">
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="relative group/btn flex items-center justify-center w-20 h-20 rounded-full bg-accent text-white shadow-2xl shadow-accent/50 hover:scale-105 active:scale-95 transition-all duration-200"
                    aria-label="Play Walkthrough Video"
                  >
                    <Play size={32} className="ml-1 fill-white" />
                    <span className="absolute -inset-1 rounded-full bg-accent/40 animate-ping pointer-events-none" />
                  </button>

                  <span className="text-xs font-bold text-foreground/90 tracking-wide bg-background/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-card-border shadow-sm">
                    Click to Play 30s Master Demo
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Key Value Proposition Grid — 4 Full-Bleed Vertical Shorts (Flush Dividers, Zero Outer Padding) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border-b border-card-border">
            {/* 1. Visual Analytics Short */}
            <div className="relative overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg border-b sm:border-b-0 sm:border-r border-card-border">
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
            <div className="relative overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg border-b sm:border-b-0 lg:border-r border-card-border">
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
            <div className="relative overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg border-b sm:border-b-0 sm:border-r border-card-border">
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
            <div className="relative overflow-hidden group min-h-[180px] flex flex-col justify-between bg-card-bg">
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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-card-border bg-muted-bg/30">
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
