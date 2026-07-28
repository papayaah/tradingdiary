'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  BellOff, 
  Play, 
  Plus, 
  Volume2, 
  VolumeX, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  History,
  Search,
  Sliders,
  ChartCandlestick,
  Bitcoin,
  Moon,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { getChartDB } from '@/lib/chart/cache';
import AlertHistoryPanel from './AlertHistoryPanel';
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
  isPatternId,
  scanAllPatterns,
  type Candle,
  type PatternId,
  type PatternMatch,
} from './watchAnalysis';
import PatternSelector from './PatternSelector';
import WatchlistRow from './WatchlistRow';
import CompactWatchlist, {
  type CompactWatchlistEntry,
} from './CompactWatchlist';
import { authClient } from '@/lib/auth-client';
import { useServerWatchStream } from '@/hooks/useServerWatchStream';

interface WatchItem {
  symbol: string;
  interval: string;
  minMovePercent: number;
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
  candles?: Candle[];
}

interface PendingAlert {
  createdAt: number;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  price: number;
  candles?: Candle[];
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

const getPersistedWatchlist = (items: WatchItem[]): WatchItem[] =>
  items.map((item) => ({
    symbol: item.symbol,
    interval: item.interval,
    minMovePercent: item.minMovePercent,
    lastAlertedCandleTime: item.lastAlertedCandleTime,
    lastAlertedType: item.lastAlertedType,
    lastAlertedPatternId: item.lastAlertedPatternId,
  }));

const persistWatchlist = (items: WatchItem[]) => {
  localStorage.setItem('watcher-watchlist', JSON.stringify(getPersistedWatchlist(items)));
};

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
  const tickerInputRef = useRef<TickerInputHandle>(null);
  const batchScanControlRef = useRef<BatchScanControlHandle>(null);
  const [newInterval, setNewInterval] = useState('10m');
  const [newMinMove, setNewMinMove] = useState(0.25); // min move percentage (e.g. 0.25% cumulative)

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

  const [selectedSetupTime, setSelectedSetupTime] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'watchlist' | 'tester'>('watchlist');
  const [chartOffset, setChartOffset] = useState(0);
  const [nextScanIndex, setNextScanIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);
  const [watchlistView, setWatchlistView] = useState<WatchlistView>('compact');

  // Settings & Notification States
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [notificationFeedback, setNotificationFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState(10); // Polling interval
  const [isBackgroundScanning, setIsBackgroundScanning] = useState(false);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const alertLogsRef = useRef<AlertLog[]>([]);
  alertLogsRef.current = alertLogs;
  const alertPersistTimerRef = useRef<number | null>(null);
  const [addNotice, setAddNotice] = useState<{
    type: 'success' | 'duplicate';
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
  const [selectedPatternId, setSelectedPatternId] = useState<PatternId>(() => {
    if (typeof window === 'undefined') return 'consecutive';
    const saved = localStorage.getItem('watcher-selected-pattern');
    return isPatternId(saved) ? saved : 'consecutive';
  });
  const [overrideGlobalMinMove, setOverrideGlobalMinMove] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('watcher-override-global-min-move');
    return saved !== null ? saved === 'true' : false;
  });

  // Sorting state for Watchlist table
  const [sortColumn, setSortColumn] = useState<'symbol' | 'interval' | 'minMove' | 'status' | null>(null);
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

  // Server-side Live SSE Stream Integration
  const { connected: isSseConnected } = useServerWatchStream({
    // Hold the connection until the snapshot cursor is known so we resume from
    // it instead of replaying history.
    enabled: isAuthenticated && snapshotCursor !== null,
    initialCursor: snapshotCursor ?? 0,
    onStateUpdate: (data) => {
      if (!data?.symbol) return;
      setWatchlist((prev) =>
        prev.map((item) => {
          if (item.symbol.toUpperCase() === data.symbol.toUpperCase() && item.interval === data.interval) {
            const mappedStatus =
              data.status === 'bullish' || data.status === 'bearish'
                ? data.status
                : data.status === 'no-data' || data.status === 'error'
                ? data.status
                : 'none';
            return {
              ...item,
              status: mappedStatus,
              lastPrice: data.lastPrice ?? item.lastPrice,
              lastChecked: data.lastScannedAt ? new Date(data.lastScannedAt).toLocaleTimeString() : new Date().toLocaleTimeString(),
              candles: data.recentCandles && data.recentCandles.length > 0 ? data.recentCandles : item.candles,
              lastError: data.lastError ?? item.lastError,
            };
          }
          return item;
        })
      );
    },
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
        price: data.candles?.[data.candles.length - 1]?.close || 0,
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
        if (Array.isArray(snapshot.alerts) && snapshot.alerts.length > 0) {
          const mappedAlerts: AlertLog[] = snapshot.alerts.map((a: any) => ({
            id: a.id,
            createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
            symbol: a.symbol,
            interval: a.interval,
            type: a.direction === 'bearish' ? 'bearish' : 'bullish',
            details: a.message || `${a.patternId || 'Pattern'} on ${a.symbol} (${a.interval})`,
            price: a.price || 0,
            candles: [],
          }));
          setAlertLogs(mappedAlerts);
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

  const handleSort = (column: 'symbol' | 'interval' | 'minMove' | 'status') => {
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
  ) => {
    const cleanList = items.map((item) => ({
      symbol: item.symbol,
      interval: item.interval,
      minMovePercent: item.minMovePercent,
    }));
    return fetch('/api/watch/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        watchlist: cleanList,
        patternId,
        session,
        scanFrequencySeconds: Math.round(frequencyMinutes * 60),
        disabledAssetClasses: disabledCategoriesRef.current.map((c) => CATEGORY_TO_ASSET_CLASS[c]),
      }),
    });
  }, [activeWindow, scanIntervalMinutes, selectedPatternId]);

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
        item.minMovePercent,
        requiredCandleCount,
        patternId,
      );
      return { ...item, status: matched };
    }));
  }, [requiredCandleCount, syncScannerSettings, watchlist]);

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
      } else if (sortColumn === 'minMove') {
        aVal = a.minMovePercent;
        bVal = b.minMovePercent;
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
      { symbol: 'AAPL', interval: '5m', minMovePercent: 0.1 },
      { symbol: 'TSLA', interval: '10m', minMovePercent: 0.25 },
      { symbol: 'NVDA', interval: '10m', minMovePercent: 0.25 },
      { symbol: 'SPY', interval: '5m', minMovePercent: 0.05 },
      { symbol: 'QQQ', interval: '10m', minMovePercent: 0.2 },
      { symbol: 'NQ=F', interval: '10m', minMovePercent: 0.05 },
      { symbol: 'ES=F', interval: '10m', minMovePercent: 0.05 },
      { symbol: 'YM=F', interval: '10m', minMovePercent: 0.05 },
      { symbol: 'CL=F', interval: '10m', minMovePercent: 0.05 },
      { symbol: 'GC=F', interval: '10m', minMovePercent: 0.05 },
      { symbol: 'SI=F', interval: '10m', minMovePercent: 0.05 },
    ];

    const savedWatch = localStorage.getItem('watcher-watchlist');
    if (savedWatch) {
      try {
        const loaded: WatchItem[] = JSON.parse(savedWatch);
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
            setWatchlist(data.watchlist);
            persistWatchlist(data.watchlist);
          }
        }
        if (isPatternId(data?.patternId)) {
          setSelectedPatternId(data.patternId);
          localStorage.setItem('watcher-selected-pattern', data.patternId);
        }
        if (data?.session === 'rth' || data?.session === 'pre' || data?.session === 'ext' || data?.session === 'all') {
          setActiveWindow(data.session);
          localStorage.setItem('watcher-active-window', data.session);
        }
        if (typeof data?.scanFrequencySeconds === 'number' && data.scanFrequencySeconds >= 60) {
          const minutes = data.scanFrequencySeconds / 60;
          setScanIntervalMinutes(minutes);
          localStorage.setItem('watcher-scan-interval', String(minutes));
        }
        // Category on/off is server-authoritative: hydrate the toggles from the
        // server's actual enabled flags, not localStorage, so every device shows
        // the true state and the server is the single source of truth.
        if (Array.isArray(data?.disabledAssetClasses)) {
          const ASSET_CLASS_TO_CATEGORY: Record<string, ScanCategory> = {
            equity: 'stocks',
            crypto: 'crypto',
            futures: 'futures',
          };
          const cats = data.disabledAssetClasses
            .map((c: string) => ASSET_CLASS_TO_CATEGORY[c])
            .filter((c: ScanCategory | undefined): c is ScanCategory => !!c);
          disabledCategoriesRef.current = cats;
          setDisabledCategories(cats);
          localStorage.setItem('watcher-disabled-categories', JSON.stringify(cats));
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

    // Load tester settings
    const savedActiveTab = localStorage.getItem('watcher-active-tab');
    if (savedActiveTab === 'watchlist' || savedActiveTab === 'tester') {
      setActiveTab(savedActiveTab);
    }
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

  const formatEasternTime = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

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
    collector?: (alert: PendingAlert) => void,
  ) => {
    const alert: PendingAlert = {
      createdAt: Date.now(),
      symbol: symbol.toUpperCase(),
      interval,
      type,
      details: message,
      price,
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
  ): Promise<WatchItem> => {
    try {
      let candles: Candle[] = [];
      let providerName = 'Polygon.io';

      // 1. Try fetching from IndexedDB cache first
      const cache = await getLiveCache(item.symbol, item.interval);
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
          const res = await fetch(`/api/watch?symbol=${encodeURIComponent(item.symbol)}&interval=${item.interval}`, {
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
      const targetMinMove = overrideGlobalMinMove ? newMinMove : item.minMovePercent;
      const { matched, message, time } = detectPattern(
        scanCandles,
        targetMinMove,
        requiredCandleCount,
        selectedPatternId,
      );
      const status = scanCandles.length === 0 ? 'no-data' as const : matched;

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

  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;

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
          const targetMinMove = overrideGlobalMinMove ? newMinMove : item.minMovePercent;
          const { matched, message } = detectPattern(
            scanned.candles,
            targetMinMove,
            requiredCandleCount,
            selectedPatternId,
          );
          const allMatches = scanAllPatterns(
            scanned.candles,
            targetMinMove,
            requiredCandleCount,
            selectedPatternId,
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
  }, []);

  const handleScanAll = async () => {
    // "Scan All" spans the whole watchlist, not just the current tab — but skips
    // any muted (switched-off) category regardless of which tab is showing.
    const categoryOf = (symbol: string): ScanCategory =>
      isFuturesSymbol(symbol) ? 'futures' : isCryptoSymbol(symbol) ? 'crypto' : 'stocks';
    const targetList = watchlistRef.current.filter(
      (w) => !disabledCategoriesRef.current.includes(categoryOf(w.symbol)),
    );

    // Signed in: the server is authoritative. Don't browser-scan the provider —
    // just pull the latest server state (zero provider calls). Report the count
    // of watches acted on so the progress reads sensibly, not 1/1.
    if (isAuthenticatedRef.current) {
      if (isBatchScanning) return;
      const count = targetList.length || 1;
      setIsBatchScanning(true);
      batchScanControlRef.current?.start(count);
      try {
        await refreshFromServerSnapshot();
      } catch (err) {
        console.error('Snapshot refresh error:', err);
      } finally {
        batchScanControlRef.current?.update(count, count);
        batchScanControlRef.current?.complete(count);
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

    // Instant catch-up scan when switching back to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        onTick();
      }
    };
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
  }, [categoryItems.length, isScannerPaused, watchlistCategory]);



  // Adjust polling frequency
  const handleIntervalChange = (mins: number) => {
    setScanIntervalMinutes(mins);
    localStorage.setItem('watcher-scan-interval', String(mins));
    void syncScannerSettings(watchlist, selectedPatternId, activeWindow, mins).catch(() => {});
  };

  const showAddNotice = (type: 'success' | 'duplicate', message: string) => {
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
  const handleAddSymbol = (input: string) => {
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

    const newItem: WatchItem = {
      symbol,
      interval: newInterval,
      minMovePercent: newMinMove,
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
      minMovePercent: newMinMove,
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

  // Save inline edits to Min Move threshold
  const handleSaveInlineMinMove = (index: number, val: number) => {
    setWatchlist((prevList) => {
      const updated = [...prevList];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          minMovePercent: val
        };
        // Re-run setup scan client-side for this symbol if candles are already present
        if (updated[index].candles && updated[index].candles.length > 0) {
          const { matched } = detectPattern(
            updated[index].candles,
            val,
            requiredCandleCount,
            selectedPatternId,
          );
          updated[index].status = matched;
        }
      }
      persistWatchlist(updated);
      return updated;
    });

    if (expandedRowIndex === index) {
      setTestMinMove(val);
    }
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
      setTestMinMove(item.minMovePercent);
      setSelectedSetupTime(null);
      setChartOffset(0);

      // Instantly show existing cached candles if available for quick feedback
      if (item.candles && item.candles.length > 0) {
        const currentDayCandles = filterCurrentDayOnly(item.candles);
        const allMatches = scanAllPatterns(
          currentDayCandles,
          item.minMovePercent,
          requiredCandleCount,
          selectedPatternId,
        );
        const { matched, message } = detectPattern(
          currentDayCandles,
          item.minMovePercent,
          requiredCandleCount,
          selectedPatternId,
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
              item.minMovePercent,
              requiredCandleCount,
              selectedPatternId,
            );
            const { matched, message, time } = detectPattern(
              sessionCandles,
              item.minMovePercent,
              requiredCandleCount,
              selectedPatternId,
            );
            const status = sessionCandles.length === 0 ? 'no-data' as const : matched;

            const alreadyAlerted = item.lastAlertedCandleTime === time
              && item.lastAlertedType === matched
              && item.lastAlertedPatternId === selectedPatternId;
            if (sessionCandles.length > 0 && matched !== 'none' && !alreadyAlerted) {
              triggerAlert(item.symbol, item.interval, matched, message, sessionCandles[sessionCandles.length - 1]?.close || 0, sessionCandles);
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

  const saveMinMoveRef = useRef(handleSaveInlineMinMove);
  saveMinMoveRef.current = handleSaveInlineMinMove;
  const stableSaveMinMove = React.useCallback(
    (index: number, value: number) => saveMinMoveRef.current(index, value),
    [],
  );

  const removeSymbolRef = useRef(handleRemoveSymbol);
  removeSymbolRef.current = handleRemoveSymbol;
  const stableRemoveSymbol = React.useCallback(
    (symbol: string, interval: string) => removeSymbolRef.current(symbol, interval),
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
  const handleRunTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const symbol = testSymbol.trim().toUpperCase();
    if (!symbol) return;

    setIsTesting(true);
    setTestResult(null);
    setSelectedSetupTime(null);
    setChartOffset(0);

    try {
      let candles: Candle[] = [];
      let providerName = 'Polygon.io';

      // Check cache first
      const cache = await getLiveCache(symbol, testInterval);
      if (cache) {
        candles = cache.candles;
        providerName = cache.provider || 'Polygon.io';
      } else {
        // Fetch fresh
        const res = await fetch(`/api/watch?symbol=${encodeURIComponent(symbol)}&interval=${testInterval}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        candles = data.candles || [];
        providerName = data.provider || 'Polygon.io';

        // Cache it
        await setLiveCache(symbol, testInterval, candles, providerName);
      }

      const { matched, message } = detectPattern(
        candles,
        testMinMove,
        requiredCandleCount,
        selectedPatternId,
      );
      const allMatches = scanAllPatterns(
        candles,
        testMinMove,
        requiredCandleCount,
        selectedPatternId,
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
    if (testCurrentDayOnly) {
      filtered = filterCurrentDayOnly(filtered);
    }
    return filterCandlesBySession(filtered, testSessionFilter);
  };

  // Candles as shown in the watchlist context (row mini-viz + expanded chart):
  // For Futures (=F), Crypto (-USD), or 24H mode, show full continuous session without midnight/16:00 truncation.
  const getWatchlistViewCandles = (candles: Candle[], symbol?: string) => {
    let filtered = candles;
    const currentSymbol = symbol || (expandedRowIndex !== null && watchlist[expandedRowIndex] ? watchlist[expandedRowIndex].symbol : '');
    const isFuturesOrCrypto = currentSymbol.includes('=F') || currentSymbol.includes('-USD') || watchlistCategory === 'futures';
    const targetWin = isFuturesOrCrypto ? 'all' : (activeWindow || 'pre');

    if (!isFuturesOrCrypto && targetWin !== 'all') {
      filtered = filterCurrentDayOnly(filtered);
    } else {
      // For Futures 24h continuous mode: preserve recent ~24 hours of continuous candles (144 bars for 10m)
      if (filtered.length > 144) {
        filtered = filtered.slice(-144);
      }
    }

    filtered = filterCandlesByWindow(filtered, targetWin);
    return filtered;
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
    [sortedWatchlist, watchlistIndexByKey, watchlistViewByKey],
  );

  const testerCandles = React.useMemo(
    () => getTesterCandles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testResult, activeTab, expandedRowIndex, watchlist, activeWindow, watchlistCategory, testCurrentDayOnly, testSessionFilter],
  );

  // Price analysis & pattern scanning computed dynamically on the filtered candles
  const currentPattern = React.useMemo(
    () => detectPattern(testerCandles, testMinMove, requiredCandleCount, selectedPatternId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testerCandles, testMinMove, testInterval, requiredCandleCount, selectedPatternId],
  );
  const { matched: currentPatternMatched, message: currentPatternMessage } = currentPattern;
  const currentMatches = React.useMemo(
    () => scanAllPatterns(testerCandles, testMinMove, requiredCandleCount, selectedPatternId),
    [testerCandles, testMinMove, requiredCandleCount, selectedPatternId],
  );

  const getDisplayedCandles = () => {
    const total = testerCandles.length;
    const count = Math.min(total, 80);
    const start = Math.max(0, total - count - chartOffset);
    const end = Math.max(count, total - chartOffset);
    return testerCandles.slice(start, end);
  };

  const displayedCandles = React.useMemo(
    () => getDisplayedCandles(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [testerCandles, chartOffset],
  );

  // Price ranges
  let minPrice = 0;
  let maxPrice = 0;
  let priceRange = 1;
  const paddingTop = 20;
  const paddingBottom = 30;
  const paddingLeft = 15;
  const paddingRight = 65;
  
  if (displayedCandles.length > 0) {
    const highs = displayedCandles.map(c => c.high);
    const lows = displayedCandles.map(c => c.low);
    maxPrice = Math.max(...highs);
    minPrice = Math.min(...lows);
    priceRange = maxPrice - minPrice || 1;
  }

  const getY = (price: number) => {
    const chartHeight = 300 - paddingTop - paddingBottom;
    return 300 - paddingBottom - ((price - minPrice) / priceRange) * chartHeight;
  };

  const chartWidth = 800 - paddingLeft - paddingRight;
  const candleWidth = displayedCandles.length ? chartWidth / displayedCandles.length : 0;
  const getX = (idx: number) => {
    return paddingLeft + idx * candleWidth + candleWidth / 2;
  };

  // Mouse hover handler
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!displayedCandles.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Scale X, Y from client rect to 800 x 300 viewBox coordinates
    const svgX = (x / rect.width) * 800;
    const svgY = (y / rect.height) * 300;
    
    const chartX = svgX - paddingLeft;
    const idx = Math.floor(chartX / candleWidth);
    if (idx >= 0 && idx < displayedCandles.length) {
      setHoveredIndex(idx);
      setMousePos({ x: svgX, y: svgY });
    } else {
      setHoveredIndex(null);
      setMousePos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setMousePos(null);
  };

  const handleSelectSetup = (setupTime: number) => {
    setSelectedSetupTime(selectedSetupTime === setupTime ? null : setupTime);
    if (!testResult || !testResult.success) return;
    
    const total = testerCandles.length;
    const idx = testerCandles.findIndex(c => c.time === setupTime);
    if (idx !== -1) {
      const count = Math.min(total, 80);
      const targetOffset = Math.max(0, Math.min(total - count, total - idx - Math.floor(count / 2)));
      setChartOffset(targetOffset);
    }
  };

  const renderChartOnly = () => {
    if (!testResult || !testResult.success || testResult.candles.length === 0) return null;
    if (displayedCandles.length === 0) {
      return (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-8 text-center text-sm text-amber-300">
          No candles are available for today&apos;s selected Eastern Time session.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-card-border/40">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Clock size={14} className="text-accent" />
              {testSymbol.toUpperCase()} Intraday Candlestick Chart
            </h3>
            <p className="text-[10px] text-muted">
              Showing {displayedCandles.length} candles of {testResult.candles.length} loaded ({testInterval})
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Current Day Only Checkbox */}
            <label className="flex items-center gap-1.5 text-[10px] font-semibold text-muted cursor-pointer hover:text-foreground select-none">
              <input
                type="checkbox"
                checked={testCurrentDayOnly}
                onChange={(e) => setTestCurrentDayOnly(e.target.checked)}
                className="rounded border-card-border text-accent focus:ring-accent h-3 w-3 cursor-pointer"
              />
              <span>Current Day Only</span>
            </label>

            <div className="text-[10px] font-mono text-muted bg-muted-bg border border-card-border px-2 py-0.5 rounded">
              {testResult.provider}
            </div>
          </div>
        </div>

        {/* Dedicated Info HUD Row to prevent layout shifts */}
        <div className="flex items-center bg-muted-bg border border-card-border px-3 py-2 rounded-xl text-[10px] font-mono text-muted h-[38px] overflow-hidden select-none">
          {hoveredIndex !== null && hoveredIndex < displayedCandles.length ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>T: <span className="text-foreground font-bold">{formatEasternTime(displayedCandles[hoveredIndex].time)} ET</span></span>
              <span>O: <span className="text-foreground font-bold">${displayedCandles[hoveredIndex].open.toFixed(2)}</span></span>
              <span>H: <span className="text-emerald-500 font-bold">${displayedCandles[hoveredIndex].high.toFixed(2)}</span></span>
              <span>L: <span className="text-rose-405 font-bold">${displayedCandles[hoveredIndex].low.toFixed(2)}</span></span>
              <span>C: <span className="text-foreground font-bold">${displayedCandles[hoveredIndex].close.toFixed(2)}</span></span>
              <span>V: <span className="text-accent font-bold">{(displayedCandles[hoveredIndex].volume / 1000).toFixed(1)}k</span></span>
            </div>
          ) : (
            <span className="text-muted/60 italic">Hover over chart to view OHLCV data</span>
          )}
        </div>

        {/* SVG Chart Canvas */}
        <div className="relative border border-card-border rounded-xl bg-slate-900 dark:bg-slate-950 overflow-hidden">
          <svg
            width="100%"
            height={300}
            viewBox="0 0 800 300"
            preserveAspectRatio="none"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="cursor-crosshair overflow-visible select-none"
          >
            {/* Y Axis Gridlines (e.g. 5 horizontal lines) */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const price = minPrice + ratio * priceRange;
              const y = getY(price);
              return (
                <g key={ratio}>
                  <line x1={paddingLeft} y1={y} x2={800 - paddingRight} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="3,3" />
                  <text x={800 - paddingRight + 5} y={y + 3} fill="rgba(255,255,255,0.6)" className="text-[8px] font-mono" textAnchor="start">${price.toFixed(2)}</text>
                </g>
              );
            })}

            {/* X Axis vertical lines and hour labels at hourly marks */}
            {(() => {
              let lastX = -100;
              return displayedCandles.map((c, idx) => {
                const date = new Date(c.time * 1000);
                const nyTime = date.toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit'
                });
                
                const [hourStr, minuteStr] = nyTime.split(':');
                const isHourly = minuteStr === '00';
                const x = getX(idx);
                
                // Enforce minimum 45px horizontal gap between labels to prevent overlapping
                if (!isHourly || x - lastX < 45) return null;
                lastX = x;
                
                return (
                  <g key={c.time}>
                    <line
                      x1={x}
                      y1={paddingTop}
                      x2={x}
                      y2={300 - paddingBottom}
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth={1}
                    />
                    <text
                      x={x}
                      y={300 - paddingBottom + 14}
                      fill="rgba(255,255,255,0.7)"
                      className="text-[10px] font-mono font-semibold"
                      textAnchor="middle"
                    >
                      {parseInt(hourStr, 10)}
                    </text>
                  </g>
                );
              });
            })()}

            {/* Highlighted Selected Setup band */}
            {selectedSetupTime !== null && (() => {
              const setupIdxInDisplay = displayedCandles.findIndex(c => c.time === selectedSetupTime);
              if (setupIdxInDisplay !== -1) {
                const startX = getX(Math.max(0, setupIdxInDisplay - 2)) - candleWidth / 2;
                const endX = getX(setupIdxInDisplay) + candleWidth / 2;
                return (
                  <rect
                    x={startX}
                    y={paddingTop}
                    width={endX - startX}
                    height={300 - paddingTop - paddingBottom}
                    fill="rgba(167, 139, 250, 0.12)"
                    stroke="rgba(167, 139, 250, 0.3)"
                    strokeWidth={1}
                    rx={4}
                  />
                );
              }
              return null;
            })()}

            {/* Candlesticks loop */}
            {displayedCandles.map((c, idx) => {
              const isGreen = c.close >= c.open;
              const x = getX(idx);
              const bodyWidth = Math.max(2, candleWidth - 4);
              const bodyTop = getY(Math.max(c.open, c.close));
              const bodyBottom = getY(Math.min(c.open, c.close));
              const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
              
              const colorClass = isGreen ? '#10b981' : '#f43f5e';
              
              // Check if this candle is a setup trigger
              const match = currentMatches.find(m => m.time === c.time);
              
              return (
                <g key={c.time}>
                  {/* Wick */}
                  <line
                    x1={x}
                    y1={getY(c.high)}
                    x2={x}
                    y2={getY(c.low)}
                    stroke={colorClass}
                    strokeWidth={1.5}
                  />
                  {/* Body */}
                  <rect
                    x={x - bodyWidth / 2}
                    y={bodyTop}
                    width={bodyWidth}
                    height={bodyHeight}
                    fill={colorClass}
                    stroke={colorClass}
                    strokeWidth={0.5}
                    className="transition-all duration-300"
                  />

                  {/* Arrow Overlay if Pattern Setup Triggered here */}
                  {match && (
                    <path
                      d={
                        match.type === 'bullish'
                          ? `M ${x} ${bodyBottom + 10} L ${x - 5} ${bodyBottom + 16} L ${x - 2} ${bodyBottom + 16} L ${x - 2} ${bodyBottom + 22} L ${x + 2} ${bodyBottom + 22} L ${x + 2} ${bodyBottom + 16} L ${x + 5} ${bodyBottom + 16} Z`
                          : `M ${x} ${bodyTop - 10} L ${x - 5} ${bodyTop - 16} L ${x - 2} ${bodyTop - 16} L ${x - 2} ${bodyTop - 22} L ${x + 2} ${bodyTop - 22} L ${x + 2} ${bodyTop - 16} L ${x + 5} ${bodyTop - 16} Z`
                      }
                      fill={match.type === 'bullish' ? '#10b981' : '#f43f5e'}
                    />
                  )}
                </g>
              );
            })}
            {/* Hover Crosshair vertical and horizontal lines */}
            {hoveredIndex !== null && (
              <g>
                {/* Vertical crosshair line */}
                <line
                  x1={getX(hoveredIndex)}
                  y1={paddingTop}
                  x2={getX(hoveredIndex)}
                  y2={300 - paddingBottom}
                  stroke="rgba(167, 139, 250, 0.4)"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                {/* Horizontal crosshair line */}
                {mousePos && (
                  <line
                    x1={paddingLeft}
                    y1={mousePos.y}
                    x2={800 - paddingRight}
                    y2={mousePos.y}
                    stroke="rgba(167, 139, 250, 0.4)"
                    strokeWidth={1}
                    strokeDasharray="3,3"
                  />
                )}
              </g>
            )}
          </svg>

          {/* Hover details label */}
          {hoveredIndex === null && (
            <div className="absolute bottom-2 left-2 text-[8px] bg-slate-900/80 px-1.5 py-0.5 rounded text-slate-400 font-mono">
              MOVE CURSOR TO INSPECT
            </div>
          )}
        </div>

        {/* Slider for chart pagination if there are > 80 candles */}
        {testerCandles.length > 80 && (
          <div className="flex items-center gap-4 bg-muted-bg/50 border border-card-border p-3 rounded-xl shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-muted font-semibold">
              <History size={14} className="text-accent" />
              <span>Scroll History:</span>
            </div>
            
            <input
              type="range"
              min="0"
              max={testerCandles.length - 80}
              value={chartOffset}
              onChange={(e) => setChartOffset(parseInt(e.target.value))}
              className="flex-1 accent-violet-500 cursor-pointer h-1.5 bg-card-border rounded-lg appearance-none"
              style={{ direction: 'rtl' }}
            />
            
            <div className="font-mono text-[10px] bg-slate-900 border border-card-border px-2 py-0.5 rounded text-foreground">
              {chartOffset === 0 ? 'LATEST' : `${chartOffset} candles back`}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderJustChartCanvas = () => {
    if (!testResult || !testResult.success || testResult.candles.length === 0) return null;
    if (displayedCandles.length === 0) {
      return (
        <div className="bg-slate-900 px-4 py-10 text-center text-sm text-amber-300">
          No candles are available for today&apos;s selected Eastern Time session.
        </div>
      );
    }
    return (
      <div className="relative border-b border-card-border/30 bg-slate-900 dark:bg-slate-950 overflow-hidden">
        <svg
          width="100%"
          height={260}
          viewBox="0 0 800 260"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="cursor-crosshair overflow-visible select-none"
        >
          {/* Y Axis Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const price = minPrice + ratio * priceRange;
            const y = (1 - ratio) * (260 - paddingTop - paddingBottom) + paddingTop;
            return (
              <g key={ratio}>
                <line x1={paddingLeft} y1={y} x2={800 - paddingRight} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} strokeDasharray="3,3" />
                <text x={800 - paddingRight + 5} y={y + 3} fill="rgba(255,255,255,0.85)" className="text-[10px] font-mono font-medium" textAnchor="start">${price.toFixed(2)}</text>
              </g>
            );
          })}

          {/* X Axis vertical lines and hour labels at hourly marks */}
          {(() => {
            let lastX = -100;
            return displayedCandles.map((c, idx) => {
              const date = new Date(c.time * 1000);
              const nyTime = date.toLocaleTimeString('en-US', {
                timeZone: 'America/New_York',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
              });
              
              const [hourStr, minuteStr] = nyTime.split(':');
              const isHourly = minuteStr === '00';
              const x = getX(idx);
              
              // Enforce minimum 45px horizontal gap between labels to prevent overlapping
              if (!isHourly || x - lastX < 45) return null;
              lastX = x;
              
              return (
                <g key={c.time}>
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={260 - paddingBottom}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={260 - paddingBottom + 14}
                    fill="rgba(255,255,255,0.85)"
                    className="text-[10px] font-mono font-semibold"
                    textAnchor="middle"
                  >
                    {parseInt(hourStr, 10)}
                  </text>
                </g>
              );
            });
          })()}

          {/* Highlighted Selected Setup band */}
          {selectedSetupTime !== null && (() => {
            const setupIdxInDisplay = displayedCandles.findIndex(c => c.time === selectedSetupTime);
            if (setupIdxInDisplay !== -1) {
              const startX = getX(Math.max(0, setupIdxInDisplay - 2)) - candleWidth / 2;
              const endX = getX(setupIdxInDisplay) + candleWidth / 2;
              return (
                <rect
                  x={startX}
                  y={paddingTop}
                  width={endX - startX}
                  height={260 - paddingTop - paddingBottom}
                  fill="rgba(167, 139, 250, 0.12)"
                  stroke="rgba(167, 139, 250, 0.3)"
                  strokeWidth={1}
                  rx={4}
                />
              );
            }
            return null;
          })()}

          {/* Candlesticks loop */}
          {displayedCandles.map((c, idx) => {
            const isGreen = c.close >= c.open;
            const x = getX(idx);
            const bodyWidth = Math.max(2, candleWidth - 4);
            const getCanvasY = (val: number) => {
              return ((minPrice + priceRange - val) / priceRange) * (260 - paddingTop - paddingBottom) + paddingTop;
            };
            const bodyTop = getCanvasY(Math.max(c.open, c.close));
            const bodyBottom = getCanvasY(Math.min(c.open, c.close));
            const bodyHeight = Math.max(1.5, bodyBottom - bodyTop);
            
            const colorClass = isGreen ? '#10b981' : '#f43f5e';
            const match = currentMatches.find(m => m.time === c.time);
            
            return (
              <g key={c.time}>
                <line
                  x1={x}
                  y1={getCanvasY(c.high)}
                  x2={x}
                  y2={getCanvasY(c.low)}
                  stroke={colorClass}
                  strokeWidth={1.5}
                />
                <rect
                  x={x - bodyWidth / 2}
                  y={bodyTop}
                  width={bodyWidth}
                  height={bodyHeight}
                  fill={colorClass}
                  stroke={colorClass}
                  strokeWidth={0.5}
                  className="transition-all duration-300"
                />
                {match && (
                  <path
                    d={
                      match.type === 'bullish'
                        ? `M ${x} ${bodyBottom + 10} L ${x - 5} ${bodyBottom + 16} L ${x - 2} ${bodyBottom + 16} L ${x - 2} ${bodyBottom + 22} L ${x + 2} ${bodyBottom + 22} L ${x + 2} ${bodyBottom + 16} L ${x + 5} ${bodyBottom + 16} Z`
                        : `M ${x} ${bodyTop - 10} L ${x - 5} ${bodyTop - 16} L ${x - 2} ${bodyTop - 16} L ${x - 2} ${bodyTop - 22} L ${x + 2} ${bodyTop - 22} L ${x + 2} ${bodyTop - 16} L ${x + 5} ${bodyTop - 16} Z`
                    }
                    fill={match.type === 'bullish' ? '#10b981' : '#f43f5e'}
                  />
                )}
              </g>
            );
          })}

          {/* Hover Crosshair vertical and horizontal lines */}
          {hoveredIndex !== null && (
            <g>
              <line
                x1={getX(hoveredIndex)}
                y1={paddingTop}
                x2={getX(hoveredIndex)}
                y2={260 - paddingBottom}
                stroke="rgba(167, 139, 250, 0.4)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              {mousePos && (
                <line
                  x1={paddingLeft}
                  y1={mousePos.y}
                  x2={800 - paddingRight}
                  y2={mousePos.y}
                  stroke="rgba(167, 139, 250, 0.4)"
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
              )}
            </g>
          )}
        </svg>

        {/* Hover details HUD inside canvas to save space */}
        {hoveredIndex !== null && hoveredIndex < displayedCandles.length ? (
          <div className="absolute top-2.5 left-2.5 text-xs bg-slate-900/95 border border-slate-700/80 px-3 py-1.5 rounded-md text-slate-200 font-mono flex items-center gap-3 shadow-xl select-none">
            <span>T: <span className="text-amber-300 font-bold">{formatEasternTime(displayedCandles[hoveredIndex].time)} ET</span></span>
            <span>O: <span className="text-cyan-300 font-bold">${displayedCandles[hoveredIndex].open.toFixed(2)}</span></span>
            <span>H: <span className="text-emerald-400 font-bold">${displayedCandles[hoveredIndex].high.toFixed(2)}</span></span>
            <span>L: <span className="text-rose-400 font-bold">${displayedCandles[hoveredIndex].low.toFixed(2)}</span></span>
            <span>C: <span className="text-white font-bold">${displayedCandles[hoveredIndex].close.toFixed(2)}</span></span>
          </div>
        ) : (
          <div className="absolute top-2.5 left-2.5 text-xs bg-slate-900/95 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-200 font-mono shadow-md flex items-center gap-1.5 font-medium select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>HOVER TO INSPECT</span>
          </div>
        )}
      </div>
    );
  };

  const renderSetupsGrid = () => {
    if (!testResult || !testResult.success) return null;
    return (
      <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-6">
        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
          Daily Setups Detected ({currentMatches.length})
        </h3>
        {currentMatches.length === 0 ? (
          <div className="p-4 bg-muted-bg/30 border border-card-border rounded-xl text-xs text-muted text-center">
            No setup triggers found in today&apos;s data.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
            {currentMatches.map((m, mIdx) => {
              const isSelected = selectedSetupTime === m.time;
              return (
                <div
                  key={mIdx}
                  onClick={() => handleSelectSetup(m.time)}
                  className={`flex flex-col justify-between p-3.5 rounded-xl text-xs border cursor-pointer transition-all hover:scale-[1.02] ${
                    isSelected
                      ? m.type === 'bullish'
                        ? 'bg-emerald-950/35 border-emerald-500/50 text-emerald-400 font-bold ring-1 ring-emerald-500/20'
                        : 'bg-rose-950/35 border-rose-500/50 text-rose-400 font-bold ring-1 ring-rose-500/20'
                      : m.type === 'bullish'
                      ? 'bg-emerald-950/10 border-emerald-900/20 text-emerald-400 hover:border-emerald-600/30'
                      : 'bg-rose-950/10 border-rose-900/20 text-rose-400 hover:border-rose-600/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      {m.type === 'bullish' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span className="tracking-wider">{m.type.toUpperCase()} SETUP</span>
                    </div>
                    <span className="font-semibold text-foreground">
                      {m.type === 'bullish' ? '+' : '-'}{m.change.toFixed(2)}%
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-[10px] text-muted border-t border-card-border/20 pt-2 font-mono">
                    <span>{new Date(m.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>SETUP</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 sm:p-5 md:p-6 max-w-7xl mx-auto space-y-5 text-foreground">

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
          Manual Tester & Session Chart
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
                    <div className="flex items-center gap-2 text-xs bg-muted-bg border border-card-border px-3 py-1.5 rounded-lg text-muted">
                      <Clock size={12} className="text-accent" />
                      <span>
                        Next scan:{' '}
                        <span className="text-foreground font-semibold">
                          {categoryItems[nextScanIndex % categoryItems.length]?.symbol}
                        </span>{' '}
                        in{' '}
                        <span className="font-mono text-accent font-bold">
                          <ScanCountdown
                            key={`${nextScanIndex}-${scanIntervalMinutes}-${watchlistCategory}`}
                            seconds={spacingSeconds}
                          />
                        </span>
                      </span>
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

              {/* WATCHLIST CATEGORY SWITCHER */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-1.5 bg-muted-bg/40 p-1 rounded-xl border border-card-border/50">
                  <button
                    onClick={() => {
                      setWatchlistCategory('stocks');
                      localStorage.setItem('watcher-watchlist-category', 'stocks');
                    }}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      watchlistCategory === 'stocks'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <ChartCandlestick size={14} />
                    <span>
                      Stocks ({watchlist.filter((w) => !isFuturesSymbol(w.symbol) && !isCryptoSymbol(w.symbol)).length})
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setWatchlistCategory('crypto');
                      localStorage.setItem('watcher-watchlist-category', 'crypto');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      watchlistCategory === 'crypto'
                        ? 'bg-accent text-white shadow-sm font-bold'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <Bitcoin size={14} />
                    <span>Crypto ({watchlist.filter((w) => isCryptoSymbol(w.symbol)).length})</span>
                  </button>
                  <button
                    onClick={() => {
                      setWatchlistCategory('futures');
                      localStorage.setItem('watcher-watchlist-category', 'futures');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      watchlistCategory === 'futures'
                        ? 'bg-accent text-white shadow-sm font-bold'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    <Zap size={14} />
                    <span>Futures ({watchlist.filter((w) => isFuturesSymbol(w.symbol)).length})</span>
                  </button>
                  <button
                    onClick={() => {
                      setWatchlistCategory('all');
                      localStorage.setItem('watcher-watchlist-category', 'all');
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      watchlistCategory === 'all'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-muted hover:text-foreground'
                    }`}
                  >
                    All Tickers ({watchlist.length})
                  </button>
                </div>

                {/* Per-category alert switches: turn a whole asset class off so the
                    server scanner skips it (no scans/alerts/push), symbols kept. */}
                <div className="flex items-center gap-1.5" title="Turn a category's background alerts on or off">
                  {(['stocks', 'crypto', 'futures'] as const).map((cat) => {
                    const off = disabledCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategoryScanning(cat)}
                        title={off
                          ? `${cat} alerts are OFF — click to turn on`
                          : `${cat} alerts are ON — click to turn off`}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border transition-all ${
                          off
                            ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {off ? <BellOff size={12} /> : <Bell size={12} />}
                        <span>{cat}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Consecutive Move is the only preset with a configurable streak length. */}
                {selectedPatternId === 'consecutive' ? (
                  <div className="flex items-center gap-2 bg-muted-bg/40 px-3 py-1.5 rounded-xl border border-card-border/50 text-xs">
                    <span className="text-muted font-semibold">Streak Length:</span>
                    <select
                      value={requiredCandleCount}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setRequiredCandleCount(val);
                        localStorage.setItem('watcher-consecutive-candles', String(val));
                      }}
                      className="bg-card-bg border border-card-border rounded px-2 py-1 text-foreground font-semibold cursor-pointer outline-none"
                    >
                      <option value={3}>3 Consecutive Candles (Default)</option>
                      <option value={4}>4 Consecutive Candles (Stronger Trend)</option>
                      <option value={5}>5 Consecutive Candles (Ultra Streak)</option>
                    </select>
                  </div>
                ) : null}
              </div>

              <PatternSelector value={selectedPatternId} onChange={handlePatternChange} />

              {/* WATCHLIST FORM */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6 bg-muted-bg/30 p-4 rounded-xl border border-card-border">
                {addNotice && (
                  <div
                    role="status"
                    aria-live="polite"
                    className={`sm:col-span-12 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                      addNotice.type === 'success'
                        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
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
                  placeholder={
                    watchlistCategory === 'futures'
                      ? 'e.g. NQ=F, ES=F, CL=F'
                      : watchlistCategory === 'crypto'
                        ? 'e.g. BTC, ETH, SOL'
                        : 'e.g. AAPL, NVDA, SPY'
                  }
                  onSearch={setSearchTerm}
                  onAdd={stableAddSymbol}
                />

                <div className="sm:col-span-3 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">INTERVAL</span>
                  <select
                    value={newInterval}
                    onChange={(e) => {
                      setNewInterval(e.target.value);
                      localStorage.setItem('watcher-new-interval', e.target.value);
                    }}
                    className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-20 pr-3 text-sm text-foreground cursor-pointer outline-none transition-all"
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

                <div className="sm:col-span-5 flex flex-col justify-between bg-card-bg border border-card-border rounded-xl px-3.5 py-2">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-muted text-[10px] font-semibold uppercase tracking-wider hover:text-foreground" title="When checked, overrides all individual stock thresholds with this global slider value">
                      <input
                        type="checkbox"
                        checked={overrideGlobalMinMove}
                        onChange={(e) => {
                          setOverrideGlobalMinMove(e.target.checked);
                          localStorage.setItem('watcher-override-global-min-move', String(e.target.checked));
                        }}
                        className="rounded border-card-border text-accent focus:ring-accent h-3.5 w-3.5 cursor-pointer"
                      />
                      <span>Apply Global ({overrideGlobalMinMove ? 'Override All' : 'New Only'})</span>
                    </label>
                    <div className="flex items-center gap-0.5 font-mono text-xs font-bold text-accent">
                      <input
                        type="number"
                        step="0.05"
                        min="0.05"
                        max="3.00"
                        value={newMinMove}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0.05;
                          setNewMinMove(val);
                          localStorage.setItem('watcher-new-min-move', String(val));
                        }}
                        className="w-12 bg-transparent text-right outline-none"
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="3.00"
                    step="0.05"
                    value={newMinMove}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0.05;
                      setNewMinMove(val);
                      localStorage.setItem('watcher-new-min-move', String(val));
                    }}
                    className="w-full h-1.5 bg-muted-bg rounded-lg appearance-none cursor-pointer accent-accent mt-1"
                  />
                </div>

                <div className="sm:col-span-2">
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
                        <th onClick={() => handleSort('minMove')} className="py-3 px-4 cursor-pointer select-none hover:text-foreground transition-colors group">
                          <div className="inline-flex items-center gap-1">
                            <span>Min Move</span>
                            {sortColumn === 'minMove' ? (
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
                              onSaveMinMove={stableSaveMinMove}
                              onRemove={stableRemoveSymbol}
                            />
                            
                            {/* Expanded sub-row containing the chart */}
                            {expandedRowIndex === idx && testResult && testResult.success && testResult.candles.length > 0 && (
                              <tr className="bg-slate-900/10 border-t border-b border-card-border/30">
                                <td colSpan={7} className="p-0">
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
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span>Scan Frequency:</span>
                      <select
                        value={scanIntervalMinutes}
                        onChange={(e) => handleIntervalChange(parseFloat(e.target.value))}
                        className="bg-card-bg border border-card-border rounded px-2 py-1 text-foreground font-medium"
                      >
                        <option value={0.25}>15 Seconds (Real-time)</option>
                        <option value={0.5}>30 Seconds (Ultra Fast)</option>
                        <option value={1}>1 Minute (Fast Test)</option>
                        <option value={5}>5 Minutes</option>
                        <option value={10}>10 Minutes</option>
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes</option>
                      </select>
                    </div>

                    {selectedPatternId === 'consecutive' ? (
                      <div className="flex items-center gap-2">
                        <span>Required Consecutive Candles:</span>
                        <select
                          value={requiredCandleCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setRequiredCandleCount(val);
                            localStorage.setItem('watcher-consecutive-candles', String(val));
                          }}
                          className="bg-card-bg border border-card-border rounded px-2 py-1 text-foreground font-semibold cursor-pointer"
                        >
                          <option value={3}>3 Candles (Default)</option>
                          <option value={4}>4 Candles (Stronger Trend)</option>
                          <option value={5}>5 Candles (Ultra Streak)</option>
                        </select>
                      </div>
                    ) : null}
                  </div>

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
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none hover:text-foreground transition-colors" title="Scans 5 stocks concurrently per batch for fast scanning on paid API keys">
                        <input
                          type="checkbox"
                          checked={parallelScanEnabled}
                          onChange={(e) => {
                            setParallelScanEnabled(e.target.checked);
                            localStorage.setItem('watcher-parallel-scan', String(e.target.checked));
                          }}
                          className="rounded border-card-border text-accent focus:ring-accent h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5">
                          <Zap size={13} />
                          Parallel Batch Scan (Fast 5x Mode)
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none hover:text-foreground transition-colors">
                        <input
                          type="checkbox"
                          checked={autoPauseEnabled}
                          onChange={(e) => {
                            setAutoPauseEnabled(e.target.checked);
                            localStorage.setItem('watcher-auto-pause', String(e.target.checked));
                          }}
                          className="rounded border-card-border text-accent focus:ring-accent h-3.5 w-3.5 cursor-pointer"
                        />
                        <span>Auto-pause outside</span>
                      </label>
                      <select
                        value={activeWindow}
                        disabled={!autoPauseEnabled}
                        onChange={(e) => {
                          const session = e.target.value as 'rth' | 'pre' | 'ext' | 'all';
                          setActiveWindow(session);
                          localStorage.setItem('watcher-active-window', session);
                          void syncScannerSettings(
                            watchlist,
                            selectedPatternId,
                            session,
                          ).catch(() => {});
                        }}
                        className="bg-card-bg border border-card-border rounded px-2 py-1 text-foreground font-medium disabled:opacity-50 cursor-pointer"
                      >
                        <option value="rth">Regular hours (9:30–16:00 ET)</option>
                        <option value="pre">Pre-market + Regular (4:00–16:00 ET)</option>
                        <option value="ext">Extended: Pre + Regular + After (4:00–20:00 ET)</option>
                        <option value="all">24 Hours / All Hours (Full Session)</option>
                      </select>
                      <span className="text-muted/70">Mon–Fri</span>
                    </div>
                  )}
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

      {/* MANUAL PATTERN TESTER VIEW */}
      {activeTab === 'tester' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* Left Column: Form and Setups list */}
          <div className="lg:col-span-4 space-y-6">
            {/* Tester Form Card */}
            <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-4 sm:p-5">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2">
                <Search size={18} className="text-accent" /> Pattern Tester
              </h2>
              <p className="text-xs text-muted mb-6">
                Fetch recent candles for a specific symbol immediately and verify whether it matches the selected pattern.
              </p>

              <form onSubmit={handleRunTest} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Stock Symbol</label>
                  <input
                    type="text"
                    placeholder="e.g. AAPL, TSLA, NQ=F"
                    value={testSymbol}
                    onChange={(e) => setTestSymbol(e.target.value)}
                    className="w-full bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Interval</label>
                    <select
                      value={testInterval}
                      onChange={(e) => setTestInterval(e.target.value)}
                      className="w-full bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-sm text-foreground cursor-pointer outline-none transition-all"
                    >
                      <option value="1m">1m</option>
                      <option value="2m">2m</option>
                      <option value="5m">5m</option>
                      <option value="10m">10m</option>
                      <option value="15m">15m</option>
                      <option value="30m">30m</option>
                      <option value="45m">45m</option>
                      <option value="1h">1h</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted">Min Move %</label>
                      <span className="font-mono text-xs font-bold text-accent">{testMinMove.toFixed(2)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="3.00"
                      step="0.05"
                      value={testMinMove}
                      onChange={(e) => setTestMinMove(parseFloat(e.target.value) || 0.05)}
                      className="w-full h-2.5 bg-card-bg border border-card-border rounded-xl appearance-none cursor-pointer accent-accent my-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Trading Session</label>
                  <select
                    value={testSessionFilter}
                    onChange={(e) => setTestSessionFilter(e.target.value as 'all' | 'rth' | 'ext')}
                    className="w-full bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-sm text-foreground cursor-pointer outline-none transition-all"
                  >
                    <option value="all">All Hours (Pre + RTH + Post)</option>
                    <option value="rth">Regular Trading Hours (RTH Only)</option>
                    <option value="ext">Extended Hours Only (Pre/Post-Market)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isTesting}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 active:from-violet-700 active:to-indigo-700 text-white rounded-xl py-3 text-sm font-semibold transition-all disabled:opacity-50"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Fetching data...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Check Pattern Now
                    </>
                  )}
                </button>
              </form>

              {/* Status Header for Results */}
              {testResult && (
                <div className="mt-6 pt-6 border-t border-card-border space-y-4">
                  <div className="flex items-center justify-between text-xs text-muted font-medium">
                    <span>Provider: <span className="text-foreground font-semibold">{testResult.provider}</span></span>
                    <span>Status: 
                      {testResult.success ? (
                        <span className="text-emerald-400 ml-1 font-semibold">Success</span>
                      ) : (
                        <span className="text-rose-400 ml-1 font-semibold">Failed</span>
                      )}
                    </span>
                  </div>

                  {testResult.success ? (
                    <div className={`p-4 rounded-xl border flex gap-3 ${
                      currentPatternMatched === 'bullish'
                        ? 'bg-emerald-950/20 border-emerald-800/30'
                        : currentPatternMatched === 'bearish'
                        ? 'bg-rose-950/20 border-rose-800/30'
                        : 'bg-muted-bg border border-card-border'
                    }`}>
                      <div className="mt-0.5">
                        {currentPatternMatched === 'bullish' ? (
                          <CheckCircle2 className="text-emerald-400" size={18} />
                        ) : currentPatternMatched === 'bearish' ? (
                          <CheckCircle2 className="text-rose-400" size={18} />
                        ) : (
                          <XCircle className="text-muted" size={18} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                          {currentPatternMatched === 'bullish' && (
                            <>
                              <TrendingUp size={14} className="text-emerald-400" />
                              <span>BULLISH PATTERN DETECTED</span>
                            </>
                          )}
                          {currentPatternMatched === 'bearish' && (
                            <>
                              <TrendingDown size={14} className="text-rose-400" />
                              <span>BEARISH PATTERN DETECTED</span>
                            </>
                          )}
                          {currentPatternMatched === 'none' && <span>NO PATTERN MATCHED</span>}
                        </div>
                        <p className="text-muted text-[11px] mt-1 leading-relaxed">{currentPatternMessage}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-rose-950/10 border border-rose-900/20 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                      <AlertTriangle size={16} />
                      <span>{testResult.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recent Candles Breakdown Text List */}
            {testResult && testResult.success && testResult.candles.length > 0 && (
              <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-6">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">
                  Recent Candles Breakdown
                </h3>
                <div className="space-y-1.5 max-h-[250px] overflow-y-auto pr-1">
                  {testResult.candles.slice(-12).reverse().map((c, i) => {
                    const isGreen = c.close >= c.open;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg text-[10px] font-mono border bg-muted-bg/30 border-card-border/40"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isGreen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span className="text-muted">
                            {new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex gap-2 text-foreground">
                          <span>O: <span className="font-semibold">${c.open.toFixed(2)}</span></span>
                          <span>C: <span className="font-semibold">${c.close.toFixed(2)}</span></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Chart and Breakdown List */}
          <div className="lg:col-span-8 space-y-6">
            {renderChartOnly()}
            {renderSetupsGrid()}
          </div>
        </div>
      )}
      
    </div>
  );
}
