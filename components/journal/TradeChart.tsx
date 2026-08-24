'use client';

import { useEffect, useState } from 'react';
import { fetchCandles } from '@/lib/chart/fetch';
import { getChartOverlayPreferences, setChartOverlayPreference } from '@/lib/settings';
import type { TransactionRecord } from '@/lib/db/schema';
import { useReplay } from '@/components/replay/ReplayProvider';
import SharedTradingChart from '@/components/chart/SharedTradingChart';
import type { CandleData } from '@/lib/chart/patterns';
import { etWallClockToEpochSeconds } from '@/lib/chart/execution-time';
import { getInstrumentDetails } from '@/lib/trading/instruments';

interface TradeChartProps {
  symbol: string;
  date: string;
  transactions: TransactionRecord[];
  highlightedExecutionId?: string | null;
  interval?: string;
}

const INTERVALS = ['1m', '5m', '10m', '15m', '1h'] as const;

export default function TradeChart({
  symbol,
  date,
  transactions,
  highlightedExecutionId = null,
  interval: defaultInterval = '5m',
}: TradeChartProps) {
  const { openReplay } = useReplay();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [interval, setInterval] = useState(defaultInterval);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const showExtendedHoursShading = getInstrumentDetails(symbol).assetClass === 'equity'
    && !symbol.toUpperCase().endsWith('-USD');
  // Persisted globally so the Patterns overlay doesn't reset on every chart.
  const [autoPatternsEnabled, setAutoPatternsEnabled] = useState(false);
  useEffect(() => {
    setAutoPatternsEnabled(getChartOverlayPreferences().patterns);
  }, []);

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

        // Keep provider timestamps on their true UTC epochs. SharedTradingChart
        // formats those epochs in New York time; shifting here as well applied
        // ET twice and attached executions to candles roughly four hours later.
        const dayStartUtc = etWallClockToEpochSeconds(date, '04:00:00');
        const dayEndUtc = etWallClockToEpochSeconds(date, '20:00:00');
        const filteredCandles = dayStartUtc !== null && dayEndUtc !== null
          ? rawCandles.filter((c) => c.time >= dayStartUtc && c.time <= dayEndUtc)
          : rawCandles;

        setCandles(filteredCandles.length > 0 ? filteredCandles : rawCandles);
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
    <div className="w-full h-full">
      <SharedTradingChart
        symbol={symbol}
        date={date}
        candles={candles}
        transactions={transactions}
        highlightedTransactionId={highlightedExecutionId}
        interval={interval}
        onIntervalChange={(iv) => setInterval(iv)}
        availableIntervals={INTERVALS}
        height={360}
        showVolume={true}
        showExtendedHoursShading={showExtendedHoursShading}
        autoPatternsEnabled={autoPatternsEnabled}
        onTogglePatterns={() => {
          const next = !autoPatternsEnabled;
          setAutoPatternsEnabled(next);
          setChartOverlayPreference('patterns', next);
        }}
        onReplayTrade={() => openReplay({ date, symbol })}
        showChartIdentity={false}
        loading={loading}
        error={error}
        flat={true}
      />
    </div>
  );
}
