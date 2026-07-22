'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import type { PlaybackSpeed } from '@/lib/replay/engine';

interface ReplayControlsProps {
  isPlaying: boolean;
  speed: PlaybackSpeed;
  currentTimeSeconds: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  onTogglePlay: () => void;
  onSetSpeed: (s: PlaybackSpeed) => void;
  onSeek: (timeSeconds: number) => void;
  onReset: () => void;
  onSkipForward: () => void;
  onSkipBack: () => void;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 5, 10];

export default function ReplayControls({
  isPlaying,
  speed,
  currentTimeSeconds,
  startTimeSeconds,
  endTimeSeconds,
  onTogglePlay,
  onSetSpeed,
  onSeek,
  onReset,
  onSkipForward,
  onSkipBack,
}: ReplayControlsProps) {
  const wasPlayingRef = useRef(false);

  const handleScrubStart = useCallback(() => {
    wasPlayingRef.current = isPlaying;
    if (isPlaying) onTogglePlay();
  }, [isPlaying, onTogglePlay]);

  const handleScrubEnd = useCallback(() => {
    if (wasPlayingRef.current && !isPlaying) onTogglePlay();
  }, [isPlaying, onTogglePlay]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          onTogglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onSkipBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onSkipForward();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onTogglePlay, onSkipBack, onSkipForward]);

  const progress =
    endTimeSeconds > startTimeSeconds && !isNaN(currentTimeSeconds)
      ? ((currentTimeSeconds - startTimeSeconds) / (endTimeSeconds - startTimeSeconds)) * 100
      : 0;

  return (
    <div className="rounded-2xl border border-card-border/50 bg-card-bg/40 backdrop-blur-md px-6 py-5 shadow-sm">
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Transport controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onReset}
            className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-muted-bg/50 transition-all active:scale-95"
            title="Reset (Home)"
          >
            <SkipBack size={18} />
          </button>
          <button
            onClick={onSkipBack}
            className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-muted-bg/50 transition-all active:scale-95"
            title="Skip back (←)"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={onTogglePlay}
            className="p-4 rounded-2xl bg-accent text-white hover:bg-accent/90 transition-all shadow-[0_0_15px_rgba(var(--accent-rgb),0.3)] active:scale-90"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
          </button>
          <button
            onClick={onSkipForward}
            className="p-2.5 rounded-xl text-muted hover:text-foreground hover:bg-muted-bg/50 transition-all active:scale-95"
            title="Skip forward (→)"
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* Scrubber */}
        <div className="flex-1 flex flex-col gap-2 w-full">
          <div className="relative w-full h-2 bg-muted-bg/50 rounded-full shadow-inner overflow-hidden">
            <div
              className={`absolute top-0 left-0 h-full bg-accent rounded-full transition-[width] duration-300 ${isPlaying ? 'ease-linear' : 'ease-out'}`}
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={startTimeSeconds}
              max={endTimeSeconds}
              step={1}
              value={currentTimeSeconds}
              onPointerDown={handleScrubStart}
              onPointerUp={handleScrubEnd}
              onChange={(e) => onSeek(Number(e.target.value))}
              className="replay-scrubber absolute left-0 w-full cursor-pointer h-full z-10 opacity-0"
            />
          </div>
          <div className="flex justify-between px-1">
            <span className="text-[10px] font-black text-muted uppercase tracking-widest">{formatTimeShort(startTimeSeconds)}</span>
            <span className="text-[10px] font-black text-accent uppercase tracking-widest bg-accent/5 px-2 py-0.5 rounded-md border border-accent/10">
              {formatTimeShort(currentTimeSeconds)}
            </span>
            <span className="text-[10px] font-black text-muted uppercase tracking-widest">{formatTimeShort(endTimeSeconds)}</span>
          </div>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1 bg-muted-bg/50 p-1.5 rounded-2xl border border-card-border/40">
          <div className="px-2 text-[9px] font-bold text-muted uppercase tracking-tighter border-r border-card-border/50 mr-1">Speed</div>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-3 py-1.5 text-[10px] font-black rounded-xl transition-all ${speed === s
                ? 'bg-accent text-white shadow-sm'
                : 'text-muted hover:text-foreground hover:bg-muted-bg/80'
                }`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatTimeShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
