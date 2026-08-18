'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Rocket } from 'lucide-react';

const INTRO_VIDEO = '/welcome/Trader_waving_and_giving_thumbs-up_202608132126.mp4';
const LOOP_VIDEO = '/welcome/Animate_fire_and_smoke_loop_202608132332.mp4';

const FIRST_BUBBLE_START = 35 / 30;
const FIRST_BUBBLE_END = 110 / 30;
const SECOND_BUBBLE_START = 115 / 30;
const VIDEO_SWAP_TIME = 165 / 30;
const FIRST_BUBBLE_TEXT = 'Hi! Everything is fine...';
const SECOND_BUBBLE_TEXT =
  "Still a work in progress! I'm building it to help you trade smarter, stay consistent, and stop donating money to the market. Stick around, help shape it, and let's go to da moooon!";

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

function TypewriterText({
  text,
  speed,
  showRocket = false,
}: {
  text: string;
  speed: number;
  showRocket?: boolean;
}) {
  const [visibleLength, setVisibleLength] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frameId = window.requestAnimationFrame(() => setVisibleLength(text.length));
      return () => window.cancelAnimationFrame(frameId);
    }

    let nextLength = 0;
    const intervalId = window.setInterval(() => {
      nextLength += 1;
      setVisibleLength(nextLength);

      if (nextLength >= text.length) {
        window.clearInterval(intervalId);
      }
    }, speed);

    return () => window.clearInterval(intervalId);
  }, [speed, text]);

  const isComplete = visibleLength >= text.length;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, visibleLength)}
        {!isComplete && (
          <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-foreground align-[-0.12em]" />
        )}
        {showRocket && isComplete && (
          <Rocket className="ml-1 inline-block size-[1em] align-[-0.12em] text-accent" />
        )}
      </span>
    </>
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
    <div className="relative w-full aspect-video max-h-[52vh] overflow-hidden bg-muted-bg">
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
        {bubble === 'first' && (
          <SpeechBubble>
            <TypewriterText text={FIRST_BUBBLE_TEXT} speed={42} />
          </SpeechBubble>
        )}
        {bubble === 'second' && (
          <SpeechBubble>
            <TypewriterText text={SECOND_BUBBLE_TEXT} speed={36} showRocket />
          </SpeechBubble>
        )}
      </div>
    </div>
  );
}
