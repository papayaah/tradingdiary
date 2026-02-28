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
    endTimeSeconds > startTimeSeconds
      ? ((currentTimeSeconds - startTimeSeconds) / (endTimeSeconds - startTimeSeconds)) * 100
      : 0;

  return (
    <div className="rounded-xl border border-card-border bg-card-bg px-5 py-4">
      <div className="flex items-center gap-4">
        {/* Transport controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Reset (Home)"
          >
            <SkipBack size={16} />
          </button>
          <button
            onClick={onSkipBack}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Skip back (←)"
          >
            <SkipBack size={14} />
          </button>
          <button
            onClick={onTogglePlay}
            className="p-2.5 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={onSkipForward}
            className="p-2 rounded-lg text-muted hover:text-foreground hover:bg-sidebar-hover transition-colors"
            title="Skip forward (→)"
          >
            <SkipForward size={14} />
          </button>
        </div>

        {/* Scrubber */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="relative w-full h-1.5 bg-card-border rounded-full">
            <div
              className="absolute top-0 left-0 h-full bg-accent rounded-full transition-[width] duration-75"
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
              className="replay-scrubber absolute left-0 w-full cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted">
            <span>{formatTimeShort(startTimeSeconds)}</span>
            <span>{formatTimeShort(endTimeSeconds)}</span>
          </div>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1 bg-background rounded-lg p-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                speed === s
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-foreground hover:bg-sidebar-hover'
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
