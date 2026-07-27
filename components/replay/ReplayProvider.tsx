'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ReplayRequest } from './ReplayModal';

const ReplayModal = dynamic(() => import('./ReplayModal'), { ssr: false });

interface ReplayContextValue {
  openReplay: (replay: ReplayRequest) => void;
  closeReplay: () => void;
}

const ReplayContext = createContext<ReplayContextValue | null>(null);

const REPLAY_SYMBOL_PARAM = 'replaySymbol';
const REPLAY_DATE_PARAM = 'replayDate';

function readReplayFromUrl(): ReplayRequest | null {
  const url = new URL(window.location.href);
  const symbol = url.searchParams.get(REPLAY_SYMBOL_PARAM);
  const date = url.searchParams.get(REPLAY_DATE_PARAM);
  return symbol && date ? { symbol, date } : null;
}

export function ReplayProvider({ children }: { children: ReactNode }) {
  const [activeReplay, setActiveReplay] = useState<ReplayRequest | null>(null);

  const openReplay = useCallback((replay: ReplayRequest) => {
    const url = new URL(window.location.href);
    url.searchParams.set(REPLAY_SYMBOL_PARAM, replay.symbol);
    url.searchParams.set(REPLAY_DATE_PARAM, replay.date);
    window.history.pushState(
      { ...window.history.state, tradingDiaryReplayOverlay: true },
      '',
      url,
    );
    setActiveReplay(replay);
  }, []);

  const closeReplay = useCallback(() => {
    if (window.history.state?.tradingDiaryReplayOverlay) {
      window.history.back();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete(REPLAY_SYMBOL_PARAM);
    url.searchParams.delete(REPLAY_DATE_PARAM);
    window.history.replaceState(window.history.state, '', url);
    setActiveReplay(null);
  }, []);

  useEffect(() => {
    const restoreFrame = requestAnimationFrame(() => {
      setActiveReplay(readReplayFromUrl());
    });
    const handlePopState = () => setActiveReplay(readReplayFromUrl());
    window.addEventListener('popstate', handlePopState);
    return () => {
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const value = useMemo(
    () => ({ openReplay, closeReplay }),
    [closeReplay, openReplay],
  );

  return (
    <ReplayContext.Provider value={value}>
      {children}
      {activeReplay && (
        <ReplayModal
          key={`${activeReplay.date}-${activeReplay.symbol}`}
          replay={activeReplay}
          onClose={closeReplay}
        />
      )}
    </ReplayContext.Provider>
  );
}

export function useReplay() {
  const context = useContext(ReplayContext);
  if (!context) {
    throw new Error('useReplay must be used within ReplayProvider');
  }
  return context;
}
