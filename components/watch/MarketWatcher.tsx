'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Bell, 
  BellOff, 
  Play, 
  Plus, 
  Trash2, 
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
  Edit,
  Moon,
  Zap,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { openDB } from 'idb';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface WatchItem {
  symbol: string;
  interval: string;
  minMovePercent: number;
  lastChecked?: string;
  status?: 'bullish' | 'bearish' | 'none' | 'error';
  lastError?: string;
  candles?: Candle[];
  lastAlertedCandleTime?: number;
  lastAlertedType?: 'bullish' | 'bearish';
}

interface AlertLog {
  id: string;
  time: string;
  symbol: string;
  interval: string;
  type: 'bullish' | 'bearish';
  details: string;
  price: number;
  candles?: Candle[];
}

interface PatternMatch {
  time: number;
  type: 'bullish' | 'bearish';
  change: number;
  message: string;
}

// Client-side cache using existing 'tradingdiary-charts' IndexedDB ohlc store
async function getLiveCache(symbol: string, interval: string) {
  if (typeof window === 'undefined') return null;
  try {
    const db = await openDB('tradingdiary-charts', 1);
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
    const db = await openDB('tradingdiary-charts', 1);
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
  const [newSymbol, setNewSymbol] = useState('');
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
  
  // Inline editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [expandedRowIndex, setExpandedRowIndex] = useState<number | null>(null);

  // Settings & Notification States
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [scanIntervalMinutes, setScanIntervalMinutes] = useState(10); // Polling interval
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds
  const [isScanning, setIsScanning] = useState(false);
  const [alertLogs, setAlertLogs] = useState<AlertLog[]>([]);
  const [isPolygonActive, setIsPolygonActive] = useState(false);
  const [isScannerPaused, setIsScannerPaused] = useState(false);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(true); // pause scanner outside chosen session
  const [activeWindow, setActiveWindow] = useState<'rth' | 'pre' | 'ext' | 'all'>('pre'); // which session the scanner runs in
  const [marketOpen, setMarketOpen] = useState(true);

  // Sorting state for Watchlist table
  const [sortColumn, setSortColumn] = useState<'symbol' | 'interval' | 'minMove' | 'status' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Search, Category, and Filtering state for Watchlist table
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'alerts' | 'errors'>('all');
  const [watchlistCategory, setWatchlistCategory] = useState<'stocks' | 'futures' | 'all'>('stocks');

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
      return watchlist.filter((w) => !w.symbol.includes('=F'));
    }
    if (watchlistCategory === 'futures') {
      return watchlist.filter((w) => w.symbol.includes('=F'));
    }
    return watchlist;
  }, [watchlist, watchlistCategory]);

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
    // Load Watchlist
    const defaultFutures: WatchItem[] = [
      { symbol: 'NQ=F', interval: '10m', minMovePercent: 0.25 },
      { symbol: 'ES=F', interval: '10m', minMovePercent: 0.25 },
      { symbol: 'YM=F', interval: '10m', minMovePercent: 0.25 },
      { symbol: 'CL=F', interval: '10m', minMovePercent: 0.5 },
      { symbol: 'GC=F', interval: '10m', minMovePercent: 0.5 },
      { symbol: 'SI=F', interval: '10m', minMovePercent: 0.5 },
    ];

    const savedWatch = localStorage.getItem('watcher-watchlist');
    if (savedWatch) {
      try {
        const loaded: WatchItem[] = JSON.parse(savedWatch);
        const hasFutures = loaded.some((w) => w.symbol.includes('=F'));
        if (!hasFutures) {
          const merged = [...loaded, ...defaultFutures];
          setWatchlist(merged);
          localStorage.setItem('watcher-watchlist', JSON.stringify(merged));
        } else {
          setWatchlist(loaded);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      // Default Watchlist
      const defaults: WatchItem[] = [
        { symbol: 'AAPL', interval: '5m', minMovePercent: 0.1 },
        { symbol: 'BTC-USD', interval: '10m', minMovePercent: 0.2 },
        { symbol: 'SPY', interval: '5m', minMovePercent: 0.05 },
        ...defaultFutures
      ];
      setWatchlist(defaults);
      localStorage.setItem('watcher-watchlist', JSON.stringify(defaults));
    }

    // Pull & Smart-Merge synced watchlist from cloud database if authenticated
    fetch('/api/watch/sync')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.watchlist && Array.isArray(data.watchlist)) {
          if (data.watchlist.length > 0) {
            setWatchlist((prevList) => {
              // Smart Merge: Combine cloud items and local items by unique symbol
              const map = new Map<string, WatchItem>();
              for (const item of prevList) {
                map.set(item.symbol.toUpperCase(), item);
              }
              for (const item of data.watchlist) {
                map.set(item.symbol.toUpperCase(), item);
              }
              const merged = Array.from(map.values());
              localStorage.setItem('watcher-watchlist', JSON.stringify(merged));
              return merged;
            });
          } else {
            // If cloud database is empty, push local watchlist to cloud
            setWatchlist((currentList) => {
              if (currentList.length > 0) {
                fetch('/api/watch/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ watchlist: currentList }),
                }).catch(() => {});
              }
              return currentList;
            });
          }
        }
      })
      .catch(() => {});

    // Load Alert History
    const savedLogs = localStorage.getItem('watcher-alerts');
    if (savedLogs) {
      try {
        setAlertLogs(JSON.parse(savedLogs));
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
      setCountdown(mins * 60);
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
    if (savedCategory === 'stocks' || savedCategory === 'futures' || savedCategory === 'all') {
      setWatchlistCategory(savedCategory);
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
    localStorage.setItem('watcher-watchlist', JSON.stringify(updated));
    if (!skipCloudSync) {
      // Push to cloud database if authenticated
      fetch('/api/watch/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist: updated })
      }).catch(() => {});
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
      alert('Desktop notifications are not supported by this browser.');
      return;
    }
    const permission = await Notification.requestPermission();
    setIsNotificationsEnabled(permission === 'granted');
    if (permission === 'granted') {
      new Notification('Notifications Enabled!', {
        body: 'You will receive desktop alerts when stock patterns are detected.',
        icon: '/favicon.ico'
      });
    }
  };

  const sendDesktopNotification = (symbol: string, type: 'bullish' | 'bearish', text: string) => {
    if (isNotificationsEnabled && typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const notification = new Notification(`🚨 Market Alert: ${symbol}`, {
          body: text,
          tag: `${symbol}-${type}`,
          icon: '/favicon.ico'
        });
        
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

  // 5. Pattern Detection Algorithm
  const detectPattern = (candles: Candle[], minMovePercent: number, interval?: string) => {
    if (candles.length < 3) {
      return { matched: 'none' as const, message: `Insufficient candles (${candles.length}/3)` };
    }

    // Scan all completed patterns in the dataset
    const allMatches = scanAllPatterns(candles, minMovePercent);
    if (allMatches.length === 0) {
      // Fallback: Check if the last 3 candles in the array form a pattern (in case they are not in the scanned list yet)
      const N = candles.length;
      const startIdx = N - 3;
      const c1 = candles[startIdx];
      const c2 = candles[startIdx + 1];
      const c3 = candles[startIdx + 2];
      
      const c1Green = c1.close > c1.open;
      const c2Green = c2.close > c2.open;
      const c3Green = c3.close > c3.open;

      const c1Red = c1.close < c1.open;
      const c2Red = c2.close < c2.open;
      const c3Red = c3.close < c3.open;

      const bullishCloses = c3.close > c2.close && c2.close > c1.close;
      const bearishCloses = c3.close < c2.close && c2.close < c1.close;

      const startPrice = c1.open;
      const endPrice = c3.close;
      const totalChangePercent = Math.abs((endPrice - startPrice) / startPrice) * 100;

      const isBullishPattern = c1Green && c2Green && c3Green && bullishCloses;
      const isBearishPattern = c1Red && c2Red && c3Red && bearishCloses;

      if (isBullishPattern && totalChangePercent >= minMovePercent) {
        return {
          matched: 'bullish' as const,
          message: `Bullish Extended Move: 3 consecutive green candles. Total change: +${totalChangePercent.toFixed(2)}% (Min: ${minMovePercent}%)`,
          time: c3.time
        };
      }
      if (isBearishPattern && totalChangePercent >= minMovePercent) {
        return {
          matched: 'bearish' as const,
          message: `Bearish Extended Move: 3 consecutive red candles. Total change: -${totalChangePercent.toFixed(2)}% (Min: ${minMovePercent}%)`,
          time: c3.time
        };
      }

      return { matched: 'none' as const, message: 'No extended move patterns found' };
    }

    // Find the latest completed match in the dataset
    const latestMatch = allMatches[allMatches.length - 1];
    
    // We only trigger an alert if the setup completed on the absolute latest candle (N-1).
    const N = candles.length;
    const isLatest = latestMatch.time === candles[N - 1].time;

    if (isLatest) {
      return {
        matched: latestMatch.type,
        message: `${latestMatch.type === 'bullish' ? 'Bullish' : 'Bearish'} Extended Move. Total change: ${latestMatch.type === 'bullish' ? '+' : '-'}${latestMatch.change.toFixed(2)}% (Min: ${minMovePercent}%)`,
        time: latestMatch.time
      };
    }

    return { matched: 'none' as const, message: 'Latest pattern setup is too old' };
  };

  // 6. Scan Ticker Handler (Background Poller / Manual Scan)
  const scanAllPatterns = (candles: Candle[], minMovePercent: number): PatternMatch[] => {
    const matches: PatternMatch[] = [];
    if (candles.length < 3) return matches;

    // Loop through all candles including the latest one (candles.length) to find historical setups
    const limit = candles.length;
    for (let i = 2; i < limit; i++) {
      const c1 = candles[i - 2];
      const c2 = candles[i - 1];
      const c3 = candles[i];

      const c1Green = c1.close > c1.open;
      const c2Green = c2.close > c2.open;
      const c3Green = c3.close > c3.open;

      const c1Red = c1.close < c1.open;
      const c2Red = c2.close < c2.open;
      const c3Red = c3.close < c3.open;

      const bullishCloses = c3.close > c2.close && c2.close > c1.close;
      const bearishCloses = c3.close < c2.close && c2.close < c1.close;

      const startPrice = c1.open;
      const endPrice = c3.close;
      const totalChangePercent = Math.abs((endPrice - startPrice) / startPrice) * 100;

      if (c1Green && c2Green && c3Green && bullishCloses && totalChangePercent >= minMovePercent) {
        matches.push({
          time: c3.time,
          type: 'bullish',
          change: totalChangePercent,
          message: `Bullish Setup (+${totalChangePercent.toFixed(2)}%)`
        });
      } else if (c1Red && c2Red && c3Red && bearishCloses && totalChangePercent >= minMovePercent) {
        matches.push({
          time: c3.time,
          type: 'bearish',
          change: totalChangePercent,
          message: `Bearish Setup (-${totalChangePercent.toFixed(2)}%)`
        });
      }
    }
    return matches;
  };

  const renderMiniCandlesSVG = (candles: Candle[]) => {
    if (!candles || candles.length === 0) return null;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const maxVal = Math.max(...highs);
    const minVal = Math.min(...lows);
    const range = maxVal - minVal || 1;

    const height = 28;
    const getScaledY = (price: number) => {
      // 2px padding top/bottom to prevent clipping
      return 2 + (height - 4) - (((price - minVal) / range) * (height - 4));
    };

    const candleWidth = 5;
    const gap = 3;
    const step = candleWidth + gap; // 8px per candle
    const totalWidth = candles.length * step - gap + 8; // ~40px for 5 candles

    return (
      <svg width={totalWidth} height={height} className="overflow-visible select-none">
        {candles.map((c, idx) => {
          const x = idx * step + 4;
          const isGreen = c.close >= c.open;
          
          const yHigh = getScaledY(c.high);
          const yLow = getScaledY(c.low);
          const yOpen = getScaledY(c.open);
          const yClose = getScaledY(c.close);
          
          const bodyY = Math.min(yOpen, yClose);
          const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
          const colorClass = isGreen ? '#10b981' : '#f43f5e';

          return (
            <g key={idx}>
              {/* Wick Line */}
              <line
                x1={x + candleWidth / 2}
                y1={yHigh}
                x2={x + candleWidth / 2}
                y2={yLow}
                stroke={colorClass}
                strokeWidth={1}
              />
              {/* Body Box */}
              <rect
                x={x}
                y={bodyY}
                width={candleWidth}
                height={bodyHeight}
                fill={colorClass}
                rx={0.5}
              />
            </g>
          );
        })}
      </svg>
    );
  };

  const triggerAlert = (symbol: string, interval: string, type: 'bullish' | 'bearish', message: string, price: number, candles?: Candle[]) => {
    const timeStr = new Date().toLocaleTimeString();
    const detailMessage = `${type === 'bullish' ? '📈 Bullish' : '📉 Bearish'} move on ${symbol} (${interval})! ${message}`;
    
    // Sound and desktop notifications
    playAlertSound(type);
    sendDesktopNotification(symbol, type, detailMessage);

    // Add to alert log
    setAlertLogs((prev) => {
      // Prevent exact duplicates in history within the same minute
      const isDuplicate = prev.some(
        (log) => log.symbol === symbol.toUpperCase() && 
                 log.type === type && 
                 log.interval === interval &&
                 log.time.substring(0, 5) === timeStr.substring(0, 5)
      );
      if (isDuplicate) return prev;

      const newAlert: AlertLog = {
        id: Math.random().toString(36).substr(2, 9),
        time: timeStr,
        symbol: symbol.toUpperCase(),
        interval: interval,
        type: type,
        details: message,
        price: price,
        candles: candles ? candles.slice(-5) : undefined
      };
      const updatedLogs = [newAlert, ...prev].slice(0, 100);
      localStorage.setItem('watcher-alerts', JSON.stringify(updatedLogs));
      return updatedLogs;
    });
  };

  const scanSymbol = async (item: WatchItem): Promise<WatchItem> => {
    try {
      let candles: Candle[] = [];
      let providerName = 'Polygon.io';

      // 1. Try fetching from IndexedDB cache first
      const cache = await getLiveCache(item.symbol, item.interval);
      if (cache) {
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
            const errData = await res.json();
            throw new Error(errData.error || `Server responded with ${res.status}`);
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

      const { matched, message, time } = detectPattern(candles, item.minMovePercent, item.interval);

      // Trigger Alert if pattern matched and hasn't been alerted for this candle/direction yet
      const alreadyAlerted = item.lastAlertedCandleTime === time && item.lastAlertedType === matched;
      if (matched !== 'none' && !alreadyAlerted) {
        triggerAlert(item.symbol, item.interval, matched, message, candles[candles.length - 1]?.close || 0, candles);
      }

      return {
        ...item,
        lastChecked: new Date().toLocaleTimeString(),
        status: matched,
        candles,
        lastError: undefined,
        lastAlertedCandleTime: matched !== 'none' ? time : item.lastAlertedCandleTime,
        lastAlertedType: matched !== 'none' ? matched : item.lastAlertedType
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
    if (watchlist.length === 0) return 60;
    const intervalSeconds = scanIntervalMinutes * 60;
    let spacing = intervalSeconds / watchlist.length;
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
  const isCurrentCategoryFutures = watchlistCategory === 'futures';
  const marketAutoPaused = autoPauseEnabled && !marketOpen && !isCurrentCategoryFutures;
  const effectivelyActive = !isScannerPaused && !marketAutoPaused;
  const windowStartLabel = activeWindow === 'rth' ? '9:30 AM ET' : '4:00 AM ET';

  const handleScanNext = async () => {
    const currentList = categoryItemsRef.current.length > 0 ? categoryItemsRef.current : watchlistRef.current;
    if (currentList.length === 0 || isScanning) return;

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

    setIsScanning(true);
    try {
      const scanned = await scanSymbol(item);
      const latestList = [...watchlistRef.current];
      const idx = latestList.findIndex((w) => w.symbol === item.symbol && w.interval === item.interval);
      if (idx !== -1) {
        latestList[idx] = scanned;
        saveWatchlist(latestList, true);

        // If the scanned item is currently expanded in the Watchlist tab, update testResult live so the chart updates instantly
        if (expandedRowIndexRef.current === idx && scanned.candles && scanned.candles.length > 0) {
          const { matched, message } = detectPattern(scanned.candles, item.minMovePercent, item.interval);
          const allMatches = scanAllPatterns(scanned.candles, item.minMovePercent);
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
      setIsScanning(false);
      nextScanIndexRef.current += 1;
      setNextScanIndex(nextScanIndexRef.current);
    }
  };

  useEffect(() => {
    nextScanIndexRef.current = nextScanIndex;
  }, [nextScanIndex]);

  // Scan all items in the current active category (manual override Scan Now button)
  const handleScanAll = async () => {
    const targetList = categoryItemsRef.current.length > 0 ? categoryItemsRef.current : watchlist;
    if (isScanning || targetList.length === 0) return;
    setIsScanning(true);
    
    const currentFullList = [...watchlist];
    for (let i = 0; i < targetList.length; i++) {
      const item = targetList[i];
      const scanned = await scanSymbol(item);
      const idx = currentFullList.findIndex((w) => w.symbol === item.symbol && w.interval === item.interval);
      if (idx !== -1) {
        currentFullList[idx] = scanned;
      }

      if (i < targetList.length - 1) {
        if (isPolygonActive) {
          await new Promise((resolve) => setTimeout(resolve, 12000));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }
    
    saveWatchlist(currentFullList);
    setIsScanning(false);
  };

  // 7. Polling Timer scheduler spacing reset
  useEffect(() => {
    setCountdown(spacingSeconds);
    lastScanTimeRef.current = Date.now();
    if (nextScanIndex >= watchlist.length) {
      setNextScanIndex(0);
    }
  }, [watchlist.length, scanIntervalMinutes]);

  // Polling Timer scheduler loop
  useEffect(() => {
    if (watchlist.length === 0) return;

    // Reset last scan time on restart/resume
    lastScanTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      // Keep the market-open indicator fresh (no-op re-render when unchanged)
      const open = isMarketOpen(activeWindowRef.current);
      setMarketOpen(open);

      if (isScannerPaused) return; // Manually paused
      const isFuturesCategory = watchlistCategoryRef.current === 'futures';
      if (autoPauseEnabledRef.current && !open && !isFuturesCategory) return; // Auto-paused outside the chosen session (for stocks)

      const elapsed = Math.floor((Date.now() - lastScanTimeRef.current) / 1000);
      const remaining = spacingSecondsRef.current - elapsed;

      if (remaining <= 0) {
        handleScanNext();
        lastScanTimeRef.current = Date.now();
        setCountdown(spacingSecondsRef.current);
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [watchlist.length, isScannerPaused]);



  // Adjust polling frequency
  const handleIntervalChange = (mins: number) => {
    setScanIntervalMinutes(mins);
    setCountdown(mins * 60);
    localStorage.setItem('watcher-scan-interval', String(mins));
  };

  // 8. Watchlist Modifiers
  const handleAddSymbol = () => {
    let symbol = newSymbol.trim().toUpperCase();
    if (!symbol) return;
    if (watchlistCategory === 'futures' && !symbol.includes('=F')) {
      symbol = `${symbol}=F`;
    }
    if (watchlist.some(w => w.symbol === symbol && w.interval === newInterval)) {
      alert('This symbol with the same interval is already in the watchlist.');
      return;
    }

    const newItem: WatchItem = {
      symbol,
      interval: newInterval,
      minMovePercent: newMinMove,
    };

    const updated = [...watchlist, newItem];
    saveWatchlist(updated);
    setNewSymbol('');

    // Immediately scan the newly added symbol
    scanSymbol(newItem).then((scanned) => {
      const currentList = [...updated];
      const idx = currentList.findIndex(w => w.symbol === symbol && w.interval === newInterval);
      if (idx !== -1) {
        currentList[idx] = scanned;
        saveWatchlist(currentList);
      }
    });
  };

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
  const handleSaveInlineMinMove = (index: number) => {
    if (editingIndex !== index) return;
    const val = parseFloat(editingValue);
    if (isNaN(val) || val < 0) {
      setEditingIndex(null);
      return;
    }
    
    setWatchlist((prevList) => {
      const updated = [...prevList];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          minMovePercent: val
        };
        // Re-run setup scan client-side for this symbol if candles are already present
        if (updated[index].candles && updated[index].candles.length > 0) {
          const { matched } = detectPattern(updated[index].candles, val, updated[index].interval);
          updated[index].status = matched;
        }
      }
      localStorage.setItem('watcher-watchlist', JSON.stringify(updated));
      return updated;
    });

    if (expandedRowIndex === index) {
      setTestMinMove(val);
    }
    setEditingIndex(null);
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
        const allMatches = scanAllPatterns(currentDayCandles, item.minMovePercent);
        const { matched, message } = detectPattern(currentDayCandles, item.minMovePercent, item.interval);

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
            const allMatches = scanAllPatterns(freshCandles, item.minMovePercent);
            const { matched, message, time } = detectPattern(freshCandles, item.minMovePercent, item.interval);

            const alreadyAlerted = item.lastAlertedCandleTime === time && item.lastAlertedType === matched;
            if (matched !== 'none' && !alreadyAlerted) {
              triggerAlert(item.symbol, item.interval, matched, message, freshCandles[freshCandles.length - 1]?.close || 0, freshCandles);
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
                  status: matched,
                  lastChecked: new Date().toLocaleTimeString(),
                  lastAlertedCandleTime: matched !== 'none' ? time : updated[index].lastAlertedCandleTime,
                  lastAlertedType: matched !== 'none' ? matched : updated[index].lastAlertedType
                };
              }
              localStorage.setItem('watcher-watchlist', JSON.stringify(updated));
              return updated;
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch fresh candles on expansion:', err);
      }
    }
  };

  const handleClearAlerts = () => {
    setAlertLogs([]);
    localStorage.removeItem('watcher-alerts');
  };

  const handleAlertCardClick = (log: AlertLog) => {
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
      }, 100);
    }
  };

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

      const { matched, message } = detectPattern(candles, testMinMove, testInterval);
      const allMatches = scanAllPatterns(candles, testMinMove);

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

  // Format countdown timer (e.g. 2s or 1m 05s)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  };

  // Helper to filter candles to only include the current trading session (the date of the latest candle)
  // Helper to filter candles to only include the current trading session (New York market date)
  const filterCurrentDayOnly = (candles: Candle[]) => {
    if (candles.length === 0) return candles;
    
    // Find TODAY'S current date in America/New_York (market timezone)
    const todayNYDateString = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/New_York'
    });

    const todayCandles = candles.filter((c) => {
      const d = new Date(c.time * 1000);
      const nyDateStr = d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York'
      });
      return nyDateStr === todayNYDateString;
    });

    // If today's premarket/market session has candles, return ONLY today's candles!
    if (todayCandles.length > 0) {
      return todayCandles;
    }

    // Fallback: If before 4:00 AM ET (when today's premarket hasn't started yet), return latest available day
    const latestCandle = candles[candles.length - 1];
    const latestDate = new Date(latestCandle.time * 1000);
    const latestNYDateString = latestDate.toLocaleDateString('en-US', {
      timeZone: 'America/New_York'
    });
    return candles.filter((c) => {
      const d = new Date(c.time * 1000);
      const nyDateStr = d.toLocaleDateString('en-US', {
        timeZone: 'America/New_York'
      });
      return nyDateStr === latestNYDateString;
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

  const testerCandles = getTesterCandles();

  // Price analysis & pattern scanning computed dynamically on the filtered candles
  const { matched: currentPatternMatched, message: currentPatternMessage } = detectPattern(testerCandles, testMinMove, testInterval);
  const currentMatches = scanAllPatterns(testerCandles, testMinMove);

  const getDisplayedCandles = () => {
    const total = testerCandles.length;
    const count = Math.min(total, 80);
    const start = Math.max(0, total - count - chartOffset);
    const end = Math.max(count, total - chartOffset);
    return testerCandles.slice(start, end);
  };

  const displayedCandles = getDisplayedCandles();

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
              <span>T: <span className="text-foreground font-bold">{new Date(displayedCandles[hoveredIndex].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
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
            <span>T: <span className="text-amber-300 font-bold">{new Date(displayedCandles[hoveredIndex].time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
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
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-foreground">
      
      {/* HEADER HERO */}
      <div className="relative rounded-2xl overflow-hidden px-5 py-4 md:px-6 md:py-5 bg-gradient-to-r from-violet-950 via-slate-900 to-indigo-950 border border-violet-900/40 shadow-xl">
        {/* Glow Effects */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-violet-600/10 rounded-full blur-3xl -translate-y-12 translate-x-12 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-60 h-60 bg-blue-600/10 rounded-full blur-2xl translate-y-12 -translate-x-12 pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-semibold text-violet-300 mb-2">
              <Clock size={12} className="animate-pulse" />
              Live Scanner
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight leading-tight bg-gradient-to-r from-white via-slate-100 to-violet-300 bg-clip-text text-transparent">
              Market Pattern Watcher
            </h1>
            <p className="text-slate-400 text-xs mt-1 max-w-xl leading-relaxed">
              Monitors stock indices, crypto, or individual shares for 3 consecutive candles in the same direction, signaling extended moves and trade setups.
            </p>
          </div>

          {/* Quick controls */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/40 border border-white/5 backdrop-blur-md p-2 rounded-xl shrink-0">
            {/* Audio Alert Toggle */}
            <button
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              className={`p-1.5 rounded-lg transition-all ${
                isSoundEnabled 
                  ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' 
                  : 'bg-slate-800/40 text-slate-500 border border-transparent'
              }`}
              title={isSoundEnabled ? 'Disable Audio Alert' : 'Enable Audio Alert'}
            >
              {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Desktop Notification Request */}
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

            {/* Test sound */}
            <button
              onClick={handleTestSound}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-800/50 hover:bg-slate-700/60 text-slate-300 border border-slate-700/40 transition-colors"
            >
              Test Sound
            </button>
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* Watchlist Panel */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-6">
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
                    <span>{isScannerPaused ? 'Scanner Paused' : marketAutoPaused ? 'Market Closed' : 'Scanner Active'}</span>
                  </button>

                  {effectivelyActive && watchlist.length > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-muted-bg border border-card-border px-3 py-1.5 rounded-lg text-muted">
                      <Clock size={12} className="text-accent" />
                      <span>
                        Next scan:{' '}
                        <span className="text-foreground font-semibold">
                          {(categoryItems.length > 0 ? categoryItems : watchlist)[
                            nextScanIndex % (categoryItems.length > 0 ? categoryItems.length : watchlist.length)
                          ]?.symbol}
                        </span>{' '}
                        in <span className="font-mono text-accent font-bold">{formatTime(countdown)}</span>
                      </span>
                    </div>
                  )}

                  {marketAutoPaused && !isScannerPaused && watchlist.length > 0 && (
                    <div className="flex items-center gap-2 text-xs bg-slate-500/10 border border-slate-500/20 px-3 py-1.5 rounded-lg text-slate-400">
                      <Moon size={12} />
                      <span>Auto-paused until session open ({windowStartLabel})</span>
                    </div>
                  )}
                  
                  <button
                    onClick={handleScanAll}
                    disabled={isScanning || watchlist.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent/80 text-white disabled:opacity-50 disabled:hover:bg-accent transition-colors"
                  >
                    <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                    Scan Now
                  </button>
                </div>
              </div>

              {/* WATCHLIST CATEGORY SWITCHER (Stocks vs Futures) */}
              <div className="flex flex-wrap items-center gap-2 mb-6 p-1 bg-muted-bg/30 rounded-xl border border-card-border/30 w-fit">
                <button
                  onClick={() => {
                    setWatchlistCategory('stocks');
                    localStorage.setItem('watcher-watchlist-category', 'stocks');
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    watchlistCategory === 'stocks'
                      ? 'bg-accent text-white shadow-sm'
                      : 'text-muted hover:text-foreground'
                  }`}
                >
                  📈 Stocks ({watchlist.filter((w) => !w.symbol.includes('=F')).length})
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
                  ⚡ Futures (24H Continuous) ({watchlist.filter((w) => w.symbol.includes('=F')).length})
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

              {/* WATCHLIST FORM */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6 bg-muted-bg/30 p-4 rounded-xl border border-card-border">
                <div className="sm:col-span-4 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">TICKER</span>
                  <input
                    type="text"
                    placeholder={watchlistCategory === 'futures' ? "e.g. NQ=F, ES=F, CL=F" : "e.g. AAPL, BTC-USD"}
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSymbol()}
                    className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-16 pr-3 text-sm text-foreground outline-none transition-all"
                  />
                </div>

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
                    <option value="1h">1h</option>
                  </select>
                </div>

                <div className="sm:col-span-3 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-xs font-semibold">MIN MOVE</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newMinMove}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setNewMinMove(val);
                      localStorage.setItem('watcher-new-min-move', String(val));
                    }}
                    className="w-full bg-card-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl py-2.5 pl-22 pr-8 text-sm text-foreground outline-none transition-all"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-xs font-medium">%</span>
                </div>

                <div className="sm:col-span-2">
                  <button
                    onClick={handleAddSymbol}
                    className="w-full h-full flex items-center justify-center gap-1 bg-accent hover:bg-accent/80 active:bg-accent text-white rounded-xl text-sm font-semibold transition-colors py-2.5 sm:py-0"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>
              </div>

              {/* QUICK PRESETS TOOLBAR */}
              <div className="flex flex-wrap items-center gap-1.5 mb-6 text-xs bg-muted-bg/10 p-3 rounded-xl border border-card-border/30">
                <span className="text-muted font-bold mr-1 flex items-center gap-1">
                  ⚡ Quick Presets:
                </span>
                {(watchlistCategory === 'futures'
                  ? [
                      { label: 'NQ (Nasdaq)', symbol: 'NQ=F' },
                      { label: 'ES (S&P 500)', symbol: 'ES=F' },
                      { label: 'YM (Dow)', symbol: 'YM=F' },
                      { label: 'RTY (Russell)', symbol: 'RTY=F' },
                      { label: 'CL (Oil)', symbol: 'CL=F' },
                      { label: 'GC (Gold)', symbol: 'GC=F' },
                      { label: 'SI (Silver)', symbol: 'SI=F' },
                      { label: 'ZB (Bonds)', symbol: 'ZB=F' },
                      { label: 'BTC (CME BTC)', symbol: 'BTC=F' },
                    ]
                  : [
                      { label: 'AAPL', symbol: 'AAPL' },
                      { label: 'NVDA', symbol: 'NVDA' },
                      { label: 'TSLA', symbol: 'TSLA' },
                      { label: 'SPY', symbol: 'SPY' },
                      { label: 'QQQ', symbol: 'QQQ' },
                      { label: 'AMZN', symbol: 'AMZN' },
                      { label: 'MSFT', symbol: 'MSFT' },
                      { label: 'BTC-USD', symbol: 'BTC-USD' },
                    ]
                ).map((preset) => {
                  const exists = watchlist.some((w) => w.symbol === preset.symbol && w.interval === newInterval);
                  return (
                    <button
                      key={preset.symbol}
                      onClick={() => handleAddPreset(preset.symbol)}
                      disabled={exists}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                        exists
                          ? 'bg-muted-bg/30 text-muted/40 border-card-border/20 cursor-not-allowed'
                          : 'bg-card-bg border-card-border hover:border-accent text-foreground hover:text-accent cursor-pointer shadow-sm'
                      }`}
                      title={exists ? `${preset.symbol} (${newInterval}) is already in your watchlist` : `Click to add ${preset.symbol} (${newInterval})`}
                    >
                      + {preset.label}
                    </button>
                  );
                })}
              </div>

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
                    <div className="relative flex-1 max-w-xs">
                      <input
                        type="text"
                        placeholder="Search symbols..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-card-bg border border-card-border rounded-lg pl-3 pr-8 py-1.5 text-xs text-foreground placeholder-muted outline-none focus:border-accent"
                      />
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

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
                        const originalIdx = watchlist.findIndex(w => w.symbol === item.symbol && w.interval === item.interval);
                        const idx = originalIdx !== -1 ? originalIdx : sortedIdx;
                        const rowViewCandles = item.candles ? getWatchlistViewCandles(item.candles, item.symbol) : [];
                        const miniCandles = (rowViewCandles.length > 0 ? rowViewCandles : (item.candles || [])).slice(-5);
                        const latestPrice = miniCandles.length > 0
                          ? miniCandles[miniCandles.length - 1].close
                          : null;
                                        return (
                          <React.Fragment key={`${item.symbol}-${item.interval}-${idx}`}>
                            <tr 
                              id={`row-${item.symbol.toUpperCase()}-${item.interval}`}
                              className={`group transition-colors ${
                                item.status === 'bullish' 
                                  ? 'bg-emerald-500/10 dark:bg-emerald-500/5 hover:bg-emerald-500/15 dark:hover:bg-emerald-500/10'
                                  : item.status === 'bearish'
                                  ? 'bg-rose-500/10 dark:bg-rose-500/5 hover:bg-rose-500/15 dark:hover:bg-rose-500/10'
                                  : 'hover:bg-table-row-hover'
                              }`}
                            >
                              <td 
                                onClick={() => handleToggleRowExpansion(idx)}
                                className="py-4 px-4 font-bold text-foreground cursor-pointer hover:text-accent transition-colors"
                                title="Click to expand inline session chart"
                              >
                                {item.symbol}
                                {latestPrice !== null && (
                                  <span className="block text-[10px] font-normal text-muted mt-0.5">
                                    Last Price: ${latestPrice.toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td 
                                onClick={() => handleToggleRowExpansion(idx)}
                                className="py-4 px-4 text-xs font-mono text-muted cursor-pointer hover:text-accent transition-colors"
                                title="Click to expand inline session chart"
                              >
                                {item.interval}
                              </td>
                              <td className="py-4 px-4 text-xs text-muted">
                                {editingIndex === idx ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onBlur={() => handleSaveInlineMinMove(idx)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveInlineMinMove(idx);
                                        if (e.key === 'Escape') setEditingIndex(null);
                                      }}
                                      autoFocus
                                      className="w-14 bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded px-1.5 py-0.5 text-xs text-foreground outline-none font-mono"
                                    />
                                    <span className="text-[10px] text-muted">%</span>
                                  </div>
                                ) : (
                                  <div 
                                    onClick={() => {
                                      setEditingIndex(idx);
                                      setEditingValue(String(item.minMovePercent));
                                    }}
                                    className="cursor-pointer hover:bg-muted-bg/50 px-2 py-1 -mx-2 rounded border border-transparent hover:border-card-border/40 text-xs text-foreground font-semibold inline-flex items-center gap-1.5 transition-all"
                                    title="Click to edit threshold"
                                  >
                                    <span>{item.minMovePercent}%</span>
                                    <Edit size={10} className="text-muted/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </td>
                              
                              {/* Mini Candle Visualizer */}
                              <td 
                                onClick={() => handleToggleRowExpansion(idx)}
                                className="py-4 px-4 cursor-pointer hover:opacity-80 transition-opacity"
                                title="Click to expand inline session chart"
                              >
                                {miniCandles.length > 0 ? (
                                  <div className="flex items-center justify-center gap-1 h-6">
                                    {miniCandles.map((c, cIdx) => {
                                      const isGreen = c.close >= c.open;
                                      return (
                                        <div
                                          key={cIdx}
                                          className={`w-3.5 h-full rounded-[2px] transition-all relative group/candle ${
                                            isGreen ? 'bg-emerald-500/80 hover:bg-emerald-400' : 'bg-rose-500/80 hover:bg-rose-400'
                                          }`}
                                          title={`O: ${c.open} | C: ${c.close}`}
                                        />
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="block text-center text-muted text-xs font-normal">—</span>
                                )}
                              </td>
                              
                              <td className="py-4 px-4 text-xs text-muted">
                                {item.lastChecked || 'Never'}
                              </td>
                              
                              <td className="py-4 px-4">
                                {item.status === 'bullish' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 animate-pulse">
                                    <TrendingUp size={12} /> Bullish Alert
                                  </span>
                                )}
                                {item.status === 'bearish' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
                                    <TrendingDown size={12} /> Bearish Alert
                                  </span>
                                )}
                                {item.status === 'none' && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted-bg text-muted border border-card-border">
                                    Normal
                                  </span>
                                )}
                                {item.status === 'error' && (
                                  <div className="flex flex-col items-start gap-1">
                                    <span
                                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 cursor-pointer"
                                      title={item.lastError}
                                    >
                                      <AlertTriangle size={12} /> Error
                                    </span>
                                    {item.lastError && (
                                      <span 
                                        className="text-[10px] text-amber-500/80 font-medium block max-w-[150px] truncate leading-normal"
                                        title={item.lastError}
                                      >
                                        {item.lastError}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {!item.status && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted-bg text-muted/60">
                                    Pending
                                  </span>
                                )}
                              </td>

                              <td className="py-4 px-4 text-right">
                                <button
                                  onClick={() => handleRemoveSymbol(item.symbol, item.interval)}
                                  className="p-1.5 rounded-lg text-muted hover:bg-muted-bg hover:text-rose-500 transition-all"
                                  title="Remove ticker"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </td>
                            </tr>
                            
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
              </div>
            )}
              
              {/* Global Watchlist Settings */}
              <div className="mt-6 pt-6 border-t border-card-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <span>Scan Interval Frequency:</span>
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

                {watchlistCategory === 'futures' ? (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20">
                    <Zap size={14} />
                    <span>Futures Scanner Mode: 24/7 Continuous Monitoring (Asian, European & US Sessions)</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
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
                        setActiveWindow(e.target.value as 'rth' | 'pre' | 'ext' | 'all');
                        localStorage.setItem('watcher-active-window', e.target.value);
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
            </div>

            </div>

          {/* Alert History Panel */}
          <div className="lg:col-span-4">
            <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-6 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <History size={18} className="text-accent" /> Alert History
                </h2>
                {alertLogs.length > 0 && (
                  <button
                    onClick={handleClearAlerts}
                    className="text-xs text-muted hover:text-foreground transition-colors"
                  >
                    Clear History
                  </button>
                )}
              </div>

              {alertLogs.length === 0 ? (
                <div className="text-center py-12 text-muted text-xs flex-1 flex items-center justify-center border border-dashed border-card-border rounded-xl">
                  No alerts triggered in this session.
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto flex-1 pr-1 max-h-[500px]">
                  {alertLogs.map((log) => (
                    <div
                      key={log.id}
                      onClick={() => handleAlertCardClick(log)}
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-2 text-xs cursor-pointer hover:scale-[1.02] active:scale-[0.99] hover:border-card-border/80 transition-all select-none ${
                        log.type === 'bullish'
                          ? 'bg-emerald-950/20 border-emerald-900/30 hover:bg-emerald-950/30'
                          : 'bg-rose-950/20 border-rose-900/30 hover:bg-rose-950/30'
                      }`}
                      title="Click to locate and expand chart"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{log.symbol}</span>
                            <span className="bg-muted-bg text-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{log.interval}</span>
                            <span className={`font-semibold ${log.type === 'bullish' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {log.type === 'bullish' ? 'Ascending' : 'Descending'}
                            </span>
                          </div>
                          {log.candles && log.candles.length > 0 && (
                            <div className="flex items-center bg-black/40 px-1.5 py-0.5 rounded border border-card-border/30 shadow-inner">
                              {renderMiniCandlesSVG(log.candles)}
                            </div>
                          )}
                        </div>
                        <p className="text-muted mt-1 text-[11px] leading-relaxed">{log.details}</p>
                      </div>

                      <div className="flex items-center justify-between gap-4 font-mono text-[10px] text-muted border-t border-card-border/20 pt-1.5">
                        <span>Price: ${log.price.toFixed(2)}</span>
                        <span>{log.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL PATTERN TESTER VIEW */}
      {activeTab === 'tester' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fadeIn">
          {/* Left Column: Form and Setups list */}
          <div className="lg:col-span-4 space-y-6">
            {/* Tester Form Card */}
            <div className="bg-card-bg border border-card-border shadow-xl rounded-2xl p-6">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2 mb-2">
                <Search size={18} className="text-accent" /> Pattern Tester
              </h2>
              <p className="text-xs text-muted mb-6">
                Fetch recent candles for a specific symbol immediately and verify if they match the consecutive candle rule.
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
                      <option value="1h">1h</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">Min Move %</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={testMinMove}
                      onChange={(e) => setTestMinMove(parseFloat(e.target.value) || 0)}
                      className="w-full bg-muted-bg border border-card-border focus:border-accent focus:ring-1 focus:ring-accent rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none transition-all"
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
                        <div className="text-xs font-bold text-foreground">
                          {currentPatternMatched === 'bullish' && '🚨 BULLISH PATTERN DETECTED'}
                          {currentPatternMatched === 'bearish' && '🚨 BEARISH PATTERN DETECTED'}
                          {currentPatternMatched === 'none' && 'NO PATTERN MATCHED'}
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
