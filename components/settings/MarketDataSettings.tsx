'use client';

import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, Zap, Database, Check, Activity, Flame } from 'lucide-react';

export default function MarketDataSettings() {
  const [preferredProvider, setPreferredProvider] = useState<string>('tiingo');
  const [futuresProvider, setFuturesProvider] = useState<string>('databento');
  const [databentoKey, setDatabentoKey] = useState<string>('');
  const [alpacaKeyId, setAlpacaKeyId] = useState<string>('');
  const [alpacaSecret, setAlpacaSecret] = useState<string>('');
  const [twelveKey, setTwelveKey] = useState<string>('');
  const [polygonKey, setPolygonKey] = useState<string>('');
  const [tiingoKey, setTiingoKey] = useState<string>('');
  const [activeProviderName, setActiveProviderName] = useState<string>('Detecting...');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showAllKeys, setShowAllKeys] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPreferredProvider(localStorage.getItem('watcher-pref-provider') || 'tiingo');
      setFuturesProvider(localStorage.getItem('watcher-futures-provider') || 'databento');
      setDatabentoKey(localStorage.getItem('watcher-databento-key') || '');
      setAlpacaKeyId(localStorage.getItem('watcher-alpaca-key-id') || '');
      setAlpacaSecret(localStorage.getItem('watcher-alpaca-secret') || '');
      setTwelveKey(localStorage.getItem('watcher-twelve-key') || '');
      setPolygonKey(localStorage.getItem('watcher-polygon-key') || '');
      
      const storedTiingo = localStorage.getItem('watcher-tiingo-key');
      if (!storedTiingo) {
        const defaultKey = '8deef2458b32ed163118fd38d9e2df9762f70ea0';
        setTiingoKey(defaultKey);
        localStorage.setItem('watcher-tiingo-key', defaultKey);
        document.cookie = `watcher_tiingo_key=${encodeURIComponent(defaultKey)}; path=/; max-age=31536000; SameSite=Lax`;
      } else {
        setTiingoKey(storedTiingo);
      }
    }
  }, []);

  // Detect active provider from live API endpoint
  const checkActiveProvider = () => {
    fetch('/api/watch?symbol=AAPL')
      .then((res) => res.json())
      .then((data) => {
        if (data.provider) {
          setActiveProviderName(data.provider);
        } else {
          setActiveProviderName('Yahoo Finance');
        }
      })
      .catch(() => setActiveProviderName('Yahoo Finance'));
  };

  useEffect(() => {
    checkActiveProvider();
  }, [preferredProvider]);

  const handleSave = (updatedEquitiesProvider?: string, updatedFuturesProvider?: string, customTiingoKey?: string) => {
    if (typeof window !== 'undefined') {
      const activeEquities = updatedEquitiesProvider !== undefined ? updatedEquitiesProvider : preferredProvider;
      const activeFutures = updatedFuturesProvider !== undefined ? updatedFuturesProvider : futuresProvider;
      const finalTiingoKey = customTiingoKey !== undefined ? customTiingoKey : tiingoKey;

      localStorage.setItem('watcher-pref-provider', activeEquities);
      localStorage.setItem('watcher-futures-provider', activeFutures);
      localStorage.setItem('watcher-databento-key', databentoKey.trim());
      localStorage.setItem('watcher-alpaca-key-id', alpacaKeyId.trim());
      localStorage.setItem('watcher-alpaca-secret', alpacaSecret.trim());
      localStorage.setItem('watcher-twelve-key', twelveKey.trim());
      localStorage.setItem('watcher-polygon-key', polygonKey.trim());
      localStorage.setItem('watcher-tiingo-key', finalTiingoKey.trim());

      // Set cookies for server API route consumption
      document.cookie = `watcher_pref_provider=${activeEquities}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_futures_provider=${activeFutures}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_databento_key=${encodeURIComponent(databentoKey.trim())}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_alpaca_key_id=${encodeURIComponent(alpacaKeyId.trim())}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_alpaca_secret=${encodeURIComponent(alpacaSecret.trim())}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_twelve_key=${encodeURIComponent(twelveKey.trim())}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_polygon_key=${encodeURIComponent(polygonKey.trim())}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `watcher_tiingo_key=${encodeURIComponent(finalTiingoKey.trim())}; path=/; max-age=31536000; SameSite=Lax`;

      setSavedSuccess(true);
      
      fetch(`/api/watch?symbol=AAPL&t=${Date.now()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.provider) {
            setActiveProviderName(data.provider);
          } else {
            setActiveProviderName('Yahoo Finance');
          }
        })
        .catch(() => setActiveProviderName('Yahoo Finance'));

      setTimeout(() => setSavedSuccess(false), 2000);
    }
  };

  return (
    <div className="bg-card text-card-foreground p-6 rounded-xl border border-card-border shadow-sm max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-card-border pb-4 gap-3">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Zap className="text-accent" size={20} /> Market Data Provider Settings
          </h3>
          <p className="text-xs text-muted mt-1">
            Configure independent data feeds for Equities and 24H CME Futures, and manage your API keys.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Active Data Feed Indicator Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Activity size={13} className="text-emerald-400" /> Equities Feed: {activeProviderName}
          </div>

          {savedSuccess && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20 animate-fade-in">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </div>

      {/* Futures Data Feed Selector */}
      <div className="space-y-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Flame size={15} /> ⚡ Futures Data Engine (CME 24H Continuous)
          </label>
          <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-medium">
            Dedicated Futures Feed
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              id: 'databento',
              name: 'Databento (GLBX.MDP3 CME)',
              desc: 'Institutional-grade live CME futures feed (OHLCV-1m)',
              badge: 'Recommended'
            },
            {
              id: 'yahoo',
              name: 'Yahoo Finance (Fallback)',
              desc: 'Free delayed/approximate futures candles',
              badge: 'Free'
            }
          ].map((f) => (
            <div
              key={f.id}
              onClick={() => {
                setFuturesProvider(f.id);
                handleSave(undefined, f.id);
              }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                futuresProvider === f.id
                  ? 'bg-amber-500/15 border-amber-500 text-foreground font-medium ring-1 ring-amber-500/30'
                  : 'bg-card-bg border-card-border hover:border-card-border/80 text-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-foreground">{f.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-mono border border-amber-500/20">{f.badge}</span>
              </div>
              <p className="text-[11px] text-muted mt-1 leading-tight">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Equities Provider Selector */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-muted block">
          📈 Equities Data Engine (Stocks & ETFs)
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            {
              id: 'tiingo',
              name: 'Tiingo IEX',
              desc: 'Low cost high rate limit REST API',
              badge: 'Power Tier'
            },
            {
              id: 'polygon',
              name: 'Polygon / Massive',
              desc: '5 API calls/min (Free Tier)',
              badge: '5 req/min'
            },
            {
              id: 'alpaca',
              name: 'Alpaca Data',
              desc: '200 API calls/min (Free Tier)',
              badge: '200 req/min'
            },
            {
              id: 'twelve',
              name: 'Twelve Data',
              desc: 'Real-time US equities & ETFs',
              badge: '8 req/min'
            },
            {
              id: 'yahoo',
              name: 'Yahoo Finance',
              desc: '100% Free Default (No key required)',
              badge: 'Free'
            }
          ].map((p) => (
            <div
              key={p.id}
              onClick={() => {
                setPreferredProvider(p.id);
                handleSave(p.id);
              }}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                preferredProvider === p.id
                  ? 'bg-accent/10 border-accent text-foreground font-medium ring-1 ring-accent/30'
                  : 'bg-card-bg border-card-border hover:border-card-border/80 text-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-foreground">{p.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted-bg text-muted font-mono">{p.badge}</span>
              </div>
              <p className="text-[11px] text-muted mt-1 leading-tight">{p.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* API Key Inputs */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
            <Key size={14} className="text-accent" /> API Credentials
          </h4>
          <button
            type="button"
            onClick={() => setShowAllKeys(!showAllKeys)}
            className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
          >
            {showAllKeys ? 'Hide Inactive Providers' : '+ Configure All Provider Keys'}
          </button>
        </div>

        {/* Databento Key */}
        {(futuresProvider === 'databento' || showAllKeys || databentoKey.length > 0) && (
          <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Flame size={14} /> Databento API Key (CME Futures)
              </span>
              <span className="text-[10px] text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">GLBX.MDP3 Live</span>
            </div>
            <input
              type="password"
              value={databentoKey}
              onChange={(e) => setDatabentoKey(e.target.value)}
              onBlur={() => handleSave()}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="db-..."
              className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-amber-500 outline-none"
            />
            <p className="text-[11px] text-muted">
              Used for institutional-grade 1m CME Futures candles (`NQ.c.0`, `ES.c.0`, `CL.c.0`, `GC.c.0`).
            </p>
          </div>
        )}

        {/* Tiingo Key */}
        {(preferredProvider === 'tiingo' || preferredProvider === 'auto' || showAllKeys || tiingoKey.length > 0) && (
          <div className="p-4 rounded-xl bg-muted-bg/20 border border-card-border space-y-2 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Tiingo API Key (Equities)</span>
              <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Power Tier Active</span>
            </div>
            <input
              type="password"
              value={tiingoKey}
              onChange={(e) => setTiingoKey(e.target.value)}
              onBlur={() => handleSave()}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Tiingo API Key..."
              className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
            />
          </div>
        )}

        {/* Polygon / Massive Key */}
        {(preferredProvider === 'polygon' || showAllKeys || polygonKey.length > 0) && (
          <div className="p-4 rounded-xl bg-muted-bg/20 border border-card-border space-y-2 transition-all">
            <span className="text-xs font-bold text-foreground block">Polygon.io / Massive API Key</span>
            <input
              type="password"
              value={polygonKey}
              onChange={(e) => setPolygonKey(e.target.value)}
              onBlur={() => handleSave()}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Polygon / Massive API Key..."
              className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
            />
          </div>
        )}

        {/* Alpaca Credentials */}
        {(preferredProvider === 'alpaca' || showAllKeys || alpacaKeyId.length > 0 || alpacaSecret.length > 0) && (
          <div className="p-4 rounded-xl bg-muted-bg/20 border border-card-border space-y-3 transition-all">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Alpaca Market Data Keys</span>
              <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">Fastest (200 req/min)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted block mb-1">API Key ID</label>
                <input
                  type="text"
                  value={alpacaKeyId}
                  onChange={(e) => setAlpacaKeyId(e.target.value)}
                  onBlur={() => handleSave()}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="PK..."
                  className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted block mb-1">Secret Key</label>
                <input
                  type="password"
                  value={alpacaSecret}
                  onChange={(e) => setAlpacaSecret(e.target.value)}
                  onBlur={() => handleSave()}
                  onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                  placeholder="••••••••••••••••"
                  className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Twelve Data Key */}
        {(preferredProvider === 'twelve' || showAllKeys || twelveKey.length > 0) && (
          <div className="p-4 rounded-xl bg-muted-bg/20 border border-card-border space-y-2 transition-all">
            <span className="text-xs font-bold text-foreground block">Twelve Data API Key</span>
            <input
              type="password"
              value={twelveKey}
              onChange={(e) => setTwelveKey(e.target.value)}
              onBlur={() => handleSave()}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Twelve Data API Key..."
              className="w-full bg-card-bg border border-card-border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:border-accent outline-none"
            />
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={() => handleSave()}
          className="px-5 py-2.5 bg-accent hover:bg-accent/80 active:bg-accent text-white font-semibold text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <ShieldCheck size={16} /> Save Market Data Settings
        </button>
      </div>
    </div>
  );
}
