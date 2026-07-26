'use client';

import { useEffect, useRef, useState } from 'react';

export interface WatchStateUpdatePayload {
  watchId: string;
  symbol: string;
  interval: string;
  status: 'normal' | 'bullish' | 'bearish' | 'no-data' | 'error';
  lastPrice?: number | null;
  lastCandleTime?: string | null;
  lastScannedAt?: string | null;
  lastProvider?: string | null;
  lastError?: string | null;
  recentCandles?: any[];
}

export interface WatchAlertPayload {
  alertId: string;
  watchId: string;
  userId: string;
  symbol: string;
  interval: string;
  matchedPattern: string;
  minMovePercent: number;
  candles: any[];
  createdAt: string;
}

export interface WatchStreamEvent {
  seq: number;
  id: string;
  userId: string;
  type: string;
  payload: any;
}

export interface UseServerWatchStreamOptions {
  enabled: boolean;
  initialCursor?: number;
  onStateUpdate?: (payload: WatchStateUpdatePayload) => void;
  onAlert?: (payload: WatchAlertPayload) => void;
  onScannerStatus?: (online: boolean) => void;
}

export function useServerWatchStream({
  enabled,
  initialCursor = 0,
  onStateUpdate,
  onAlert,
  onScannerStatus,
}: UseServerWatchStreamOptions) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<number>(initialCursor);

  // Keep callback refs stable across renders
  const onStateUpdateRef = useRef(onStateUpdate);
  onStateUpdateRef.current = onStateUpdate;

  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  const onScannerStatusRef = useRef(onScannerStatus);
  onScannerStatusRef.current = onScannerStatus;

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    let eventSource: EventSource | null = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled) return;

      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';
      const cursorParam = cursorRef.current > 0 ? `?cursor=${cursorRef.current}` : '';
      const url = `${baseUrl}/api/watch/events${cursorParam}`;

      eventSource = new EventSource(url, { withCredentials: true });

      eventSource.onopen = () => {
        if (!isCancelled) {
          setConnected(true);
          setError(null);
        }
      };

      eventSource.onmessage = (e) => {
        if (isCancelled) return;
        try {
          const event: WatchStreamEvent = JSON.parse(e.data);
          if (event.seq && event.seq > cursorRef.current) {
            cursorRef.current = event.seq;
          }

          if (event.type === 'watch_state' || event.type === 'state_update') {
            onStateUpdateRef.current?.(event.payload);
          } else if (event.type === 'alert') {
            onAlertRef.current?.(event.payload);
          } else if (event.type === 'scanner_heartbeat' || event.type === 'scanner_status') {
            const isOnline = event.payload?.online ?? true;
            onScannerStatusRef.current?.(isOnline);
          }
        } catch (err) {
          console.error('[useServerWatchStream] JSON parse error:', err);
        }
      };

      eventSource.onerror = () => {
        if (!isCancelled) {
          setConnected(false);
          setError('Disconnected from live stream. Retrying...');
          eventSource?.close();
          // Auto reconnect after 5 seconds
          setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      isCancelled = true;
      if (eventSource) {
        eventSource.close();
      }
      setConnected(false);
    };
  }, [enabled]);

  return {
    connected,
    error,
    cursor: cursorRef.current,
  };
}
