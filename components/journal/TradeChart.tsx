'use client';

import { useEffect, useState } from 'react';
import { fetchCandles } from '@/lib/chart/fetch';
import type { TransactionRecord } from '@/lib/db/schema';
import { useReplay } from '@/components/replay/ReplayProvider';
import SharedTradingChart from '@/components/chart/SharedTradingChart';
import type { CandleData } from '@/lib/chart/patterns';

interface TradeChartProps {
  symbol: string;
  date: string;
  transactions: TransactionRecord[];
  interval?: string;
}

const INTERVALS = ['1m', '5m', '10m', '15m', '1h'] as const;

/**
 * Compute the UTC→ET offset in seconds for a given date.
 */
function getETOffsetSeconds(dateStr: string): number {
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));
  const refUTC = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const etParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: 'numeric',
  }).formatToParts(refUTC);
  const etHourAtNoonUTC = parseInt(etParts.find((p) => p.type === 'hour')?.value ?? '7');
  return (etHourAtNoonUTC - 12) * 3600;
}

function formatChartDate(dateStr: string): string {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  return new Date(y, m, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TradeChart({ symbol, date, transactions, interval: defaultInterval = '5m' }: TradeChartProps) {
  const { openReplay } = useReplay();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [interval, setInterval] = useState(defaultInterval);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [autoPatternsEnabled, setAutoPatternsEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadChartData() {
      setLoading(true);
      setError('');

      try {
        const rawCandles = await fetchCandles(symbol, date, interval);

        if (cancelled) return;

        if (rawCandles.length === 0) {
          setError('No chart data available for this symbol/date');
          setCandles([]);
          setLoading(false);
          return;
        }

        const etOffset = getETOffsetSeconds(date);
        const shiftedCandles = rawCandles.map((c) => ({ ...c, time: c.time + etOffset }));

        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));
        
        const dayStartET = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const dayEndET = Math.floor(Date.UTC(year, month, day, 20, 0, 0) / 1000);
        const filteredCandles = shiftedCandles.filter((c) => c.time >= dayStartET && c.time <= dayEndET);

        setCandles(filteredCandles.length > 0 ? filteredCandles : shiftedCandles);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load chart');
          setLoading(false);
        }
      }
    }

    loadChartData();

    return () => {
      cancelled = true;
    };
  }, [symbol, date, interval]);

  return (
    <div className="p-4 border-t border-card-border/50 bg-card-bg/30">
      <SharedTradingChart
        symbol={symbol}
        date={date}
        candles={candles}
        transactions={transactions}
        interval={interval}
        onIntervalChange={(iv) => setInterval(iv)}
        availableIntervals={INTERVALS}
        height={360}
        showVolume={true}
        autoPatternsEnabled={autoPatternsEnabled}
        onTogglePatterns={() => setAutoPatternsEnabled(!autoPatternsEnabled)}
        onReplayTrade={() => openReplay({ date, symbol })}
        title={`${symbol} Intraday Trade Chart`}
        subtitle={formatChartDate(date)}
        loading={loading}
        error={error}
      />
    </div>
  );
}
