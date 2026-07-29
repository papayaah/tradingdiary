'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  X,
  Play,
  TrendingUp,
  Sparkles,
  BarChart3,
  RotateCcw,
  Upload,
  Bell,
  CheckCircle2,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useWelcome } from './WelcomeContext';

interface WelcomeModalProps {
  /** Optional video source URL (e.g. MP4 hosted link, YouTube embed, etc.) */
  videoUrl?: string;
  /** Optional custom title */
  title?: string;
}

export default function WelcomeModal({ videoUrl = '/replay-promo.gif', title }: WelcomeModalProps) {
  const { isOpen, closeWelcomeModal } = useWelcome();
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  if (!isOpen) return null;

  const handleClose = () => {
    closeWelcomeModal(dontShowAgain);
  };

  const isGif = videoUrl.endsWith('.gif');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="relative w-full max-w-4xl bg-card-bg border border-card-border rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col transition-all">
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
          <div className="relative aspect-video w-full rounded-xl border border-card-border overflow-hidden bg-background group shadow-inner">
            {videoUrl && isPlaying ? (
              <div className="relative w-full h-full bg-black flex items-center justify-center">
                <iframe
                  src={videoUrl.includes('youtube') ? `${videoUrl}?autoplay=1` : videoUrl}
                  title="Trading Diary Overview Video"
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                <button
                  onClick={() => setIsPlaying(false)}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-black/70 text-white text-xs font-semibold backdrop-blur-sm hover:bg-black/90 transition-colors"
                >
                  Close Video
                </button>
              </div>
            ) : (
              <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-accent/10 via-background to-muted-bg/80 p-6 text-center">
                {/* Decorative Background Pattern */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/20 via-transparent to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col items-center gap-4">
                  <button
                    onClick={() => setIsPlaying(true)}
                    className="relative group/btn flex items-center justify-center w-16 h-16 rounded-full bg-accent text-white shadow-xl shadow-accent/40 hover:scale-105 active:scale-95 transition-all duration-200"
                    aria-label="Play Walkthrough Video"
                  >
                    <Play size={26} className="ml-1 fill-white" />
                    <span className="absolute -inset-1 rounded-full bg-accent/40 animate-ping pointer-events-none" />
                  </button>

                  <div>
                    <span className="text-xs font-bold text-accent uppercase tracking-widest block mb-1">
                      Full Product Overview Video
                    </span>
                    <h3 className="text-base font-bold text-foreground">
                      See How Trading Diary Transforms Your Edge
                    </h3>
                    <p className="text-xs text-muted max-w-md mt-1">
                      Watch the complete product walkthrough demonstrating analytics, pattern detection, trade replays, and broker imports.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Value Proposition Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-muted-bg/50 border border-card-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-2.5">
                  <BarChart3 size={18} />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Visual Analytics</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Track cumulative P&L, hold times, and win rates with real-time interactive charts.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-muted-bg/50 border border-card-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-2.5">
                  <Bell size={18} />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Market Pattern Watch</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Scan symbols for technical price patterns and receive real-time alert notifications.
                </p>
              </div>
            </div>

            {/* Full-Bleed Replay Vertical Video Feature Card (No Overlays) */}
            <div className="relative rounded-xl border border-card-border hover:border-accent/40 transition-all overflow-hidden group min-h-[180px] flex flex-col justify-between bg-black">
              <img
                src="/replay-promo.gif"
                alt="Bar-by-Bar Trade Replay Short"
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300 min-h-[180px]"
              />
            </div>

            <div className="p-4 rounded-xl bg-muted-bg/50 border border-card-border hover:border-accent/40 transition-colors flex flex-col justify-between">
              <div>
                <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-2.5">
                  <Upload size={18} />
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Multi-Broker Import</h4>
                <p className="text-xs text-muted leading-relaxed">
                  Seamlessly import CSV trade logs from all major brokers with automated formatting.
                </p>
              </div>
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
