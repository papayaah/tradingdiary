'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  BellOff, 
  Plus, 
  Volume2, 
  VolumeX, 
  CheckCircle2, 
  AlertTriangle,
  Clock,
  Search,
  Sliders,
  ChartCandlestick,
  Bitcoin,
  Moon,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles
} from 'lucide-react';
import { getChartDB } from '@/lib/chart/cache';
import AlertHistoryPanel from './AlertHistoryPanel';
import LightweightPatternChart from '@/components/chart/LightweightPatternChart';
import {
  BatchScanControl,
  ScanCountdown,
  TickerInput,
  WatchlistViewToggle,
  type BatchScanControlHandle,
  type TickerInputHandle,
  type WatchlistView,
} from './WatchControls';
import {
  detectPattern,
  DEFAULT_PATTERN_SETTINGS,
  isPatternId,
  normalizePatternSettings,
  scanAllPatterns,
  type Candle,
  type PatternId,
  type PatternMatch,
  type PatternSettings,
} from './watchAnalysis';
import PatternGuidePanel from './PatternGuidePanel';
import PatternTesterSection from './PatternTesterSection';
import WatchlistRow from './WatchlistRow';
import CompactWatchlist, {
  type CompactWatchlistEntry,
} from './CompactWatchlist';
import { authClient } from '@/lib/auth-client';
import {
  useServerWatchStream,
  type WatchStateUpdatePayload,
} from '@/hooks/useServerWatchStream';
import {
  calculateEquityIntradayChange,
  type IntradayChange,
} from '@/lib/market/intraday-change';
import { buildScannerSyncWatchlist } from '@/lib/watch/sync-settings';

interface WatchItem {
  symbol: string;
  interval: string;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'no-data' | 'error';
  lastPrice?: number;
  lastError?: string;
  candles?: Candle[];
  lastAlertedCandleTime?: number;
  lastAlertedType?: 'bullish' | 'bearish';
  lastAlertedPatternId?: PatternId;
}

interface AlertLog {
  id: string;
  createdAt: number;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  price: number;
  intradayChange?: number | null;
  intradayChangePercent?: number | null;
  candles?: Candle[];
}

interface PendingAlert {
  createdAt: number;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  price: number;
  intradayChange?: number | null;
  intradayChangePercent?: number | null;
  candles?: Candle[];
}

interface ServerSnapshotAlert {
  id: string;
  watchId: string;
  createdAt?: string | null;
  symbol: string;
  interval: string;
  direction?: string;
  message?: string | null;
  patternId?: string | null;
  price?: number | null;
  intradayChange?: number | null;
  intradayChangePercent?: number | null;
}

interface ServerSnapshotState {
  watchId: string;
  recentCandles?: Candle[] | null;
}

const ALERT_HISTORY_TTL_MS = 10 * 60 * 1000;
const MAX_ALERT_HISTORY_ITEMS = 50;
type WatchlistCategory = 'stocks' | 'crypto' | 'futures' | 'all';
// Categories that can be switched off for background scanning/alerts. Mapped to
// the server's asset-class names for the sync payload.
type ScanCategory = 'stocks' | 'crypto' | 'futures';
const CATEGORY_TO_ASSET_CLASS: Record<ScanCategory, string> = {
  stocks: 'equity',
  crypto: 'crypto',
  futures: 'futures',
};

const isFuturesSymbol = (symbol: string) => symbol.toUpperCase().includes('=F');
const isCryptoSymbol = (symbol: string) => symbol.toUpperCase().endsWith('-USD');

const FUTURES_QUICK_PRESETS = [
  { label: 'NQ (Nasdaq)', symbol: 'NQ=F' },
  { label: 'ES (S&P 500)', symbol: 'ES=F' },
  { label: 'YM (Dow)', symbol: 'YM=F' },
  { label: 'RTY (Russell)', symbol: 'RTY=F' },
  { label: 'CL (Oil)', symbol: 'CL=F' },
  { label: 'GC (Gold)', symbol: 'GC=F' },
  { label: 'SI (Silver)', symbol: 'SI=F' },
  { label: 'ZB (Bonds)', symbol: 'ZB=F' },
  { label: 'BTC (CME BTC)', symbol: 'BTC=F' },
] as const;

function get4HourCandleCount(interval: string): number {
  const clean = interval.replace(/[ms]/g, '');
  const val = parseInt(clean, 10) || 5;
  const isHour = interval.endsWith('h');
  const minutesPerCandle = isHour ? val * 60 : val;
  const count = Math.ceil((4 * 60) / Math.max(1, minutesPerCandle));
  return Math.max(4, count);
}

const pruneAlertHistory = (logs: AlertLog[], now = Date.now()) =>
  logs
    .filter((log) => Number.isFinite(log.createdAt) && now - log.createdAt < ALERT_HISTORY_TTL_MS)
    .slice(0, MAX_ALERT_HISTORY_ITEMS);

const mapSnapshotAlerts = (snapshot: {
  alerts?: ServerSnapshotAlert[];
  states?: ServerSnapshotState[];
}): AlertLog[] => {
  const candlesByWatchId = new Map(
    (snapshot.states ?? []).map((state) => [
      state.watchId,
      Array.isArray(state.recentCandles) ? state.recentCandles : [],
    ]),
  );

  return pruneAlertHistory(
    (snapshot.alerts ?? []).map((alert) => ({
      id: alert.id,
      createdAt: alert.createdAt ? new Date(alert.createdAt).getTime() : Date.now(),
      symbol: alert.symbol,
      interval: alert.interval,
      type: alert.direction === 'bearish' ? 'bearish' : 'bullish',
      details: alert.message || `${alert.patternId || 'Pattern'} on ${alert.symbol} (${alert.interval})`,
      price: alert.price ?? 0,
      intradayChange: alert.intradayChange,
      intradayChangePercent: alert.intradayChangePercent,
      candles: candlesByWatchId.get(alert.watchId) ?? [],
    })),
  );
};

const getPersistedWatchlist = (items: WatchItem[]): WatchItem[] =>
  items.map((item) => ({
    symbol: item.symbol,
    interval: item.interval,
    lastAlertedCandleTime: item.lastAlertedCandleTime,
    lastAlertedType: item.lastAlertedType,
    lastAlertedPatternId: item.lastAlertedPatternId,
  }));

const persistWatchlist = (items: WatchItem[]) => {
  localStorage.setItem('watcher-watchlist', JSON.stringify(getPersistedWatchlist(items)));
};

// Per-fetch chunk size (also the initial window). Sized per interval so each
// pull is a meaningful step (few round-trips to reach the cap) without an
// enormous single payload. More history streams in as the user pans to the edge.
const historyLookbackDays = (interval: string): number => {
  const iv = interval.toLowerCase();
  if (iv === '1d' || iv === 'd') return 730;
  if (iv === '1h') return 90;
  if (iv === '45m') return 60;
  if (iv === '30m') return 45;
  if (iv === '15m') return 30;
  if (iv === '10m') return 15;
  if (iv === '5m') return 7;
  return 2; // 1m / 2m
};

// Hard cap on total history per interval (deep — months to years). Once the
// loaded range spans this many days we stop paging; the user then scrolls
// within the loaded window. The view stays readable regardless (minBarSpacing),
// so depth here only affects how far back you can pan, not on-screen density.
const historyMaxLookbackDays = (interval: string): number => {
  const iv = interval.toLowerCase();
  if (iv === '1d' || iv === 'd') return 3650; // ~10 years of daily bars
  if (iv === '1h') return 730; // ~2 years
  if (iv === '45m') return 365; // ~1 year
  if (iv === '30m') return 270; // ~9 months
  if (iv === '15m') return 180; // ~6 months
  if (iv === '10m') return 90; // ~3 months (past June)
  if (iv === '5m') return 30; // ~1 month
  return 7; // 1m / 2m — ~1 week
};

// Absolute safety ceiling on candle count regardless of interval, so a
// misbehaving feed can never balloon the chart beyond what's usable.
const HISTORY_MAX_CANDLES = 20000;

// Client-side cache using existing 'tradingdiary-charts' IndexedDB ohlc store
async function getLiveCache(symbol: string, interval: string) {
  if (typeof window === 'undefined') return null;
  try {
    const db = await getChartDB();
    const key = `live|${symbol.toUpperCase()}|${interval}`;
    const record = await db.get('ohlc', key);
    // 60-second TTL (Time To Live) to prevent duplicate calls but ensure fresh data
    if (record && Date.now() - record.fetchedAt < 60000) {
      return record;
    }
  } catch (e) {
    // Fail silently if store or db doesn't exist yet
  }
  return null;
}

async function setLiveCache(symbol: string, interval: string, candles: Candle[], provider: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await getChartDB();
    const key = `live|${symbol.toUpperCase()}|${interval}`;
    await db.put('ohlc', {
      symbol: symbol.toUpperCase(),
      interval,
      candles,
      provider,
      fetchedAt: Date.now()
    }, key);
  } catch (e) {}
}

export default function MarketWatcher() {
  // Watchlist & Config State
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const tickerInputRef = useRef<TickerInputHandle>(null);
  const batchScanControlRef = useRef<BatchScanControlHandle>(null);
  const globalMinMoveSyncTimerRef = useRef<number | null>(null);
  const pendingServerStateUpdatesRef = useRef(
    new Map<string, WatchStateUpdatePayload>(),
  );
  const serverStateFlushTimerRef = useRef<number | null>(null);
  const [newInterval, setNewInterval] = useState('10m');
  const [newMinMove, setNewMinMove] = useState(0.25);

  // Tester State
  const [testSymbol, setTestSymbol] = useState('TSLA');
  const [testInterval, setTestInterval] = useState('10m');
  const [testMinMove, setTestMinMove] = useState(0.15);
  const [testSessionFilter, setTestSessionFilter] = useState<'all' | 'rth' | 'ext'>('all');
  const [testCurrentDayOnly, setTestCurrentDayOnly] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    patternMatched: 'bullish' | 'bearish' | 'none';
    message: string;
    candles: Candle[];
    provider: string;
    allMatches: PatternMatch[];
  } | null>(null);

  // Infinite history for the manual tester chart: fetch older chunks as the user
  // pans left. Refs mirror the state so the async loader avoids stale closures.
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const isLoadingHistoryRef = useRef(false);
  const hasMoreHistoryRef = useRef(true);
  // Latest tester values for the async history loader (avoids stale closures).
  const testResultRef = useRef<typeof testResult>(null);
  const testSymbolRef = useRef('');
  const testIntervalRef = useRef('');
  useEffect(() => {
    testResultRef.current = testResult;
    testSymbolRef.current = testSymbol;
    testIntervalRef.current = testInterval;
  });

  const [activeTab, setActiveTab] = useState<'watchlist' | 'tester'>(() => {
    if (typeof window === 'undefined') return 'watchlist';
    const saved = localStorage.getItem('watcher-active-tab');
    return saved === 'tester' ? 'tester' : 'watchlist';
  });
  const [nextScanIndex, setNextScanIndex] = useState(0);
  
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [watchlistView, setWatchlistView] = useState<WatchlistView>('compact');

  // Settings & Notification States
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  // Ask the server for the fastest supported cadence. Its shared governor may
  // slow acquisition for the whole provider pool as demand grows.
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState(0.25);
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const alertLogsRef = useRef<AlertLog[]>([]);
  alertLogsRef.current = alertLogs;
  const alertPersistTimerRef = useRef<number | null>(null);
  const [addNotice, setAddNotice] = useState<{
    type: 'success' | 'duplicate' | 'error';
    message: string;
  } | null>(null);
  const addNoticeTimerRef = useRef<number | null>(null);
  const [isPolygonActive, setIsPolygonActive] = useState(false);
  const [isScannerPaused, setIsScannerPaused] = useState(false);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(true); // pause scanner outside chosen session
  const [activeWindow, setActiveWindow] = useState<'rth' | 'pre' | 'ext' | 'all'>('pre'); // which session the scanner runs in
  const [marketOpen, setMarketOpen] = useState(true);
  const [parallelScanEnabled, setParallelScanEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('watcher-parallel-scan');
    return saved !== null ? saved === 'true' : true;
  });
  const [requiredCandleCount, setRequiredCandleCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    const saved = localStorage.getItem('watcher-consecutive-candles');
    return saved !== null ? parseInt(saved, 10) : 3;
  });
  const [maxBodyOverlapPercent, setMaxBodyOverlapPercent] = useState<number>(() => {
    if (typeof window === 'undefined') return 100;
    const saved = Number(localStorage.getItem('watcher-max-body-overlap-percent'));
    return Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 100;
  });
  const [selectedPatternId, setSelectedPatternId] = useState<PatternId>(() => {
    if (typeof window === 'undefined') return 'consecutive';
    const saved = localStorage.getItem('watcher-selected-pattern');
    return isPatternId(saved) ? saved : 'consecutive';
  });
  const [patternSettings, setPatternSettings] = useState<PatternSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_PATTERN_SETTINGS;
    try {
      return normalizePatternSettings(
        JSON.parse(localStorage.getItem('watcher-pattern-settings') ?? 'null'),
      );
    } catch {
      return DEFAULT_PATTERN_SETTINGS;
    }
  });
  // Sorting state for Watchlist table
  const [sortColumn, setSortColumn] = useState<'symbol' | 'interval' | 'status' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const { data: sessionData } = authClient.useSession();
  const isAuthenticated = !!sessionData?.user;
  // When signed in, the server scanner is authoritative and the browser must be
  // a pure viewer (snapshot + SSE), not a second market-data fetcher. A ref lets
  // the interval loop read the latest value without re-subscribing.
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  // Event cursor captured from the initial snapshot. The SSE stream must resume
  // from here rather than seq 0, otherwise every page load replays the entire
  // event history and re-fires notifications for hours-old alerts (spec B6).
  const [snapshotCursor, setSnapshotCursor] = useState<number | null>(null);

  // Whether an active Web Push subscription exists. When true, the service
  // worker owns the OS banner (it fires even with the tab closed and is required
  // to by Chrome's userVisibleOnly contract), so the page must not also fire one
  // for the same alert (spec B4). The in-app log and sound still run here.
  const pushActiveRef = useRef(false);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        pushActiveRef.current = !!sub;
      })
      .catch(() => {});
  }, []);

  const flushServerStateUpdates = React.useCallback(() => {
    serverStateFlushTimerRef.current = null;
    if (pendingServerStateUpdatesRef.current.size === 0) return;

    const updates = pendingServerStateUpdatesRef.current;
    pendingServerStateUpdatesRef.current = new Map();

    React.startTransition(() => {
      setWatchlist((current) => {
        let changed = false;
        const next = current.map((item) => {
          const data = updates.get(
            `${item.symbol.toUpperCase()}\u0000${item.interval}`,
          );
          if (!data) return item;

          const mappedStatus: WatchItem['status'] =
            data.status === 'bullish' || data.status === 'bearish'
              ? data.status
              : data.status === 'no-data' || data.status === 'error'
                ? data.status
                : 'none';
          changed = true;
          return {
            ...item,
            status: mappedStatus,
            lastPrice: data.lastPrice ?? item.lastPrice,
            lastChecked: data.lastScannedAt
              ? new Date(data.lastScannedAt).toLocaleTimeString()
              : new Date().toLocaleTimeString(),
            candles:
              data.recentCandles && data.recentCandles.length > 0
                ? data.recentCandles
                : item.candles,
            lastError: data.lastError ?? item.lastError,
          };
        });
        return changed ? next : current;
      });
    });
  }, []);

  const scheduleServerStateFlush = React.useCallback((delay = 50) => {
    if (
      serverStateFlushTimerRef.current !== null
      || pendingServerStateUpdatesRef.current.size === 0
    ) {
      return;
    }
    serverStateFlushTimerRef.current = window.setTimeout(
      flushServerStateUpdates,
      delay,
    );
  }, [flushServerStateUpdates]);

  const queueServerStateUpdate = React.useCallback((
    data: WatchStateUpdatePayload,
  ) => {
    if (!data?.symbol) return;
    pendingServerStateUpdatesRef.current.set(
      `${data.symbol.toUpperCase()}\u0000${data.interval}`,
      data,
    );

    // Let hidden tabs accumulate only the latest state per symbol. The
    // visibility handler flushes one consolidated update after Chrome paints.
    if (document.visibilityState === 'visible') {
      scheduleServerStateFlush();
    }
  }, [scheduleServerStateFlush]);

  useEffect(() => {
    const flushAfterTabPaint = () => {
      if (document.visibilityState === 'visible') {
        window.requestAnimationFrame(() => scheduleServerStateFlush(0));
      }
    };
    document.addEventListener('visibilitychange', flushAfterTabPaint);
    return () => {
      document.removeEventListener('visibilitychange', flushAfterTabPaint);
    };
  }, [scheduleServerStateFlush]);

  // Server-side Live SSE Stream Integration
  const { connected: isSseConnected } = useServerWatchStream({
    // Hold the connection until the snapshot cursor is known so we resume from
    // it instead of replaying history.
    enabled: isAuthenticated && snapshotCursor !== null,
    initialCursor: snapshotCursor ?? 0,
    onStateUpdate: queueServerStateUpdate,
    onAlert: (data) => {
      if (!data?.symbol) return;
      const type: 'bullish' | 'bearish' = data.direction === 'bearish' ? 'bearish' : 'bullish';
      const msg = `${type.toUpperCase()} move on ${data.symbol} (${data.interval}). Matched ${data.matchedPattern}.`;

      const alertId = data.alertId || `alert-${Date.now()}-${Math.random()}`;
      const createdAtMs = data.createdAt ? new Date(data.createdAt).getTime() : Date.now();
      const newAlert: AlertLog = {
        id: alertId,
        createdAt: createdAtMs,
        symbol: data.symbol,
        interval: data.interval,
        type,
        details: msg,
        price: data.price ?? data.candles?.[data.candles.length - 1]?.close ?? 0,
        intradayChange: data.intradayChange,
        intradayChangePercent: data.intradayChangePercent,
        candles: data.candles || [],
      };

      // Always record in the log, but merge by id so a snapshot entry and its
      // replayed stream event do not appear twice (spec B6c).
      setAlertLogs((prev) => {
        if (prev.some((a) => a.id === alertId)) return prev;
        return [newAlert, ...prev].slice(0, 100);
      });

      // Only alert (sound + banner) for genuinely fresh events. A reconnect after
      // a long offline period legitimately replays a backlog; firing a banner per
      // item would be wrong (spec B6b).
      const isFresh = Date.now() - createdAtMs < 120_000;
      if (!isFresh) return;

      if (isSoundEnabled) playAlertSound(type);
      // When push is active the service worker fires the OS banner (works with
      // the tab closed too); firing here as well would double-notify (spec B4).
      if (!pushActiveRef.current) {
        sendDesktopNotification(data.symbol, type, msg, data.candles, `${data.symbol}-${data.interval}-${type}`);
      }
    },
  });

  // Load initial snapshot when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';
    fetch(`${baseUrl}/api/watch/state`)
      .then((res) => (res.ok ? res.json() : null))
      .then((snapshot) => {
        if (!snapshot) {
          // Fall back to seq 0 so the stream still connects if the snapshot fails.
          setSnapshotCursor(0);
          return;
        }
        if (Array.isArray(snapshot.alerts)) {
          setAlertLogs(mapSnapshotAlerts(snapshot));
        }
        // Capture the cursor last so the stream connects resuming from here.
        setSnapshotCursor(typeof snapshot.cursor === 'number' ? snapshot.cursor : 0);
      })
      .catch((err) => {
        console.error('[snapshot] fetch error:', err);
        setSnapshotCursor(0);
      });
  }, [isAuthenticated]);

  // Search, Category, and Filtering state for Watchlist table
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoPatternsEnabled, setAutoPatternsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('watcher-auto-patterns');
    return saved !== null ? saved === 'true' : true;
  });

  const handleToggleAutoPatterns = React.useCallback(() => {
    setAutoPatternsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('watcher-auto-patterns', String(next));
      return next;
    });
  }, []);
  const [filterMode, setFilterMode] = useState<'all' | 'alerts' | 'errors'>('all');
  const [watchlistCategory, setWatchlistCategory] = useState<WatchlistCategory>('stocks');
  // Asset classes the user has switched off. Synced to the server so the scanner
  // skips them entirely (no scans/alerts/push); a ref mirrors it so every
  // syncScannerSettings call includes the current value without a signature change.
  const [disabledCategories, setDisabledCategories] = useState<ScanCategory[]>([]);
  const disabledCategoriesRef = useRef<ScanCategory[]>([]);
  disabledCategoriesRef.current = disabledCategories;
  const handleWatchlistViewChange = React.useCallback((view: WatchlistView) => {
    setWatchlistView(view);
    localStorage.setItem('watcher-watchlist-view', view);
  }, []);

  const handleSort = (column: 'symbol' | 'interval' | 'status') => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const categoryItems = React.useMemo(() => {
    if (watchlistCategory === 'stocks') {
      return watchlist.filter((w) => !isFuturesSymbol(w.symbol) && !isCryptoSymbol(w.symbol));
    }
    if (watchlistCategory === 'crypto') {
      return watchlist.filter((w) => isCryptoSymbol(w.symbol));
    }
    if (watchlistCategory === 'futures') {
      return watchlist.filter((w) => isFuturesSymbol(w.symbol));
    }
    return watchlist;
  }, [watchlist, watchlistCategory]);

  const syncScannerSettings = React.useCallback((
    items: WatchItem[],
    patternId: PatternId = selectedPatternId,
    session = activeWindow,
    frequencyMinutes = scanIntervalMinutes,
    minMovePercent = newMinMove,
    requiredCount = requiredCandleCount,
    bodyOverlapOverride = maxBodyOverlapPercent,
    settingsOverride = patternSettings,
  ) => {
    const cleanList = buildScannerSyncWatchlist(items);
    return fetch('/api/watch/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        watchlist: cleanList,
        patternId,
        minMovePercent,
        requiredCandleCount: requiredCount,
        maxBodyOverlapPercent: bodyOverlapOverride,
        patternSettings: settingsOverride,
        session,
        scanFrequencySeconds: Math.round(frequencyMinutes * 60),
        disabledAssetClasses: disabledCategoriesRef.current.map((c) => CATEGORY_TO_ASSET_CLASS[c]),
      }),
    });
  }, [
    activeWindow,
    newMinMove,
    maxBodyOverlapPercent,
    requiredCandleCount,
    scanIntervalMinutes,
    selectedPatternId,
    patternSettings,
  ]);

  const handleGlobalIntervalChange = React.useCallback((interval: string) => {
    setNewInterval(interval);
    localStorage.setItem('watcher-new-interval', interval);
    setWatchlist((current) => {
      const updated = current.map((item) => ({ ...item, interval }));
      persistWatchlist(updated);
      void syncScannerSettings(
        updated,
        selectedPatternId,
        activeWindow,
        scanIntervalMinutes,
        newMinMove,
        requiredCandleCount,
        maxBodyOverlapPercent,
      ).catch(() => {});
      return updated;
    });
  }, [
    activeWindow,
    maxBodyOverlapPercent,
    newMinMove,
    requiredCandleCount,
    scanIntervalMinutes,
    selectedPatternId,
    syncScannerSettings,
  ]);

  const handleMaxBodyOverlapChange = React.useCallback((value: number) => {
    const normalized = Math.max(0, Math.min(100, value));
    setMaxBodyOverlapPercent(normalized);
    localStorage.setItem(
      'watcher-max-body-overlap-percent',
      String(normalized),
    );
    void syncScannerSettings(
      watchlistRef.current,
      selectedPatternId,
      activeWindow,
      scanIntervalMinutes,
      newMinMove,
      requiredCandleCount,
      normalized,
    ).catch(() => {});
  }, [
    activeWindow,
    newMinMove,
    requiredCandleCount,
    scanIntervalMinutes,
    selectedPatternId,
    syncScannerSettings,
  ]);

  const handlePatternSettingsChange = React.useCallback((value: PatternSettings) => {
    const normalized = normalizePatternSettings(value);
    setPatternSettings(normalized);
    localStorage.setItem('watcher-pattern-settings', JSON.stringify(normalized));

    setWatchlist((current) => current.map((item) => {
      if (!item.candles?.length) return item;
      const { matched } = detectPattern(
        item.candles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        normalized,
      );
      return { ...item, status: matched };
    }));
    setTestResult((prev) => {
      if (!prev || !prev.candles?.length) return prev;
      const { matched, message } = detectPattern(
        prev.candles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        normalized,
      );
      const allMatches = scanAllPatterns(
        prev.candles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        normalized,
      );
      return { ...prev, patternMatched: matched, message, allMatches };
    });

    void syncScannerSettings(
      watchlistRef.current,
      selectedPatternId,
      activeWindow,
      scanIntervalMinutes,
      newMinMove,
      requiredCandleCount,
      maxBodyOverlapPercent,
      normalized,
    ).catch(() => {});
  }, [
    activeWindow,
    maxBodyOverlapPercent,
    newMinMove,
    requiredCandleCount,
    scanIntervalMinutes,
    selectedPatternId,
    syncScannerSettings,
  ]);

  const handleNewMinMoveChange = React.useCallback((value: number) => {
    const normalized = Math.max(0.05, Math.min(3, value));
    setNewMinMove(normalized);
    localStorage.setItem('watcher-new-min-move', String(normalized));
    setWatchlist((current) => current.map((item) => {
      if (!item.candles?.length) return item;
      const { matched } = detectPattern(
        item.candles,
        normalized,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...item, status: matched };
    }));
    if (expandedRowIndex !== null) setTestMinMove(normalized);

    setTestResult((prev) => {
      if (!prev || !prev.candles?.length) return prev;
      const { matched, message } = detectPattern(
        prev.candles,
        normalized,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      const allMatches = scanAllPatterns(
        prev.candles,
        normalized,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...prev, patternMatched: matched, message, allMatches };
    });

    if (globalMinMoveSyncTimerRef.current !== null) {
      window.clearTimeout(globalMinMoveSyncTimerRef.current);
    }
    globalMinMoveSyncTimerRef.current = window.setTimeout(() => {
      void syncScannerSettings(
        watchlistRef.current,
        selectedPatternId,
        activeWindow,
        scanIntervalMinutes,
        normalized,
      ).catch(() => {});
      globalMinMoveSyncTimerRef.current = null;
    }, 300);
  }, [
    activeWindow,
    expandedRowIndex,
    maxBodyOverlapPercent,
    requiredCandleCount,
    scanIntervalMinutes,
    selectedPatternId,
    syncScannerSettings,
    patternSettings,
  ]);

  const handleRequiredCandleCountChange = React.useCallback((value: number) => {
    const normalized = Math.max(2, Math.min(10, Math.round(value)));
    setRequiredCandleCount(normalized);
    localStorage.setItem('watcher-consecutive-candles', String(normalized));
    setWatchlist((current) => current.map((item) => {
      if (!item.candles?.length) return item;
      const { matched } = detectPattern(
        item.candles,
        newMinMove,
        normalized,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...item, status: matched };
    }));

    setTestResult((prev) => {
      if (!prev || !prev.candles?.length) return prev;
      const { matched, message } = detectPattern(
        prev.candles,
        newMinMove,
        normalized,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      const allMatches = scanAllPatterns(
        prev.candles,
        newMinMove,
        normalized,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...prev, patternMatched: matched, message, allMatches };
    });

    void syncScannerSettings(
      watchlistRef.current,
      selectedPatternId,
      activeWindow,
      scanIntervalMinutes,
      newMinMove,
      normalized,
    ).catch(() => {});
  }, [
    activeWindow,
    maxBodyOverlapPercent,
    newMinMove,
    scanIntervalMinutes,
    selectedPatternId,
    syncScannerSettings,
    patternSettings,
  ]);

  // Toggle a whole category's background scanning/alerts. Updates the ref first
  // so the immediate sync sends the new value.
  const toggleCategoryScanning = React.useCallback((category: ScanCategory) => {
    const next = disabledCategoriesRef.current.includes(category)
      ? disabledCategoriesRef.current.filter((c) => c !== category)
      : [...disabledCategoriesRef.current, category];
    disabledCategoriesRef.current = next;
    setDisabledCategories(next);
    localStorage.setItem('watcher-disabled-categories', JSON.stringify(next));
    void syncScannerSettings(watchlist).catch(() => {});
  }, [syncScannerSettings, watchlist]);

  const handlePatternChange = React.useCallback((patternId: PatternId) => {
    setSelectedPatternId(patternId);
    localStorage.setItem('watcher-selected-pattern', patternId);
    void syncScannerSettings(watchlist, patternId).catch(() => {});

    // Re-evaluate cached candles immediately so the rows reflect the new
    // detector without creating a burst of network requests.
    setWatchlist((current) => current.map((item) => {
      if (!item.candles?.length) return item;
      const { matched } = detectPattern(
        item.candles,
        newMinMove,
        requiredCandleCount,
        patternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...item, status: matched };
    }));

    setTestResult((prev) => {
      if (!prev || !prev.candles?.length) return prev;
      const { matched, message } = detectPattern(
        prev.candles,
        newMinMove,
        requiredCandleCount,
        patternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      const allMatches = scanAllPatterns(
        prev.candles,
        newMinMove,
        requiredCandleCount,
        patternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      return { ...prev, patternMatched: matched, message, allMatches };
    });
  }, [
    maxBodyOverlapPercent,
    newMinMove,
    requiredCandleCount,
    syncScannerSettings,
    watchlist,
    patternSettings,
  ]);

  const [cloudSyncNotice, setCloudSyncNotice] = useState<string | null>(null);

  const handleSyncToCloud = async () => {
    setCloudSyncNotice('Syncing...');
    try {
      const res = await syncScannerSettings(watchlist);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success) {
        setCloudSyncNotice(`Saved ${watchlist.length} items to cloud!`);
      } else {
        setCloudSyncNotice(data?.authenticated === false ? 'Sign in to sync' : 'Sync failed');
      }
    } catch {
      setCloudSyncNotice('Network error');
    }
    setTimeout(() => setCloudSyncNotice(null), 3500);
  };


  const sortedWatchlist = React.useMemo(() => {
    let list = [...categoryItems];

    // Apply Search Filter
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toUpperCase();
      list = list.filter((w) => w.symbol.toUpperCase().includes(term));
    }

    // Apply Filter Mode
    if (filterMode === 'alerts') {
      list = list.filter((w) => w.status === 'bullish' || w.status === 'bearish');
    } else if (filterMode === 'errors') {
      list = list.filter((w) => w.status === 'error');
    }

    if (!sortColumn) return list;
    return list.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortColumn === 'symbol') {
        aVal = a.symbol.toUpperCase();
        bVal = b.symbol.toUpperCase();
      } else if (sortColumn === 'interval') {
        aVal = a.interval;
        bVal = b.interval;
      } else if (sortColumn === 'status') {
        aVal = a.status || '';
        bVal = b.status || '';
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [categoryItems, sortColumn, sortDirection, searchTerm, filterMode]);

  // Session windows in America/New_York, as minutes-from-midnight [start, end).
  // Polygon returns equity bars 4:00 AM – 8:00 PM ET, so 'ext' covers all available data.
  const SESSION_WINDOWS: Record<string, [number, number]> = {
    rth: [570, 960],  // 9:30 – 16:00 (regular)
    pre: [240, 960],  // 4:00 – 16:00 (pre-market + regular)
    ext: [240, 1200], // 4:00 – 20:00 (pre + regular + after-hours)
    all: [0, 1440],   // 0:00 – 24:00 (24 Hours / Futures & Crypto)
  };

  // Whether the current time (Mon–Fri) falls inside the chosen session window.
  // Note: does not account for US market holidays.
  const isMarketOpen = (win: string) => {
    if (win === 'all') return true; // 24/7 hours for Futures, Crypto, & All Hours mode
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekday = get('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    const mins = parseInt(get('hour')) * 60 + parseInt(get('minute'));
    const [start, end] = SESSION_WINDOWS[win] ?? SESSION_WINDOWS.rth;
    return mins >= start && mins < end;
  };

  // Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Initial Load: localStorage & Notifications Check
  useEffect(() => {
    const DEFAULT_STARTER_WATCHLIST: WatchItem[] = [
      { symbol: 'AAPL', interval: '5m' },
      { symbol: 'TSLA', interval: '10m' },
      { symbol: 'NVDA', interval: '10m' },
      { symbol: 'SPY', interval: '5m' },
      { symbol: 'QQQ', interval: '10m' },
      { symbol: 'NQ=F', interval: '10m' },
      { symbol: 'ES=F', interval: '10m' },
      { symbol: 'YM=F', interval: '10m' },
      { symbol: 'CL=F', interval: '10m' },
      { symbol: 'GC=F', interval: '10m' },
      { symbol: 'SI=F', interval: '10m' },
    ];

    const savedWatch = localStorage.getItem('watcher-watchlist');
    if (savedWatch) {
      try {
        const loaded = (JSON.parse(savedWatch) as WatchItem[]).map((item) => ({
          symbol: item.symbol,
          interval: item.interval,
          lastAlertedCandleTime: item.lastAlertedCandleTime,
          lastAlertedType: item.lastAlertedType,
          lastAlertedPatternId: item.lastAlertedPatternId,
        }));
        setWatchlist(loaded);
      } catch (e) {
        console.error(e);
        setWatchlist(DEFAULT_STARTER_WATCHLIST);
        persistWatchlist(DEFAULT_STARTER_WATCHLIST);
      }
    } else {
      setWatchlist(DEFAULT_STARTER_WATCHLIST);
      persistWatchlist(DEFAULT_STARTER_WATCHLIST);
    }

    // Pull synced watchlist from cloud database if authenticated
    fetch('/api/watch/sync')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.watchlist && Array.isArray(data.watchlist)) {
          if (data.watchlist.length > 0) {
            const syncedWatchlist: WatchItem[] = data.watchlist.map((item: WatchItem) => ({
              symbol: item.symbol,
              interval: item.interval,
            }));
            setWatchlist(syncedWatchlist);
            persistWatchlist(syncedWatchlist);
          }
        }
        if (typeof data?.minMovePercent === 'number') {
          const minMove = Math.max(0.05, Math.min(3, data.minMovePercent));
          setNewMinMove(minMove);
          localStorage.setItem('watcher-new-min-move', String(minMove));
        }
        if (typeof data?.requiredCandleCount === 'number') {
          const count = Math.max(
            2,
            Math.min(10, Math.round(data.requiredCandleCount)),
          );
          setRequiredCandleCount(count);
          localStorage.setItem('watcher-consecutive-candles', String(count));
        }
        if (isPatternId(data?.patternId)) {
          setSelectedPatternId(data.patternId);
          localStorage.setItem('watcher-selected-pattern', data.patternId);
        }
        if (typeof data?.maxBodyOverlapPercent === 'number') {
          const overlap = Math.max(0, Math.min(100, data.maxBodyOverlapPercent));
          setMaxBodyOverlapPercent(overlap);
          localStorage.setItem(
            'watcher-max-body-overlap-percent',
            String(overlap),
          );
        }
        if (data?.patternSettings) {
          const settings = normalizePatternSettings(data.patternSettings);
          setPatternSettings(settings);
          localStorage.setItem('watcher-pattern-settings', JSON.stringify(settings));
        }
        if (data?.session === 'rth' || data?.session === 'pre' || data?.session === 'ext' || data?.session === 'all') {
          setActiveWindow(data.session);
          localStorage.setItem('watcher-active-window', data.session);
        }
        if (typeof data?.scanFrequencySeconds === 'number' && data.scanFrequencySeconds >= 15) {
          const minutes = data.scanFrequencySeconds / 60;
          setScanIntervalMinutes(minutes);
          localStorage.setItem('watcher-scan-interval', String(minutes));
        }
        // Category on/off: hydrate from server enabled flags merged with local storage
        // preferences so even categories with 0 items stay muted across reloads.
        if (Array.isArray(data?.disabledAssetClasses)) {
          const ASSET_CLASS_TO_CATEGORY: Record<string, ScanCategory> = {
            equity: 'stocks',
            crypto: 'crypto',
            futures: 'futures',
          };
          const serverCats = data.disabledAssetClasses
            .map((c: string) => ASSET_CLASS_TO_CATEGORY[c])
            .filter((c: ScanCategory | undefined): c is ScanCategory => !!c);
          
          const savedLocal = localStorage.getItem('watcher-disabled-categories');
          let localCats: ScanCategory[] = [];
          if (savedLocal) {
            try {
              const parsed = JSON.parse(savedLocal);
              if (Array.isArray(parsed)) {
                localCats = parsed.filter(
                  (c): c is ScanCategory => c === 'stocks' || c === 'crypto' || c === 'futures',
                );
              }
            } catch {}
          }
          const merged = Array.from(new Set([...serverCats, ...localCats]));
          disabledCategoriesRef.current = merged;
          setDisabledCategories(merged);
          localStorage.setItem('watcher-disabled-categories', JSON.stringify(merged));
        }
      })
      .catch(() => {});

    // Load Alert History
    const savedLogs = localStorage.getItem('watcher-alerts');
    if (savedLogs) {
      try {
        const parsedLogs: AlertLog[] = JSON.parse(savedLogs);
        const activeLogs = pruneAlertHistory(parsedLogs);
        setAlertLogs(activeLogs);
        localStorage.setItem('watcher-alerts', JSON.stringify(activeLogs));
      } catch (e) {
        console.error(e);
      }
    }

    // Load Alert Settings
    const savedSound = localStorage.getItem('watcher-sound-enabled');
    if (savedSound !== null) {
      setIsSoundEnabled(savedSound === 'true');
    }
    const savedScanInt = localStorage.getItem('watcher-scan-interval');
    if (savedScanInt !== null) {
      const mins = parseFloat(savedScanInt);
      setScanIntervalMinutes(mins);
    }
    const savedAutoPause = localStorage.getItem('watcher-auto-pause');
    if (savedAutoPause !== null) {
      setAutoPauseEnabled(savedAutoPause === 'true');
    }
    const savedScannerPaused = localStorage.getItem('watcher-scanner-paused');
    if (savedScannerPaused !== null) {
      setIsScannerPaused(savedScannerPaused === 'true');
    }
    const savedWindow = localStorage.getItem('watcher-active-window');
    const initialWindow = (savedWindow === 'rth' || savedWindow === 'pre' || savedWindow === 'ext') ? savedWindow : 'pre';
    if (savedWindow) setActiveWindow(initialWindow);
    // Seed the market-open state immediately so the badge is correct on first paint
    setMarketOpen(isMarketOpen(initialWindow));

    // Load tester settings (activeTab is hydrated via its lazy useState
    // initializer above, so it isn't re-read here — doing so races with the
    // save effect and can clobber the persisted tab on refresh).
    const savedCategory = localStorage.getItem('watcher-watchlist-category');
    if (savedCategory === 'stocks' || savedCategory === 'crypto' || savedCategory === 'futures' || savedCategory === 'all') {
      setWatchlistCategory(savedCategory);
    }
    const savedDisabled = localStorage.getItem('watcher-disabled-categories');
    if (savedDisabled) {
      try {
        const parsed = JSON.parse(savedDisabled);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (c): c is ScanCategory => c === 'stocks' || c === 'crypto' || c === 'futures',
          );
          disabledCategoriesRef.current = valid;
          setDisabledCategories(valid);
        }
      } catch {
        // ignore malformed value
      }
    }
    const savedWatchlistView = localStorage.getItem('watcher-watchlist-view');
    if (savedWatchlistView === 'compact' || savedWatchlistView === 'table') {
      setWatchlistView(savedWatchlistView);
    }
    const savedTestSymbol = localStorage.getItem('watcher-test-symbol');
    if (savedTestSymbol) {
      setTestSymbol(savedTestSymbol);
    }
    const savedTestInterval = localStorage.getItem('watcher-test-interval');
    if (savedTestInterval) {
      setTestInterval(savedTestInterval);
    }
    const savedTestMinMove = localStorage.getItem('watcher-test-min-move');
    if (savedTestMinMove) {
      setTestMinMove(parseFloat(savedTestMinMove) || 0.15);
    }
    const savedTestSessionFilter = localStorage.getItem('watcher-test-session-filter');
    if (savedTestSessionFilter === 'all' || savedTestSessionFilter === 'rth' || savedTestSessionFilter === 'ext') {
      setTestSessionFilter(savedTestSessionFilter);
    }

    const savedCurrentDayOnly = localStorage.getItem('watcher-test-current-day-only');
    if (savedCurrentDayOnly !== null) {
      setTestCurrentDayOnly(savedCurrentDayOnly === 'true');
    }

    const savedNewInterval = localStorage.getItem('watcher-new-interval');
    if (savedNewInterval) {
      setNewInterval(savedNewInterval);
    }
    const savedNewMinMove = localStorage.getItem('watcher-new-min-move');
    if (savedNewMinMove) {
      setNewMinMove(parseFloat(savedNewMinMove) || 0.25);
    }

    // Check notification permission
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    const cleanupTimer = window.setInterval(() => {
      setAlertLogs((currentLogs) => {
        const activeLogs = pruneAlertHistory(currentLogs);
        if (activeLogs.length === currentLogs.length) return currentLogs;
        localStorage.setItem('watcher-alerts', JSON.stringify(activeLogs));
        return activeLogs;
      });
    }, 30_000);
    return () => window.clearInterval(cleanupTimer);
  }, []);

  useEffect(() => () => {
    if (addNoticeTimerRef.current !== null) {
      window.clearTimeout(addNoticeTimerRef.current);
    }
    if (alertPersistTimerRef.current !== null) {
      window.clearTimeout(alertPersistTimerRef.current);
    }
    if (globalMinMoveSyncTimerRef.current !== null) {
      window.clearTimeout(globalMinMoveSyncTimerRef.current);
    }
    if (serverStateFlushTimerRef.current !== null) {
      window.clearTimeout(serverStateFlushTimerRef.current);
    }
    pendingServerStateUpdatesRef.current.clear();
  }, []);

  // Save tester configuration changes to localStorage
  useEffect(() => {
    localStorage.setItem('watcher-test-symbol', testSymbol);
    localStorage.setItem('watcher-test-interval', testInterval);
    localStorage.setItem('watcher-test-min-move', String(testMinMove));
    localStorage.setItem('watcher-test-session-filter', testSessionFilter);
    localStorage.setItem('watcher-test-current-day-only', String(testCurrentDayOnly));
  }, [testSymbol, testInterval, testMinMove, testSessionFilter, testCurrentDayOnly]);

  // Save activeTab to localStorage
  useEffect(() => {
    localStorage.setItem('watcher-active-tab', activeTab);
  }, [activeTab]);

  // 2. Save Watchlist when modified (Local + Cloud Sync)
  const saveWatchlist = (updated: WatchItem[], skipCloudSync = false) => {
    setWatchlist(updated);
    persistWatchlist(updated);
    if (!skipCloudSync) {
      syncScannerSettings(updated).catch(() => {});
    }
  };

  // 3. Audio Chime Synthesizer (Web Audio API)
  const playAlertSound = (type: 'bullish' | 'bearish') => {
    if (!isSoundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      
      // Play a premium sound notification
      // Bullish: Ascending C-Major chord (C5 -> E5 -> G5)
      // Bearish: Descending chord (G4 -> Eb4 -> C4)
      const frequencies = type === 'bullish' 
        ? [523.25, 659.25, 783.99] // C5, E5, G5
        : [392.00, 311.13, 261.63]; // G4, Eb4, C4

      frequencies.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Use triangle wave for a softer, organic sound
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + index * 0.08);

        // Amplitude envelope: Quick attack, smooth decay
        gainNode.gain.setValueAtTime(0, now + index * 0.08);
        gainNode.gain.linearRampToValueAtTime(0.2, now + index * 0.08 + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.08 + 0.4);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc.start(now + index * 0.08);
        osc.stop(now + index * 0.08 + 0.45);
      });
    } catch (e) {
      console.error('Audio alert failed', e);
    }
  };

  // Test beep sound manually
  const handleTestSound = () => {
    // Initialise audio context if needed
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    playAlertSound('bullish');
  };

  // 4. Desktop Notification Requester
  const requestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationFeedback({
        type: 'error',
        message: 'Desktop notifications are not supported by this browser.',
      });
      return;
    }
    const permission = await Notification.requestPermission();
    setIsNotificationsEnabled(permission === 'granted');
    if (permission === 'granted') {
      new Notification('Notifications Enabled!', {
        body: 'You will receive desktop alerts when stock patterns are detected.',
        icon: '/favicon.ico'
      });
      setNotificationFeedback({
        type: 'success',
        message: 'Desktop notifications are enabled.',
      });
    } else {
      setNotificationFeedback({
        type: 'error',
        message: 'Notification permission was denied. Enable it in your browser site settings.',
      });
    }
  };

  const handleTestNotification = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationFeedback({
        type: 'error',
        message: 'Desktop notifications are not supported by this browser.',
      });
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }

    setIsNotificationsEnabled(permission === 'granted');
    if (permission !== 'granted') {
      setNotificationFeedback({
        type: 'error',
        message: 'Test not sent. Allow notifications in your browser site settings first.',
      });
      return;
    }

    try {
      const notification = new Notification('Trading Diary test notification', {
        body: 'Desktop alerts are working correctly.',
        icon: '/favicon.ico',
        tag: `watcher-test-${Date.now()}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      setNotificationFeedback({
        type: 'success',
        message: 'Test sent. If it did not appear, check macOS Notifications and Focus settings.',
      });
    } catch (error) {
      console.error('Test notification failed', error);
      setNotificationFeedback({
        type: 'error',
        message: 'The browser accepted permission but could not create the notification.',
      });
    }
  };

  // Helper to generate a 1:1 square mini candlestick PNG for desktop notification thumbnails
  const generateCandleChartIcon = (candles: Candle[]): string => {
    if (typeof window === 'undefined' || !candles || candles.length === 0) return '/favicon.ico';
    try {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '/favicon.ico';

      // Dark theme background matching app theme
      ctx.fillStyle = '#0B0F19';
      ctx.fillRect(0, 0, size, size);

      // Take last 5 candles
      const slice = candles.slice(-5);
      if (slice.length === 0) return '/favicon.ico';

      let minPrice = Math.min(...slice.map(c => c.low));
      let maxPrice = Math.max(...slice.map(c => c.high));
      if (minPrice === maxPrice) {
        minPrice -= 0.01;
        maxPrice += 0.01;
      }
      const range = maxPrice - minPrice;
      const paddingY = 36;
      const usableHeight = size - paddingY * 2;

      const paddingX = 24;
      const usableWidth = size - paddingX * 2;
      const count = slice.length;
      const slotWidth = usableWidth / count;
      const bodyWidth = Math.min(slotWidth * 0.65, 26); // Bold thick candle body!

      slice.forEach((c, i) => {
        const isGreen = c.close >= c.open;
        const color = isGreen ? '#10B981' : '#EF4444';

        const xCenter = paddingX + i * slotWidth + slotWidth / 2;
        const bodyLeft = xCenter - bodyWidth / 2;

        const highY = paddingY + usableHeight * (1 - (c.high - minPrice) / range);
        const lowY = paddingY + usableHeight * (1 - (c.low - minPrice) / range);
        const openY = paddingY + usableHeight * (1 - (c.open - minPrice) / range);
        const closeY = paddingY + usableHeight * (1 - (c.close - minPrice) / range);

        // Draw high-low wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xCenter, highY);
        ctx.lineTo(xCenter, lowY);
        ctx.stroke();

        // Draw open-close candle body
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(Math.abs(closeY - openY), 6);

        ctx.fillStyle = color;
        if (typeof ctx.roundRect === 'function') {
          ctx.beginPath();
          ctx.roundRect(bodyLeft, bodyTop, bodyWidth, bodyHeight, 4);
          ctx.fill();
        } else {
          ctx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyHeight);
        }
      });

      return canvas.toDataURL('image/png');
    } catch {
      return '/favicon.ico';
    }
  };

  const sendDesktopNotification = (symbol: string, type: 'bullish' | 'bearish', text: string, candles?: Candle[], tagKey?: string) => {
    if (
      typeof window !== 'undefined'
      && 'Notification' in window
      && Notification.permission === 'granted'
    ) {
      try {
        // Strip emojis for clean, professional compact text
        const cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '').replace(/📈|📉|🚨/g, '').trim();
        const iconUrl = candles && candles.length > 0 ? generateCandleChartIcon(candles) : '/favicon.ico';

        const notificationOptions: NotificationOptions & { image?: string } = {
          body: cleanText,
          // Stable tag so a newer alert for the same symbol/interval/direction
          // replaces an older banner instead of stacking (spec B4/B5). A per-call
          // timestamp would defeat the purpose of tag entirely.
          tag: tagKey ? `alert-${tagKey}` : `${symbol}-${type}`,
          icon: iconUrl,
          image: iconUrl
        };

        const notification = new Notification(`Market Alert: ${symbol.toUpperCase()}`, notificationOptions);
        
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (err) {
        console.error('Desktop notification failed', err);
      }
    }
  };

  // Helper to filter candles by session hours (Regular Trading Hours vs Extended vs All)
  const filterCandlesBySession = (candles: Candle[], filter: 'all' | 'rth' | 'ext') => {
    if (filter === 'all') return candles;
    
    return candles.filter((c) => {
      const date = new Date(c.time * 1000);
      const nyTime = date.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const [hourStr, minuteStr] = nyTime.split(':');
      const timeVal = parseInt(hourStr) * 100 + parseInt(minuteStr);
      
      const isRth = timeVal >= 930 && timeVal < 1600;
      return filter === 'rth' ? isRth : !isRth;
    });
  };

  // Helper to filter candles to the active polling window (matches the auto-pause session bounds),
  // so the chart shows only the hours the scanner actually polls — less noise.
  const filterCandlesByWindow = (candles: Candle[], win: string) => {
    if (win === 'all') return candles;
    const [start, end] = SESSION_WINDOWS[win] ?? SESSION_WINDOWS.pre;
    return candles.filter((c) => {
      const nyTime = new Date(c.time * 1000).toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [h, m] = nyTime.split(':');
      const mins = parseInt(h) * 60 + parseInt(m);
      return mins >= start && mins < end;
    });
  };

  const persistAlertHistorySoon = (logs: AlertLog[]) => {
    if (alertPersistTimerRef.current !== null) {
      window.clearTimeout(alertPersistTimerRef.current);
    }
    alertPersistTimerRef.current = window.setTimeout(() => {
      localStorage.setItem('watcher-alerts', JSON.stringify(logs));
      alertPersistTimerRef.current = null;
    }, 250);
  };

  const publishAlerts = (candidates: PendingAlert[]) => {
    if (candidates.length === 0) return;

    const now = Date.now();
    const activeLogs = pruneAlertHistory(alertLogsRef.current, now);
    const additions: AlertLog[] = [];

    for (const candidate of candidates) {
      const symbol = candidate.symbol.toUpperCase();
      const isDuplicate = [...additions, ...activeLogs].some((log) => {
        const elapsed = candidate.createdAt - log.createdAt;
        return log.symbol === symbol
          && log.type === candidate.type
          && log.interval === candidate.interval
          && elapsed >= 0
          && elapsed < 60_000;
      });
      if (isDuplicate) continue;

      additions.push({
        id: Math.random().toString(36).slice(2, 11),
        ...candidate,
        symbol,
      });
    }

    if (additions.length === 0) {
      if (activeLogs.length !== alertLogsRef.current.length) {
        alertLogsRef.current = activeLogs;
        setAlertLogs(activeLogs);
        persistAlertHistorySoon(activeLogs);
      }
      return;
    }

    const updatedLogs = [...additions, ...activeLogs]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_ALERT_HISTORY_ITEMS);
    alertLogsRef.current = updatedLogs;
    setAlertLogs(updatedLogs);
    persistAlertHistorySoon(updatedLogs);

    // Yield between notification thumbnail renders so a burst of alerts does
    // not monopolize the main thread and block taps or chart expansion.
    additions.forEach((alert, index) => {
      window.setTimeout(() => {
        const cleanMsg = alert.details
          .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
          .replace(/📈|📉|🚨/g, '')
          .trim();
        playAlertSound(alert.type);
        sendDesktopNotification(
          alert.symbol,
          alert.type,
          `${alert.type.toUpperCase()} move on ${alert.symbol} (${alert.interval}). ${cleanMsg}`,
          alert.candles,
        );
      }, index * 75);
    });
  };

  const triggerAlert = (
    symbol: string,
    interval: string,
    type: 'bullish' | 'bearish',
    message: string,
    price: number,
    candles?: Candle[],
    dailyMove?: IntradayChange | null,
    collector?: (alert: PendingAlert) => void,
  ) => {
    const alert: PendingAlert = {
      createdAt: Date.now(),
      symbol: symbol.toUpperCase(),
      interval,
      type,
      details: message,
      price,
      intradayChange: dailyMove?.amount,
      intradayChangePercent: dailyMove?.percent,
      // Store the exact 4-hour window rather than the full provider response.
      candles: candles ? candles.slice(-get4HourCandleCount(interval)) : undefined,
    };
    if (collector) {
      collector(alert);
    } else {
      publishAlerts([alert]);
    }
  };

  const scanSymbol = async (
    item: WatchItem,
    alertCollector?: (alert: PendingAlert) => void,
    forceFresh = false,
  ): Promise<WatchItem> => {
    try {
      let candles: Candle[] = [];
      let providerName = 'Polygon.io';

      // 1. Try fetching from IndexedDB cache first (skipped on a manual refresh,
      // which should always hit the provider for the freshest data).
      const cache = forceFresh ? null : await getLiveCache(item.symbol, item.interval);
      const isFuturesOrCrypto = item.symbol.includes('=F') || item.symbol.includes('-USD');
      const cacheHasCurrentSession = cache && (
        isFuturesOrCrypto
        || filterCandlesByWindow(filterCurrentDayOnly(cache.candles), activeWindowRef.current).length > 0
      );
      if (cache && cacheHasCurrentSession) {
        candles = cache.candles;
        providerName = cache.provider || 'Polygon.io';
        if (providerName === 'Polygon.io') {
          setIsPolygonActive(true);
        }
      } else {
        // 2. Cache miss: Fetch fresh from API with a 12-second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        
        try {
          const cacheBust = forceFresh ? `&t=${Date.now()}` : '';
          const res = await fetch(`/api/watch?symbol=${encodeURIComponent(item.symbol)}&interval=${item.interval}${cacheBust}`, {
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            const text = await res.text().catch(() => '');
            let errMsg = `Server responded with ${res.status}`;
            try {
              const errData = JSON.parse(text);
              if (errData?.error) errMsg = errData.error;
            } catch {
              // HTML error page during dev hot-reload
            }
            throw new Error(errMsg);
          }

          const data = await res.json();
          candles = data.candles || [];
          providerName = data.provider || 'Polygon.io';
          if (providerName === 'Polygon.io') {
            setIsPolygonActive(true);
          }

          // Save to cache
          await setLiveCache(item.symbol, item.interval, candles, providerName);
        } catch (fetchErr) {
          clearTimeout(timeoutId);
          throw fetchErr;
        }
      }

      const scanCandles = isFuturesOrCrypto
        ? candles
        : filterCandlesByWindow(filterCurrentDayOnly(candles), activeWindowRef.current);
      const { matched, message, time } = detectPattern(
        scanCandles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      const status = scanCandles.length === 0 ? 'no-data' as const : matched;
      const dailyMove = isFuturesOrCrypto
        ? null
        : calculateEquityIntradayChange(candles);

      // Trigger Alert if pattern matched and hasn't been alerted for this candle/direction yet
      const alreadyAlerted = item.lastAlertedCandleTime === time
        && item.lastAlertedType === matched
        && item.lastAlertedPatternId === selectedPatternId;
      if (scanCandles.length > 0 && matched !== 'none' && !alreadyAlerted) {
        triggerAlert(
          item.symbol,
          item.interval,
          matched,
          message,
          scanCandles[scanCandles.length - 1]?.close || 0,
          scanCandles,
          dailyMove,
          alertCollector,
        );
      }

      return {
        ...item,
        lastChecked: new Date().toLocaleTimeString(),
        status,
        candles,
        lastError: scanCandles.length === 0 ? 'No candles available for today’s selected ET session' : undefined,
        lastAlertedCandleTime: matched !== 'none' ? time : item.lastAlertedCandleTime,
        lastAlertedType: matched !== 'none' ? matched : item.lastAlertedType,
        lastAlertedPatternId: matched !== 'none' ? selectedPatternId : item.lastAlertedPatternId,
      };
    } catch (err) {
      console.error(`Error scanning ${item.symbol}:`, err);
      return {
        ...item,
        lastChecked: new Date().toLocaleTimeString(),
        status: 'error',
        lastError: err instanceof Error ? err.message : 'Network error'
      };
    }
  };

  const getScanSpacingSeconds = () => {
    if (categoryItems.length === 0) return 60;
    const intervalSeconds = scanIntervalMinutes * 60;
    let spacing = intervalSeconds / categoryItems.length;
    if (isPolygonActive && spacing < 12) {
      spacing = 12; // Enforce Polygon free tier rate limit spacing
    }
    return Math.max(1, Math.floor(spacing));
  };

  const spacingSeconds = getScanSpacingSeconds();
  const lastScanTimeRef = useRef<number>(Date.now());

  const nextScanIndexRef = useRef(nextScanIndex);
  nextScanIndexRef.current = nextScanIndex;

  const spacingSecondsRef = useRef(spacingSeconds);
  spacingSecondsRef.current = spacingSeconds;

  const autoPauseEnabledRef = useRef(autoPauseEnabled);
  autoPauseEnabledRef.current = autoPauseEnabled;

  const activeWindowRef = useRef(activeWindow);
  activeWindowRef.current = activeWindow;

  const watchlistCategoryRef = useRef(watchlistCategory);
  watchlistCategoryRef.current = watchlistCategory;

  const categoryItemsRef = useRef(categoryItems);
  categoryItemsRef.current = categoryItems;

  const expandedRowIndexRef = useRef(expandedRowIndex);
  expandedRowIndexRef.current = expandedRowIndex;

  // Derived scanner state used by the UI
  const isStocksCategory = watchlistCategory === 'stocks';
  const marketAutoPaused = autoPauseEnabled && !marketOpen && isStocksCategory;
  const effectivelyActive = !isScannerPaused && !marketAutoPaused;
  const windowStartLabel = activeWindow === 'rth' ? '9:30 AM ET' : '4:00 AM ET';

  const handleScanNext = async () => {
    const currentList = categoryItemsRef.current;
    if (currentList.length === 0 || isBackgroundScanning || isBatchScanning) return;

    const indexToScan = nextScanIndexRef.current % currentList.length;
    const item = currentList[indexToScan];
    if (!item) return;

    // Skip paused stocks outside market hours
    const isFuturesOrCrypto = item.symbol.includes('=F') || item.symbol.includes('-USD');
    const open = isMarketOpen(activeWindowRef.current);
    if (autoPauseEnabledRef.current && !open && !isFuturesOrCrypto) {
      nextScanIndexRef.current += 1;
      setNextScanIndex(nextScanIndexRef.current);
      return;
    }

    setIsBackgroundScanning(true);
    try {
      const scanned = await scanSymbol(item);
      const latestList = [...watchlistRef.current];
      const idx = latestList.findIndex((w) => w.symbol === item.symbol && w.interval === item.interval);
      if (idx !== -1) {
        latestList[idx] = scanned;
        saveWatchlist(latestList, true);

        // If the scanned item is currently expanded in the Watchlist tab, update testResult live so the chart updates instantly
        if (expandedRowIndexRef.current === idx && scanned.candles && scanned.candles.length > 0) {
          const { matched, message } = detectPattern(
            scanned.candles,
            newMinMove,
            requiredCandleCount,
            selectedPatternId,
            maxBodyOverlapPercent,
            patternSettings,
          );
          const allMatches = scanAllPatterns(
            scanned.candles,
            newMinMove,
            requiredCandleCount,
            selectedPatternId,
            maxBodyOverlapPercent,
            patternSettings,
          );
          setTestResult({
            success: true,
            patternMatched: matched,
            message: message || 'Loaded',
            candles: scanned.candles,
            provider: 'Tiingo',
            allMatches
          });
        }
      }
    } catch (err) {
      console.error('Scan next error:', err);
    } finally {
      setIsBackgroundScanning(false);
      nextScanIndexRef.current += 1;
      setNextScanIndex(nextScanIndexRef.current);
    }
  };
  const handleScanNextRef = useRef(handleScanNext);
  handleScanNextRef.current = handleScanNext;

  useEffect(() => {
    nextScanIndexRef.current = nextScanIndex;
  }, [nextScanIndex]);

  // Scan all items in the current active category (manual override Scan Now button)
  // Pull the latest per-watch state from the server snapshot and apply it to the
  // rows (status/price/candles) — no provider calls. Used as the authenticated
  // "Scan Now All" behavior, since the server is the scanner.
  const refreshFromServerSnapshot = React.useCallback(async () => {
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || '';
    const res = await fetch(`${baseUrl}/api/watch/state`);
    if (!res.ok) return;
    const snapshot = await res.json();
    const watchById = new Map<string, { symbol: string; interval: string }>(
      (snapshot.watches || []).map((w: { id: string; symbol: string; interval: string }) => [w.id, w]),
    );
    const stateByKey = new Map<string, Record<string, unknown>>();
    for (const s of (snapshot.states || []) as Array<Record<string, unknown>>) {
      const w = watchById.get(s.watchId as string);
      if (w) stateByKey.set(`${w.symbol.toUpperCase()}\u0000${w.interval}`, s);
    }
    setWatchlist((prev) =>
      prev.map((item) => {
        const s = stateByKey.get(`${item.symbol.toUpperCase()}\u0000${item.interval}`);
        if (!s) return item;
        const status = s.status as string;
        const mapped = status === 'bullish' || status === 'bearish' || status === 'no-data' || status === 'error' ? status : 'none';
        return {
          ...item,
          status: mapped,
          lastPrice: (s.lastPrice as number) ?? item.lastPrice,
          lastChecked: s.lastScannedAt ? new Date(s.lastScannedAt as string).toLocaleTimeString() : item.lastChecked,
          candles: Array.isArray(s.recentCandles) && s.recentCandles.length > 0 ? (s.recentCandles as Candle[]) : item.candles,
          lastError: (s.lastError as string) ?? item.lastError,
        };
      }),
    );
    if (Array.isArray(snapshot.alerts)) {
      setAlertLogs(mapSnapshotAlerts(snapshot));
    }
  }, []);

  const handleScanAll = async () => {
    // "Scan All" spans the whole watchlist, not just the current tab — but skips
    // any muted (switched-off) category regardless of which tab is showing.
    const categoryOf = (symbol: string): ScanCategory =>
      isFuturesSymbol(symbol) ? 'futures' : isCryptoSymbol(symbol) ? 'crypto' : 'stocks';
    const targetList = watchlistRef.current.filter(
      (w) => !disabledCategoriesRef.current.includes(categoryOf(w.symbol)),
    );

    // Signed in: the server scanner owns scanning. Force an immediate scan by
    // marking the user's watches due now (POST /api/watch/scan-now); the running
    // scanner picks them up within ~5s and rows update live over SSE. We poll the
    // snapshot a few times so the progress bar reflects real elapsed work instead
    // of completing instantly. (Requires the scanner to be running: always on in
    // prod, `npm run scanner` locally.)
    if (isAuthenticatedRef.current) {
      if (isBatchScanning) return;
      const total = targetList.length || 1;
      let scanCompleted = false;
      setIsBatchScanning(true);
      batchScanControlRef.current?.start(total);
      try {
        const base = process.env.NEXT_PUBLIC_SERVER_URL || '';
        // The browser may have a localStorage watchlist before this database has
        // normalized server_watch rows (fresh local DB, new device, or restored
        // browser state). Persist/normalize first so Scan Now never animates
        // against a list the server does not actually know about.
        const syncResponse = await syncScannerSettings(
          watchlistRef.current,
          selectedPatternId,
          activeWindow,
          scanIntervalMinutes,
        );
        const syncResult = await syncResponse.json().catch(() => null);
        if (!syncResponse.ok || !syncResult?.success) {
          throw new Error(syncResult?.error || 'Could not synchronize the watchlist');
        }

        const scanResponse = await fetch(`${base}/api/watch/scan-now`, { method: 'POST' });
        const scanResult = await scanResponse.json().catch(() => null);
        if (!scanResponse.ok) {
          throw new Error(scanResult?.error || 'Could not request a server scan');
        }
        if (!scanResult?.enqueued) {
          throw new Error('The server accepted zero enabled watches for scanning');
        }

        const ROUNDS = 6;
        for (let i = 1; i <= ROUNDS; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await refreshFromServerSnapshot();
          batchScanControlRef.current?.update(Math.round((i / ROUNDS) * total), total);
        }
        scanCompleted = true;
      } catch (err) {
        console.error('Scan-now error:', err);
        batchScanControlRef.current?.fail(
          err instanceof Error ? err.message : 'The server scan could not be started',
        );
      } finally {
        if (scanCompleted) {
          batchScanControlRef.current?.update(total, total);
          batchScanControlRef.current?.complete(total);
        }
        setIsBatchScanning(false);
      }
      return;
    }

    if (isBatchScanning || targetList.length === 0) return;
    setIsBatchScanning(true);
    batchScanControlRef.current?.start(targetList.length);

    const currentFullList = [...watchlist];
    const canUseParallel = parallelScanEnabled && !isPolygonActive;
    const pendingAlerts: PendingAlert[] = [];
    const collectAlert = (alert: PendingAlert) => pendingAlerts.push(alert);
    let lastAlertFlushAt = performance.now();
    const flushPendingAlerts = (force = false) => {
      if (pendingAlerts.length === 0) return;
      const now = performance.now();
      if (!force && now - lastAlertFlushAt < 250) return;
      publishAlerts(pendingAlerts.splice(0, pendingAlerts.length));
      lastAlertFlushAt = now;
    };

    try {
      if (canUseParallel) {
        // Parallel batch scanning: 5 concurrent API requests per batch
        const BATCH_SIZE = 5;
        let processedCount = 0;
        for (let i = 0; i < targetList.length; i += BATCH_SIZE) {
          const batch = targetList.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(batch.map((item) => scanSymbol(item, collectAlert)));
          results.forEach((scanned, batchIdx) => {
            const item = batch[batchIdx];
            const idx = currentFullList.findIndex((w) => w.symbol === item.symbol && w.interval === item.interval);
            if (idx !== -1) {
              currentFullList[idx] = scanned;
            }
          });

          processedCount += batch.length;
          const currentProgress = Math.min(targetList.length, processedCount);
          batchScanControlRef.current?.update(currentProgress, targetList.length);
          flushPendingAlerts();
        }
      } else {
        // Sequential scanning fallback (for rate-limited keys)
        for (let i = 0; i < targetList.length; i++) {
          const item = targetList[i];
          const scanned = await scanSymbol(item, collectAlert);
          const idx = currentFullList.findIndex((w) => w.symbol === item.symbol && w.interval === item.interval);
          if (idx !== -1) {
            currentFullList[idx] = scanned;
          }

          batchScanControlRef.current?.update(i + 1, targetList.length);
          flushPendingAlerts();

          if (i < targetList.length - 1) {
            if (isPolygonActive) {
              await new Promise((resolve) => setTimeout(resolve, 12000));
            } else {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          }
        }
      }

      saveWatchlist(currentFullList);
      flushPendingAlerts(true);
    } catch (err) {
      console.error('Batch scan error:', err);
      flushPendingAlerts(true);
    } finally {
      setIsBatchScanning(false);
      batchScanControlRef.current?.complete(targetList.length);
    }
  };

  const handleScanAllRef = useRef(handleScanAll);
  handleScanAllRef.current = handleScanAll;
  const stableHandleScanAll = React.useCallback(
    () => handleScanAllRef.current(),
    [],
  );

  // 7. Polling Timer scheduler spacing reset
  useEffect(() => {
    lastScanTimeRef.current = Date.now();
    if (nextScanIndexRef.current >= categoryItems.length) {
      nextScanIndexRef.current = 0;
      setNextScanIndex(0);
    }
  }, [categoryItems.length, scanIntervalMinutes, watchlistCategory]);

  // Polling Timer scheduler loop (Uses Web Worker to bypass Chrome background tab throttling)
  useEffect(() => {
    if (categoryItems.length === 0) return;

    // Reset last scan time on restart/resume
    lastScanTimeRef.current = Date.now();

    const onTick = () => {
      // Keep the market-open indicator fresh (no-op re-render when unchanged)
      const open = isMarketOpen(activeWindowRef.current);
      setMarketOpen(open);

      if (isAuthenticatedRef.current) return; // Signed in: the server scanner owns scanning; the browser does not fetch per-symbol (avoids double-scanning + duplicate provider load).
      if (isScannerPaused) return; // Manually paused
      const isStocksCategory = watchlistCategoryRef.current === 'stocks';
      if (autoPauseEnabledRef.current && !open && isStocksCategory) return; // Auto-paused outside the equities session

      const elapsed = Math.floor((Date.now() - lastScanTimeRef.current) / 1000);
      const remaining = spacingSecondsRef.current - elapsed;

      if (remaining <= 0) {
        handleScanNextRef.current();
        lastScanTimeRef.current = Date.now();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onTick();
      }
    };

    // Authenticated pages receive scanner state over SSE. They do not need the
    // legacy one-second worker plus a second one-second main-thread timer.
    if (isAuthenticated) {
      timerRef.current = setInterval(onTick, 30_000);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    // Create an inline Web Worker that runs on a separate background thread
    // Chrome does NOT throttle interval timers inside Web Workers when tab is in background!
    let worker: Worker | null = null;
    let workerUrl: string | null = null;

    try {
      const workerCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (timer) clearInterval(timer);
            timer = setInterval(function() {
              self.postMessage('tick');
            }, 1000);
          } else if (e.data === 'stop') {
            if (timer) clearInterval(timer);
            timer = null;
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);

      worker.onmessage = (e) => {
        if (e.data === 'tick') {
          onTick();
        }
      };
      worker.postMessage('start');
    } catch {
      // Web Worker fallback if worker creation is blocked
    }

    // Backup main thread timer
    timerRef.current = setInterval(onTick, 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
      if (workerUrl) {
        URL.revokeObjectURL(workerUrl);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    categoryItems.length,
    isAuthenticated,
    isScannerPaused,
    watchlistCategory,
  ]);



  // Adjust polling frequency
  const handleIntervalChange = (mins: number) => {
    setScanIntervalMinutes(mins);
    localStorage.setItem('watcher-scan-interval', String(mins));
    void syncScannerSettings(watchlist, selectedPatternId, activeWindow, mins).catch(() => {});
  };

  const showAddNotice = (type: 'success' | 'duplicate' | 'error', message: string) => {
    setAddNotice({ type, message });
    if (addNoticeTimerRef.current !== null) {
      window.clearTimeout(addNoticeTimerRef.current);
    }
    addNoticeTimerRef.current = window.setTimeout(() => {
      setAddNotice(null);
      addNoticeTimerRef.current = null;
    }, 3500);
  };

  // 8. Watchlist Modifiers
  const handleAddSymbol = async (input: string): Promise<boolean> => {
    let symbol = input.trim().toUpperCase();
    if (!symbol) return false;
    if (watchlistCategory === 'futures' && !symbol.includes('=F')) {
      symbol = `${symbol}=F`;
    } else if (watchlistCategory === 'crypto') {
      const compactSymbol = symbol.replace(/[-/]/g, '');
      symbol = compactSymbol.endsWith('USD')
        ? `${compactSymbol.slice(0, -3)}-USD`
        : `${compactSymbol}-USD`;
    }
    if (watchlist.some(w => w.symbol === symbol && w.interval === newInterval)) {
      showAddNotice('duplicate', `${symbol} (${newInterval}) is already in your watchlist.`);
      return false;
    }

    // Validate that an equity ticker actually exists before adding it, so typos
    // (e.g. "CROS") don't get silently added and scanned forever. Futures/crypto
    // pass through — they come from presets / the normalized =F,-USD forms, and
    // Yahoo's search is unreliable for them. If the search itself fails (network),
    // we don't block the add — only a definitive "no match" rejects.
    if (watchlistCategory !== 'futures' && watchlistCategory !== 'crypto') {
      try {
        const base = process.env.NEXT_PUBLIC_SERVER_URL || '';
        const params = new URLSearchParams({ q: symbol, category: 'stocks' });
        const res = await fetch(`${base}/api/symbol-search?${params.toString()}`);
        if (res.ok) {
          const data = (await res.json()) as { results?: { symbol?: string }[] };
          const results = Array.isArray(data.results) ? data.results : [];
          const found = results.some((r) => (r.symbol ?? '').toUpperCase() === symbol);
          if (!found) {
            showAddNotice('error', `"${symbol}" not found — check the ticker symbol.`);
            return false;
          }
        }
      } catch {
        // Network/route error — don't block the add on a transient failure.
      }
    }

    const newItem: WatchItem = {
      symbol,
      interval: newInterval,
    };

    const updated = [...watchlist, newItem];
    saveWatchlist(updated);
    showAddNotice('success', `${symbol} (${newInterval}) was added to your watchlist.`);

    // Immediately scan the newly added symbol
    scanSymbol(newItem).then((scanned) => {
      const currentList = [...updated];
      const idx = currentList.findIndex(w => w.symbol === symbol && w.interval === newInterval);
      if (idx !== -1) {
        currentList[idx] = scanned;
        saveWatchlist(currentList);
      }
    });
    return true;
  };
  const addSymbolRef = useRef(handleAddSymbol);
  addSymbolRef.current = handleAddSymbol;
  const stableAddSymbol = React.useCallback(
    (input: string) => addSymbolRef.current(input),
    [],
  );

  const handleAddPreset = (symbol: string) => {
    if (watchlist.some(w => w.symbol === symbol && w.interval === newInterval)) return;
    const newItem: WatchItem = {
      symbol,
      interval: newInterval,
    };
    const updated = [...watchlist, newItem];
    saveWatchlist(updated);
    scanSymbol(newItem).then((scanned) => {
      setWatchlist((prevList) => {
        const current = [...prevList];
        const idx = current.findIndex(w => w.symbol === symbol && w.interval === newInterval);
        if (idx !== -1) {
          current[idx] = scanned;
          saveWatchlist(current);
        }
        return current;
      });
    });
  };

  const handleRemoveSymbol = (symbol: string, interval: string) => {
    const updated = watchlist.filter(w => !(w.symbol === symbol && w.interval === interval));
    saveWatchlist(updated);
  };

  // Toggle the expansion of a watchlist row to show the chart inline
  const handleToggleRowExpansion = async (index: number) => {
    const item = watchlist[index];
    if (!item) return;

    if (expandedRowIndex === index) {
      setExpandedRowIndex(null);
    } else {
      // Sync the test parameters to load cache
      setTestSymbol(item.symbol);
      setTestInterval(item.interval);
      setTestMinMove(newMinMove);

      // Instantly show existing cached candles if available for quick feedback
      if (item.candles && item.candles.length > 0) {
        const currentDayCandles = filterCurrentDayOnly(item.candles);
        const allMatches = scanAllPatterns(
          currentDayCandles,
          newMinMove,
          requiredCandleCount,
          selectedPatternId,
          maxBodyOverlapPercent,
          patternSettings,
        );
        const { matched, message } = detectPattern(
          currentDayCandles,
          newMinMove,
          requiredCandleCount,
          selectedPatternId,
          maxBodyOverlapPercent,
          patternSettings,
        );

        setTestResult({
          success: true,
          patternMatched: matched,
          message: message || 'Loaded',
          candles: currentDayCandles,
          provider: 'Watchlist Cache',
          allMatches
        });
      } else {
        setTestResult(null);
      }
      setExpandedRowIndex(index);

      // Fetch fresh live candles to ensure today's current pre-market/live data is displayed
      try {
        const res = await fetch(`/api/watch?symbol=${encodeURIComponent(item.symbol)}&interval=${item.interval}&t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          const freshCandles: Candle[] = data.candles || [];
          if (freshCandles.length > 0) {
            const providerName = data.provider || 'Live Feed';
            const isFuturesOrCrypto = item.symbol.includes('=F') || item.symbol.includes('-USD');
            const sessionCandles = isFuturesOrCrypto
              ? freshCandles
              : filterCandlesByWindow(filterCurrentDayOnly(freshCandles), activeWindowRef.current);
            const allMatches = scanAllPatterns(
              sessionCandles,
              newMinMove,
              requiredCandleCount,
              selectedPatternId,
              maxBodyOverlapPercent,
              patternSettings,
            );
            const { matched, message, time } = detectPattern(
              sessionCandles,
              newMinMove,
              requiredCandleCount,
              selectedPatternId,
              maxBodyOverlapPercent,
              patternSettings,
            );
            const status = sessionCandles.length === 0 ? 'no-data' as const : matched;
            const dailyMove = isFuturesOrCrypto
              ? null
              : calculateEquityIntradayChange(freshCandles);

            const alreadyAlerted = item.lastAlertedCandleTime === time
              && item.lastAlertedType === matched
              && item.lastAlertedPatternId === selectedPatternId;
            if (sessionCandles.length > 0 && matched !== 'none' && !alreadyAlerted) {
              triggerAlert(
                item.symbol,
                item.interval,
                matched,
                message,
                sessionCandles[sessionCandles.length - 1]?.close || 0,
                sessionCandles,
                dailyMove,
              );
            }

            setTestResult({
              success: true,
              patternMatched: matched,
              message: message || 'Loaded',
              candles: freshCandles,
              provider: providerName,
              allMatches
            });

            // Update item in watchlist state and cache
            await setLiveCache(item.symbol, item.interval, freshCandles, providerName);
            setWatchlist((prevList) => {
              const updated = [...prevList];
              if (updated[index]) {
                updated[index] = {
                  ...updated[index],
                  candles: freshCandles,
                  status,
                  lastError: sessionCandles.length === 0 ? 'No candles available for today’s selected ET session' : undefined,
                  lastChecked: new Date().toLocaleTimeString(),
                  lastAlertedCandleTime: matched !== 'none' ? time : updated[index].lastAlertedCandleTime,
                  lastAlertedType: matched !== 'none' ? matched : updated[index].lastAlertedType,
                  lastAlertedPatternId: matched !== 'none'
                    ? selectedPatternId
                    : updated[index].lastAlertedPatternId,
                };
              }
              persistWatchlist(updated);
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch fresh candles on expansion:', err);
      }
    }
  };

  const toggleRowRef = useRef(handleToggleRowExpansion);
  toggleRowRef.current = handleToggleRowExpansion;
  const stableToggleRow = React.useCallback(
    (index: number) => toggleRowRef.current(index),
    [],
  );

  const removeSymbolRef = useRef(handleRemoveSymbol);
  removeSymbolRef.current = handleRemoveSymbol;
  const stableRemoveSymbol = React.useCallback(
    (symbol: string, interval: string) => removeSymbolRef.current(symbol, interval),
    [],
  );

  // On-demand refresh of a single row: force a fresh provider fetch (bypassing
  // cache and any auto-pause/scan cadence) and patch just that watchlist row.
  const handleRefreshSymbol = async (symbol: string, interval: string) => {
    const item = watchlistRef.current.find(
      (w) => w.symbol === symbol && w.interval === interval,
    );
    if (!item) return;
    const scanned = await scanSymbol(item, undefined, true);
    const latestList = [...watchlistRef.current];
    const idx = latestList.findIndex((w) => w.symbol === symbol && w.interval === interval);
    if (idx !== -1) {
      latestList[idx] = scanned;
      saveWatchlist(latestList, true);
    }
  };
  const refreshSymbolRef = useRef(handleRefreshSymbol);
  refreshSymbolRef.current = handleRefreshSymbol;
  const stableRefreshSymbol = React.useCallback(
    (symbol: string, interval: string) => refreshSymbolRef.current(symbol, interval),
    [],
  );

  const handleClearAlerts = React.useCallback(() => {
    alertLogsRef.current = [];
    setAlertLogs([]);
    if (alertPersistTimerRef.current !== null) {
      window.clearTimeout(alertPersistTimerRef.current);
      alertPersistTimerRef.current = null;
    }
    localStorage.removeItem('watcher-alerts');
  }, []);

  const handleAlertCardClick = (log: AlertLog) => {
    // 1. Ensure Watchlist tab is active
    setActiveTab('watchlist');

    // 2. Reset active search and status filters so target item is guaranteed to be visible
    setSearchTerm('');
    setFilterMode('all');

    // 3. Ensure category filter includes the target symbol
    const targetCategory: WatchlistCategory = isFuturesSymbol(log.symbol)
      ? 'futures'
      : isCryptoSymbol(log.symbol)
        ? 'crypto'
        : 'stocks';
    if (watchlistCategory !== targetCategory) {
      setWatchlistCategory(targetCategory);
      localStorage.setItem('watcher-watchlist-category', targetCategory);
    }

    const index = watchlist.findIndex(
      (w) => w.symbol.toUpperCase() === log.symbol.toUpperCase() && w.interval === log.interval
    );
    if (index !== -1) {
      if (expandedRowIndex !== index) {
        handleToggleRowExpansion(index);
      }
      setTimeout(() => {
        const targetId = `row-${log.symbol.toUpperCase()}-${log.interval}`;
        const element = document.getElementById(targetId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  };
  const alertCardClickRef = useRef(handleAlertCardClick);
  alertCardClickRef.current = handleAlertCardClick;
  const stableHandleAlertCardClick = React.useCallback(
    (log: AlertLog) => alertCardClickRef.current(log),
    [],
  );

  // 9. Pattern Tester Handler
  const executePatternTest = async (targetSymbol: string, targetInterval: string) => {
    const symbol = targetSymbol.trim().toUpperCase();
    if (!symbol) return;

    setIsTesting(true);
    setTestResult(null);
    // New symbol/interval → reset infinite-history paging.
    hasMoreHistoryRef.current = true;
    setHasMoreHistory(true);
    isLoadingHistoryRef.current = false;
    setIsLoadingHistory(false);

    try {
      let candles: Candle[] = [];
      let providerName = 'Polygon.io';

      // Manual tester loads deep history (scaled by interval) so the chart can
      // pan back like TradingView. Deliberately bypass the shared live cache:
      // that cache holds the scanner's small live window keyed by symbol+interval
      // and writing this large history into it would poison the scanner/watchlist
      // mini-viz. This is an on-demand manual fetch, so no caching is needed.
      const lookbackDays = historyLookbackDays(targetInterval);
      const res = await fetch(`/api/watch?symbol=${encodeURIComponent(symbol)}&interval=${targetInterval}&days=${lookbackDays}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      candles = data.candles || [];
      providerName = data.provider || 'Polygon.io';

      const { matched, message } = detectPattern(
        candles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );
      const allMatches = scanAllPatterns(
        candles,
        newMinMove,
        requiredCandleCount,
        selectedPatternId,
        maxBodyOverlapPercent,
        patternSettings,
      );

      setTestResult({
        success: true,
        patternMatched: matched,
        message,
        candles,
        provider: providerName,
        allMatches
      });
    } catch (err) {
      setTestResult({
        success: false,
        patternMatched: 'none',
        message: err instanceof Error ? err.message : 'Failed to fetch data.',
        candles: [],
        provider: 'N/A',
        allMatches: []
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    await executePatternTest(testSymbol, testInterval);
  };

  // Infinite history: fetch the chunk of candles immediately older than what is
  // already loaded and prepend it. Fired by the chart when the user pans near
  // the left edge. Guards prevent overlapping fetches and paging past the start.
  const loadOlderHistory = React.useCallback(async () => {
    if (isLoadingHistoryRef.current || !hasMoreHistoryRef.current) return;
    const current = testResultRef.current;
    if (!current || !current.success || current.candles.length === 0) return;

    const symbol = testSymbolRef.current.trim().toUpperCase();
    const interval = testIntervalRef.current;
    if (!symbol) return;

    const oldest = current.candles.reduce(
      (min, c) => Math.min(min, c.time),
      Number.POSITIVE_INFINITY,
    );
    const newest = current.candles.reduce((max, c) => Math.max(max, c.time), 0);
    if (!Number.isFinite(oldest)) return;

    // Hard cap: stop once the loaded range spans the per-interval limit (a small
    // buffer absorbs weekend/holiday gaps), or the candle ceiling is hit. Beyond
    // this the user scrolls horizontally within what's already loaded.
    const capDays = historyMaxLookbackDays(interval);
    const spanDays = (newest - oldest) / 86400;
    if (spanDays >= capDays - 1 || current.candles.length >= HISTORY_MAX_CANDLES) {
      hasMoreHistoryRef.current = false;
      setHasMoreHistory(false);
      return;
    }

    isLoadingHistoryRef.current = true;
    setIsLoadingHistory(true);
    try {
      const days = historyLookbackDays(interval);
      const res = await fetch(
        `/api/watch?symbol=${encodeURIComponent(symbol)}&interval=${interval}&days=${days}&before=${oldest}`,
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      const fetched: Candle[] = data.candles || [];
      // Only keep bars strictly older than what we have (avoid overlap dupes).
      const older = fetched.filter((c) => c.time < oldest);

      if (older.length === 0) {
        hasMoreHistoryRef.current = false;
        setHasMoreHistory(false);
      } else {
        const newOldest = older.reduce((min, c) => Math.min(min, c.time), oldest);
        const newCount = current.candles.length + older.length;
        // Reached the cap with this chunk → no further paging.
        if ((newest - newOldest) / 86400 >= capDays - 1 || newCount >= HISTORY_MAX_CANDLES) {
          hasMoreHistoryRef.current = false;
          setHasMoreHistory(false);
        }
        setTestResult((prev) =>
          prev ? { ...prev, candles: [...older, ...prev.candles] } : prev,
        );
      }
    } catch {
      // Leave hasMore untrue so the user can pan again to retry.
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoadingHistory(false);
    }
  }, []);

  // Keep only the current New York market date. Never substitute the previous
  // session: doing so makes stale candles look like live pre-market data.
  const filterCurrentDayOnly = (candles: Candle[]) => {
    if (candles.length === 0) return candles;
    
    // Find TODAY'S current date in America/New_York (market timezone)
    const todayNYDateString = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York'
    });

    return candles.filter((c) => {
      const d = new Date(c.time * 1000);
      const nyDateStr = d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York'
      });
      return nyDateStr === todayNYDateString;
    });
  };

  // Helper to get all filtered candles for tester tab
  const getTesterCandles = () => {
    if (!testResult || !testResult.success || !testResult.candles.length) return [];
    // Watchlist tab: constrain to the polling window (shared with the row mini-viz).
    // Tester tab: keep its own manual Trading Session filter.
    if (activeTab === 'watchlist') {
      const currentItem = expandedRowIndex !== null ? watchlist[expandedRowIndex] : null;
      const targetSymbol = currentItem ? currentItem.symbol : '';
      const sourceCandles = (currentItem?.candles && currentItem.candles.length > 0) ? currentItem.candles : testResult.candles;
      return getWatchlistViewCandles(sourceCandles, targetSymbol);
    }
    let filtered = testResult.candles;
    const isLongInterval = testInterval === '1h' || testInterval === '1d' || testInterval === 'D';
    if (testCurrentDayOnly && !isLongInterval) {
      const dayFiltered = filterCurrentDayOnly(filtered);
      if (dayFiltered.length > 0) filtered = dayFiltered;
    }
    const sessionFiltered = filterCandlesBySession(filtered, testSessionFilter);
    return sessionFiltered.length > 0 ? sessionFiltered : testResult.candles;
  };

  // Candles as shown in the watchlist context (row mini-viz + expanded chart):
  // For Futures (=F), Crypto (-USD), or 24H mode, show full continuous session without midnight/16:00 truncation.
  const getWatchlistViewCandles = (candles: Candle[], symbol?: string) => {
    let filtered = candles;
    const currentSymbol = symbol || (expandedRowIndex !== null && watchlist[expandedRowIndex] ? watchlist[expandedRowIndex].symbol : '');
    const isFuturesOrCrypto = currentSymbol.includes('=F') || currentSymbol.includes('-USD') || watchlistCategory === 'futures';
    const targetWin = isFuturesOrCrypto ? 'all' : (activeWindow || 'pre');

    if (!isFuturesOrCrypto && targetWin !== 'all') {
      const dayFiltered = filterCurrentDayOnly(filtered);
      if (dayFiltered.length > 0) filtered = dayFiltered;
    } else {
      // For Futures 24h continuous mode: preserve recent ~24 hours of continuous candles (144 bars for 10m)
      if (filtered.length > 144) {
        filtered = filtered.slice(-144);
      }
    }

    const winFiltered = filterCandlesByWindow(filtered, targetWin);
    return winFiltered.length > 0 ? winFiltered : candles;
  };

  const watchlistIndexByKey = React.useMemo(() => {
    const index = new Map<string, number>();
    watchlist.forEach((item, itemIndex) => {
      index.set(`${item.symbol}\u0000${item.interval}`, itemIndex);
    });
    return index;
  }, [watchlist]);

  const watchlistViewByKey = React.useMemo(() => {
    const view = new Map<string, Candle[]>();
    watchlist.forEach((item) => {
      view.set(
        `${item.symbol}\u0000${item.interval}`,
        item.candles ? getWatchlistViewCandles(item.candles, item.symbol).slice(-5) : [],
      );
    });
    return view;
    // Recompute only when candle data or the selected display session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, activeWindow, watchlistCategory]);

  const compactWatchlistEntries = React.useMemo<CompactWatchlistEntry[]>(
    () => sortedWatchlist.map((item, sortedIndex) => {
      const key = `${item.symbol}\u0000${item.interval}`;
      const originalIndex = watchlistIndexByKey.get(key) ?? sortedIndex;
      return {
        key,
        index: originalIndex,
        item,
        miniCandles: watchlistViewByKey.get(key) ?? [],
      };
    }),
    [
      sortedWatchlist,
      watchlistIndexByKey,
      watchlistViewByKey,
    ],
  );

  const testerCandles = React.useMemo(
    () => getTesterCandles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testResult, activeTab, expandedRowIndex, watchlist, activeWindow, watchlistCategory, testCurrentDayOnly, testSessionFilter],
  );

  // The Pattern Tester previews the same global minimum used by live scans.
  // Expanded watchlist charts keep their row-specific minimum for inspection.
  const analysisMinMove = activeTab === 'tester' ? newMinMove : testMinMove;
  const testerHistoryPanningEnabled =
    testInterval === '1h' ||
    testInterval === '1d' ||
    testInterval === 'D' ||
    !testCurrentDayOnly;

  const renderJustChartCanvas = () => {
    if (!testResult || !testResult.success || testResult.candles.length === 0) return null;
    if (testerCandles.length === 0) {
      return (
        <div className="bg-muted-bg px-4 py-10 text-center text-sm text-muted">
          No candles are available for today&apos;s selected Eastern Time session.
        </div>
      );
    }

    return (
      <LightweightPatternChart
        symbol={testSymbol}
        candles={testerCandles}
        height={300}
        autoPatternsEnabled={autoPatternsEnabled}
        onTogglePatterns={handleToggleAutoPatterns}
        interval={testInterval}
        providerBadge={testResult.provider}
        subtitle={`${testerCandles.length} candles loaded (${testInterval})`}
        selectedPatternId={selectedPatternId}
        minMovePercent={analysisMinMove}
        requiredCount={requiredCandleCount}
        maxBodyOverlapPercent={maxBodyOverlapPercent}
        scannerPatternMarkersEnabled
        patternSettings={patternSettings}
      />
    );
  };

  return (
    <div className="p-3 sm:p-5 md:p-6 w-full space-y-5 text-foreground">

      {/* COMPACT HEADER HERO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-card-border/40">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-foreground">
            Market Pattern Watcher
          </h1>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] font-semibold text-accent">
            <Clock size={12} className="animate-pulse" />
            Live Scanner
          </div>
        </div>
      </div>

      {/* TABS SELECTION */}
      <div className="flex gap-2 p-1 bg-muted-bg/30 border border-card-border rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'watchlist'
              ? 'bg-accent text-white shadow-md'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <Sliders size={14} />
          Watchlist & Live Monitor
        </button>
        <button
          onClick={() => setActiveTab('tester')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'tester'
              ? 'bg-accent text-white shadow-md'
              : 'text-muted hover:text-foreground'
          }`}
        >
          <Search size={14} />
          Pattern Tester
        </button>
      </div>

      {/* WATCHLIST MONITORS VIEW */}
      {activeTab === 'watchlist' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-fadeIn">
          {/* Watchlist Panel */}
          <div className="order-2 lg:order-1 lg:col-span-8 space-y-5">
            <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Sliders size={18} className="text-accent" /> Watchlist
                  </h2>
                  <p className="text-xs text-muted mt-0.5">Define assets and intervals to monitor automatically</p>
                </div>

                {/* Countdown / Scan Now */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      const next = !isScannerPaused;
                      setIsScannerPaused(next);
                      localStorage.setItem('watcher-scanner-paused', String(next));
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      isScannerPaused
                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20'
                        : marketAutoPaused
                        ? 'bg-slate-500/10 text-slate-400 border-slate-500/20 hover:bg-slate-500/20'
                        : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                    title={isScannerPaused ? 'Resume Automatic Scanning' : 'Pause Automatic Scanning'}
                  >
                    {marketAutoPaused && !isScannerPaused ? (
                      <Moon size={12} className="shrink-0" />
                    ) : (
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isScannerPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                    )}
                    <span>{isAuthenticated ? (isSseConnected ? 'Live · Server Scanning' : 'Connecting…') : isScannerPaused ? 'Scanner Paused' : marketAutoPaused ? 'Market Closed' : 'Scanner Active'}</span>
                  </button>

                  {/* Browser round-robin countdown only applies to the signed-out
                      local scanner; when authenticated the server scans, so hide it. */}
                  {!isAuthenticated && effectivelyActive && categoryItems.length > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-muted-bg border border-card-border px-3 py-1.5 rounded-lg text-muted shrink-0 min-w-[15.5rem] justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Clock size={12} className="text-accent shrink-0" />
                        <span className="shrink-0">Next scan:</span>
                        <span className="text-foreground font-semibold inline-flex items-center justify-center min-w-[3.75rem] max-w-[5.5rem] truncate px-1 py-0.5 rounded bg-card-bg/60 border border-card-border/40 text-center font-mono">
                          {categoryItems[nextScanIndex % categoryItems.length]?.symbol}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-muted">in</span>
                        <span className="font-mono text-accent font-bold inline-block min-w-[2.25rem] text-right">
                          <ScanCountdown
                            key={`${nextScanIndex}-${scanIntervalMinutes}-${watchlistCategory}`}
                            seconds={spacingSeconds}
                          />
                        </span>
                      </div>
                    </div>
                  )}

                  {marketAutoPaused && !isScannerPaused && categoryItems.length > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-slate-500/10 border border-slate-500/20 px-3 py-1.5 rounded-lg text-slate-400">
                      <Moon size={12} />
                      <span>Auto-paused until session open ({windowStartLabel})</span>
                    </div>
                  )}
                  
                  <BatchScanControl
                    ref={batchScanControlRef}
                    disabled={categoryItems.length === 0}
                    isParallel={parallelScanEnabled && !isPolygonActive}
                    onScan={stableHandleScanAll}
                  />
                </div>
              </div>

              {/* SINGLE COMPACT TOOLBAR: Timeframe on Left, Category Tabs + Mute Icons on Right */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                {/* Left: Global Timeframe Selector */}
                <div className="flex items-center gap-2 bg-muted-bg/30 px-3 py-1.5 rounded-xl border border-card-border/50 shrink-0">
                  <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                    <Clock size={14} className="text-accent" /> Timeframe:
                  </span>
                  <select
                    value={newInterval}
                    onChange={(e) => handleGlobalIntervalChange(e.target.value)}
                    className="bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-lg py-1 px-2 text-xs text-foreground font-bold cursor-pointer outline-none transition-all"
                    title="Select global timeframe interval for all watchlist symbols"
                  >
                    <option value="1m">1m (Test)</option>
                    <option value="2m">2m</option>
                    <option value="5m">5m</option>
                    <option value="10m">10m</option>
                    <option value="15m">15m</option>
                    <option value="30m">30m</option>
                    <option value="45m">45m</option>
                    <option value="1h">1h</option>
                  </select>
                </div>

                {/* Right: Category Tabs with Integrated Category Mute (Bell) Buttons */}
                <div className="flex flex-wrap items-center gap-1 bg-muted-bg/40 p-1 rounded-xl border border-card-border/50">
                  {(
                    [
                      { id: 'stocks', label: 'Stocks', icon: ChartCandlestick, count: watchlist.filter((w) => !isFuturesSymbol(w.symbol) && !isCryptoSymbol(w.symbol)).length },
                      { id: 'crypto', label: 'Crypto', icon: Bitcoin, count: watchlist.filter((w) => isCryptoSymbol(w.symbol)).length },
                      { id: 'futures', label: 'Futures', icon: Zap, count: watchlist.filter((w) => isFuturesSymbol(w.symbol)).length },
                      { id: 'all', label: 'All Tickers', icon: null, count: watchlist.length },
                    ] as const
                  ).map((cat) => {
                    const active = watchlistCategory === cat.id;
                    const Icon = cat.icon;
                    const hasMuteToggle = cat.id === 'stocks' || cat.id === 'crypto' || cat.id === 'futures';
                    const isOff = hasMuteToggle && disabledCategories.includes(cat.id);

                    return (
                      <div
                        key={cat.id}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          active
                            ? 'bg-accent text-white shadow-sm font-bold'
                            : 'text-muted hover:text-foreground'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setWatchlistCategory(cat.id);
                            localStorage.setItem('watcher-watchlist-category', cat.id);
                          }}
                          className="flex items-center gap-1.5 focus:outline-none"
                        >
                          {Icon && <Icon size={14} />}
                          <span>
                            {cat.label} ({cat.count})
                          </span>
                        </button>

                        {hasMuteToggle && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCategoryScanning(cat.id as 'stocks' | 'crypto' | 'futures');
                            }}
                            title={
                              isOff
                                ? `${cat.label} background alerts are OFF — click to turn on`
                                : `${cat.label} background alerts are ON — click to mute`
                            }
                            className={`p-0.5 rounded transition-all ml-0.5 ${
                              isOff
                                ? 'text-red-400 hover:bg-red-500/20'
                                : active
                                  ? 'text-white/80 hover:text-white hover:bg-white/10'
                                  : 'text-muted hover:text-emerald-400 hover:bg-emerald-500/10'
                            }`}
                          >
                            {isOff ? <BellOff size={13} /> : <Bell size={13} />}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <PatternGuidePanel
                value={selectedPatternId}
                onChange={handlePatternChange}
                minMovePercent={newMinMove}
                requiredCount={requiredCandleCount}
                maxBodyOverlapPercent={maxBodyOverlapPercent}
                onMinMoveChange={handleNewMinMoveChange}
                onRequiredCountChange={handleRequiredCandleCountChange}
                onMaxBodyOverlapChange={handleMaxBodyOverlapChange}
                patternSettings={patternSettings}
                onPatternSettingsChange={handlePatternSettingsChange}
              />

              {/* WATCHLIST FORM */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6 bg-muted-bg/30 p-4 rounded-xl border border-card-border">
                {addNotice && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`sm:col-span-12 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                      addNotice.type === 'success'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                        : addNotice.type === 'error'
                          ? 'border-rose-500/25 bg-rose-500/10 text-rose-400'
                          : 'border-amber-500/25 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {addNotice.type === 'success'
                      ? <CheckCircle2 size={15} className="shrink-0" />
                      : <AlertTriangle size={15} className="shrink-0" />}
                    <span>{addNotice.message}</span>
                  </div>
                )}
                <TickerInput
                  ref={tickerInputRef}
                  category={watchlistCategory}
                  placeholder={
                    watchlistCategory === 'futures'
                      ? 'e.g. NQ, ES, CL'
                      : watchlistCategory === 'crypto'
                        ? 'e.g. BTC, ETH, SOL'
                        : 'e.g. AAPL, NVDA, SPY'
                  }
                  onSearch={setSearchTerm}
                  onAdd={stableAddSymbol}
                  className="sm:col-span-9 relative"
                />

                <div className="sm:col-span-3">
                  <button
                    onClick={() => tickerInputRef.current?.add()}
                    className="w-full h-full flex items-center justify-center gap-1 bg-accent hover:bg-accent/80 active:bg-accent text-white rounded-xl text-sm font-semibold transition-colors py-2.5 sm:py-0"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>

              {/* FUTURES QUICK PRESETS TOOLBAR */}
              {watchlistCategory === 'futures' && (
                <div className="flex flex-wrap items-center gap-1.5 mb-6 text-xs bg-muted-bg/10 p-3 rounded-xl border border-card-border/30">
                  <span className="text-muted font-bold mr-1 flex items-center gap-1">
                    <Zap size={13} />
                    Quick Presets:
                  </span>
                  {FUTURES_QUICK_PRESETS.map((preset) => {
                    const exists = watchlist.some((w) => w.symbol === preset.symbol && w.interval === newInterval);
                    return (
                      <button
                        key={preset.symbol}
                        onClick={() => handleAddPreset(preset.symbol)}
                        disabled={exists}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          exists
                            ? 'bg-muted-bg/30 text-muted/40 border-card-border/20 cursor-not-allowed'
                            : 'bg-card-bg border-card-border hover:border-accent text-foreground hover:text-accent cursor-pointer shadow-sm'
                        }`}
                        title={exists ? `${preset.symbol} (${newInterval}) is already in your watchlist` : `Click to add ${preset.symbol} (${newInterval})`}
                      >
                        <Plus size={12} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* WATCHLIST ITEMS LIST */}
              {watchlist.length === 0 ? (
                <div className="text-center py-12 bg-muted-bg/10 border border-dashed border-card-border rounded-xl">
                  <p className="text-muted text-sm">Your watchlist is empty.</p>
                  <p className="text-muted/60 text-xs mt-1">Add ticker symbols above to monitor them.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Search and Filters Bar */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-muted-bg/10 p-3 rounded-xl border border-card-border/30">
                    <WatchlistViewToggle
                      value={watchlistView}
                      onChange={handleWatchlistViewChange}
                    />
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        onClick={() => setFilterMode('all')}
                        className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                          filterMode === 'all'
                            ? 'bg-accent text-white shadow-sm'
                            : 'bg-card-bg border border-card-border text-muted hover:text-foreground'
                        }`}
                      >
                        All ({categoryItems.length})
                      </button>
                      <button
                        onClick={() => setFilterMode('alerts')}
                        className={`px-2.5 py-1 rounded-md transition-all font-semibold flex items-center gap-1 ${
                          filterMode === 'alerts'
                            ? 'bg-rose-500 text-white shadow-sm'
                            : 'bg-card-bg border border-card-border text-muted hover:text-rose-400'
                        }`}
                      >
                        Alerts ({categoryItems.filter(w => w.status === 'bullish' || w.status === 'bearish').length})
                      </button>
                      <button
                        onClick={() => setFilterMode('errors')}
                        className={`px-2.5 py-1 rounded-md transition-all font-semibold ${
                          filterMode === 'errors'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-card-bg border border-card-border text-muted hover:text-amber-400'
                        }`}
                      >
                        Errors ({categoryItems.filter(w => w.status === 'error').length})
                      </button>

                      <button
                        onClick={handleToggleAutoPatterns}
                        className={`px-2.5 py-1 rounded-md transition-all font-semibold flex items-center gap-1.5 border ml-1 ${
                          autoPatternsEnabled
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-card-bg border-card-border text-muted hover:text-foreground'
                        }`}
                        title="Toggle Auto Patterns on Live Watchlist Charts"
                      >
                        <Sparkles size={12} className={autoPatternsEnabled ? 'text-amber-400 animate-pulse' : ''} />
                        <span>Auto Patterns</span>
                      </button>
                    </div>
                  </div>

                  {sortedWatchlist.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-card-border px-4 py-10 text-center text-xs text-muted">
                      No symbols match the current ticker search and status filter.
                    </div>
                  ) : watchlistView === 'compact' ? (
                    <CompactWatchlist
                      entries={compactWatchlistEntries}
                      expandedIndex={expandedRowIndex}
                      expandedChart={
                        expandedRowIndex !== null
                        && testResult
                        && testResult.success
                        && testResult.candles.length > 0
                          ? renderJustChartCanvas()
                          : null
                      }
                      onToggle={stableToggleRow}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-card-border text-[10px] text-muted font-bold uppercase tracking-wider">
                        <th onClick={() => handleSort('symbol')} className="py-3 px-4 cursor-pointer select-none hover:text-foreground transition-colors group">
                          <div className="inline-flex items-center gap-1">
                            <span>Symbol</span>
                            {sortColumn === 'symbol' ? (
                              sortDirection === 'asc' ? <ArrowUp size={12} className="text-accent" /> : <ArrowDown size={12} className="text-accent" />
                            ) : (
                              <ArrowUpDown size={11} className="text-muted/40 group-hover:text-muted transition-colors" />
                            )}
                          </div>
                        </th>
                        <th onClick={() => handleSort('interval')} className="py-3 px-4 cursor-pointer select-none hover:text-foreground transition-colors group">
                          <div className="inline-flex items-center gap-1">
                            <span>Interval</span>
                            {sortColumn === 'interval' ? (
                              sortDirection === 'asc' ? <ArrowUp size={12} className="text-accent" /> : <ArrowDown size={12} className="text-accent" />
                            ) : (
                              <ArrowUpDown size={11} className="text-muted/40 group-hover:text-muted transition-colors" />
                            )}
                          </div>
                        </th>
                        <th className="py-3 px-4 text-center">Last Candles</th>
                        <th className="py-3 px-4">Last Check</th>
                        <th onClick={() => handleSort('status')} className="py-3 px-4 cursor-pointer select-none hover:text-foreground transition-colors group">
                          <div className="inline-flex items-center gap-1">
                            <span>Status</span>
                            {sortColumn === 'status' ? (
                              sortDirection === 'asc' ? <ArrowUp size={12} className="text-accent" /> : <ArrowDown size={12} className="text-accent" />
                            ) : (
                              <ArrowUpDown size={11} className="text-muted/40 group-hover:text-muted transition-colors" />
                            )}
                          </div>
                        </th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border/40">
                      {sortedWatchlist.map((item, sortedIdx) => {
                        const itemKey = `${item.symbol}\u0000${item.interval}`;
                        const originalIdx = watchlistIndexByKey.get(itemKey) ?? -1;
                        const idx = originalIdx !== -1 ? originalIdx : sortedIdx;
                        const miniCandles = watchlistViewByKey.get(itemKey)!;
                        return (
                          <React.Fragment key={`${item.symbol}-${item.interval}-${idx}`}>
                            <WatchlistRow
                              item={item}
                              index={idx}
                              miniCandles={miniCandles}
                              onToggle={stableToggleRow}
                              onRemove={stableRemoveSymbol}
                              onRefresh={stableRefreshSymbol}
                            />
                            
                            {/* Expanded sub-row containing the chart */}
                            {expandedRowIndex === idx && testResult && testResult.success && testResult.candles.length > 0 && (
                              <tr className="bg-slate-900/10 border-t border-b border-card-border/30">
                                <td colSpan={6} className="p-0">
                                  {renderJustChartCanvas()}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                  )}
              </div>
            )}
              
              {/* Global Watchlist Settings & Notification Test Controls */}
              <div className="mt-6 pt-6 border-t border-card-border space-y-4 text-xs text-muted">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  {watchlistCategory === 'futures' ? (
                    <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                      <Zap size={14} />
                      <span>Futures Scanner Mode: 24/7 Continuous Monitoring (Asian, European & US Sessions)</span>
                    </div>
                  ) : watchlistCategory === 'crypto' ? (
                    <div className="flex items-center gap-1.5 text-xs text-orange-400 font-semibold bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/20">
                      <Bitcoin size={14} />
                      <span>Crypto Scanner Mode: 24/7 Continuous Monitoring</span>
                    </div>
                  ) : null}
                </div>

                {/* Sound & Notification Test Bar */}
                <div className="pt-3 border-t border-card-border/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setIsSoundEnabled(!isSoundEnabled)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isSoundEnabled
                          ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30'
                          : 'bg-slate-800/40 text-slate-500 border border-card-border'
                      }`}
                      title={isSoundEnabled ? 'Disable Audio Alert' : 'Enable Audio Alert'}
                    >
                      {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                    </button>

                    <button
                      onClick={requestNotificationPermission}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                        isNotificationsEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30 hover:bg-amber-500/30'
                      }`}
                    >
                      {isNotificationsEnabled ? (
                        <>
                          <Bell size={14} /> Desktop Notifications Active
                        </>
                      ) : (
                        <>
                          <BellOff size={14} /> Enable Desktop Alerts
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestSound}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-muted-bg hover:bg-card-bg text-foreground border border-card-border transition-colors cursor-pointer"
                    >
                      Test Sound
                    </button>
                    <button
                      onClick={handleTestNotification}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-muted-bg hover:bg-card-bg text-foreground border border-card-border transition-colors cursor-pointer"
                    >
                      <Bell size={13} /> Test Notification
                    </button>
                  </div>
                </div>

                {notificationFeedback && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`max-w-md rounded-lg border px-3 py-2 text-[11px] font-medium ${
                      notificationFeedback.type === 'success'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/25 bg-amber-500/10 text-amber-300'
                    }`}
                  >
                    {notificationFeedback.message}
                  </div>
                )}
              </div>
            </div>

            </div>

          <div className="order-1 lg:order-2 lg:col-span-4">
            <AlertHistoryPanel
              alerts={alertLogs}
              onAlertClick={stableHandleAlertCardClick}
              onClear={handleClearAlerts}
            />
          </div>
        </div>
      )}

      {/* PATTERN TESTER VIEW */}
      {activeTab === 'tester' && (
        <div className="animate-fadeIn">
          <PatternTesterSection
            testSymbol={testSymbol}
            onSymbolChange={setTestSymbol}
            testInterval={testInterval}
            onIntervalChange={(iv) => {
              setTestInterval(iv);
              void executePatternTest(testSymbol, iv);
            }}
            testSessionFilter={testSessionFilter}
            onSessionFilterChange={setTestSessionFilter}
            testMinMove={newMinMove}
            onMinMoveChange={handleNewMinMoveChange}
            isTesting={isTesting}
            onRunTest={handleRunTest}
            testResult={testResult}
            testerCandles={testerCandles}
            onLoadMoreHistory={testerHistoryPanningEnabled ? loadOlderHistory : undefined}
            loadingMore={isLoadingHistory}
            hasMore={testerHistoryPanningEnabled && hasMoreHistory}
            autoPatternsEnabled={autoPatternsEnabled}
            onToggleAutoPatterns={handleToggleAutoPatterns}
            testCurrentDayOnly={testCurrentDayOnly}
            onToggleCurrentDayOnly={setTestCurrentDayOnly}
            selectedPatternId={selectedPatternId}
            onPatternChange={handlePatternChange}
            requiredCount={requiredCandleCount}
            onRequiredCountChange={handleRequiredCandleCountChange}
            maxBodyOverlapPercent={maxBodyOverlapPercent}
            onMaxBodyOverlapChange={handleMaxBodyOverlapChange}
            patternSettings={patternSettings}
            onPatternSettingsChange={handlePatternSettingsChange}
          />
        </div>
      )}
      
    </div>
  );
}
