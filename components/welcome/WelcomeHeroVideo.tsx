'use client';

import React, { useCallback, useRef, useState } from 'react';

const INTRO_VIDEO = '/welcome/Trader_waving_and_giving_thumbs-up_202608132126.mp4';
const LOOP_VIDEO = '/welcome/Animate_fire_and_smoke_loop_202608132332.mp4';

const FIRST_BUBBLE_START = 35 / 30;
const FIRST_BUBBLE_END = 110 / 30;
const SECOND_BUBBLE_START = 115 / 30;
const VIDEO_SWAP_TIME = 165 / 30;

type Bubble = 'first' | 'second' | null;

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-[42%] top-[5%] z-10 max-w-[44%] rounded-2xl border-2 sm:border-4 border-foreground bg-card-bg/95 px-3 py-2 text-[10px] font-medium leading-snug text-foreground shadow-lg sm:rounded-3xl sm:px-6 sm:py-4 sm:text-lg md:text-xl">
      {children}
      <span
        aria-hidden
        className="absolute -left-2 bottom-4 h-4 w-4 rotate-45 border-b-2 border-l-2 sm:-left-3 sm:h-6 sm:w-6 sm:border-b-4 sm:border-l-4 border-foreground bg-card-bg"
      />
    </div>
  );
}

export function WelcomeHeroVideo() {
  const loopVideoRef = useRef<HTMLVideoElement>(null);
  const hasSwappedRef = useRef(false);
  const [showLoopVideo, setShowLoopVideo] = useState(false);
  const [bubble, setBubble] = useState<Bubble>(null);

  const swapToLoopVideo = useCallback(() => {
    if (hasSwappedRef.current) return;

    hasSwappedRef.current = true;
    setBubble('second');
    setShowLoopVideo(true);

    const loopVideo = loopVideoRef.current;
    if (loopVideo) {
      loopVideo.currentTime = 0;
      void loopVideo.play().catch(() => {
        // Native controls remain available if autoplay is blocked.
      });
    }
  }, []);

  const handleIntroProgress = (video: HTMLVideoElement) => {
    const currentTime = video.currentTime;

    if (currentTime >= VIDEO_SWAP_TIME) {
      swapToLoopVideo();
      return;
    }

    if (currentTime >= SECOND_BUBBLE_START) {
      setBubble('second');
    } else if (currentTime >= FIRST_BUBBLE_START && currentTime < FIRST_BUBBLE_END) {
      setBubble('first');
    } else {
      setBubble(null);
    }
  };

  return (
    <div className="relative w-full aspect-video max-h-[52vh] overflow-hidden bg-black">
      <video
        src={INTRO_VIDEO}
        autoPlay
        muted
        playsInline
        controls={!showLoopVideo}
        preload="auto"
        onTimeUpdate={(event) => handleIntroProgress(event.currentTarget)}
        onEnded={swapToLoopVideo}
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          showLoopVideo ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      />

      <video
        ref={loopVideoRef}
        src={LOOP_VIDEO}
        loop
        muted
        playsInline
        controls={showLoopVideo}
        preload="auto"
        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-150 ${
          showLoopVideo ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      <div aria-live="polite">
        {bubble === 'first' && <SpeechBubble>Hi! Everything is fine...</SpeechBubble>}
        {bubble === 'second' && (
          <SpeechBubble>
            It&apos;s still a work in progress, but hope you&apos;ll stick around and give Trading Diary a shot!
          </SpeechBubble>
        )}
      </div>
    </div>
  );
}
