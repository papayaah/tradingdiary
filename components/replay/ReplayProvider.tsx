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

export function ReplayProvider({ children }: { children: ReactNode }) {
  const [activeReplay, setActiveReplay] = useState<ReplayRequest | null>(null);

  const openReplay = useCallback((replay: ReplayRequest) => {
    window.history.pushState(
      { ...window.history.state, tradingDiaryReplayOverlay: true },
      '',
      window.location.href,
    );
    setActiveReplay(replay);
  }, []);

  const closeReplay = useCallback(() => {
    if (window.history.state?.tradingDiaryReplayOverlay) {
      window.history.back();
      return;
    }
    setActiveReplay(null);
  }, []);

  useEffect(() => {
    const handlePopState = () => setActiveReplay(null);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
