'use client';

import { useEffect, useRef, useState } from 'react';

export interface WatchStateUpdatePayload {
  watchId: string;
  symbol: string;
  interval: string;
  patternId: string;
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
  direction: 'bullish' | 'bearish';
  patternId: string;
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

    // Resume from the snapshot cursor on enable, but never rewind: in-effect
    // reconnects advance cursorRef past it as events arrive. initialCursor is in
    // the dep array, so this re-runs when the snapshot cursor resolves (the
    // stream is typically enabled only at that point anyway).
    if (initialCursor > cursorRef.current) {
      cursorRef.current = initialCursor;
    }

    let eventSource: EventSource | null = null;
    let isCancelled = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    // Last time ANY message (including a heartbeat) arrived. A stream can die
    // silently — NAT timeout, sleep/wake, captive portal — without firing
    // onerror; the watchdog below detects that gap and forces a reconnect.
    let lastMessageAt = Date.now();

    function scheduleReconnect() {
      if (isCancelled || reconnectTimer) return;
      // Exponential backoff with jitter, capped, so a server restart does not
      // trigger a synchronized reconnect storm across every open tab.
      const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempts) + Math.random() * 1_000;
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function forceReconnect() {
      if (isCancelled) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      eventSource?.close();
      connect();
    }

    function connect() {
      if (isCancelled) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';
      const cursorParam = cursorRef.current > 0 ? `?cursor=${cursorRef.current}` : '';
      const url = `${baseUrl}/api/watch/events${cursorParam}`;

      eventSource = new EventSource(url, { withCredentials: true });
      lastMessageAt = Date.now();

      eventSource.onopen = () => {
        if (!isCancelled) {
          reconnectAttempts = 0;
          lastMessageAt = Date.now();
          setConnected(true);
          setError(null);
        }
      };

      eventSource.onmessage = (e) => {
        if (isCancelled) return;
        lastMessageAt = Date.now();
        try {
          const event: WatchStreamEvent = JSON.parse(e.data);
          if (event.seq && event.seq > cursorRef.current) {
            cursorRef.current = event.seq;
          }

          if (event.type === 'watch.state' || event.type === 'watch_state' || event.type === 'state_update') {
            onStateUpdateRef.current?.(event.payload);
          } else if (event.type === 'alert.created' || event.type === 'alert') {
            onAlertRef.current?.(event.payload);
          } else if (event.type === 'scanner_heartbeat' || event.type === 'scanner_status') {
            const isOnline = event.payload?.online ?? true;
            onScannerStatusRef.current?.(isOnline);
          }
          // 'stream.heartbeat' needs no handling beyond the lastMessageAt bump above.
        } catch (err) {
          console.error('[useServerWatchStream] JSON parse error:', err);
        }
      };

      eventSource.onerror = () => {
        if (!isCancelled) {
          setConnected(false);
          setError('Disconnected from live stream. Retrying...');
          eventSource?.close();
          scheduleReconnect();
        }
      };
    }

    connect();

    // Watchdog: if no message (data or heartbeat, ~20s cadence) arrives within
    // ~2.5x the heartbeat interval, treat the stream as dead and reconnect.
    const watchdog = setInterval(() => {
      if (isCancelled) return;
      if (Date.now() - lastMessageAt > 50_000) {
        setConnected(false);
        forceReconnect();
      }
    }, 15_000);

    // Wake-from-sleep / tab-refocus: the socket may be dead with no error fired.
    const onVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        (!eventSource || eventSource.readyState !== EventSource.OPEN)
      ) {
        forceReconnect();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
      }
      setConnected(false);
    };
  }, [enabled, initialCursor]);

  return {
    connected,
    error,
    cursor: cursorRef.current,
  };
}
