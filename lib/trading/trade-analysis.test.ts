import { describe, expect, it } from 'vitest';
import type { TransactionRecord } from '@/lib/db/schema';
import type { AggregatedTrade } from '@/lib/trading/aggregator';
import { buildTradeAnalysisContext } from './trade-analysis';

function transaction(
  tradeId: string,
  side: TransactionRecord['side'],
  time: string,
  price: number,
  quantity: number,
): TransactionRecord {
  return {
    tradeId,
    accountId: 'demo',
    symbol: 'NVDA',
    companyName: 'NVIDIA',
    exchanges: 'NASDAQ',
    side,
    orderType: 'MKT',
    date: '20260813',
    time,
    currency: 'USD',
    quantity,
    multiplier: 1,
    price,
    totalValue: price * quantity,
    commission: -1,
    feeMultiplier: 1,
  };
}

function trade(): AggregatedTrade {
  return {
    symbol: 'NVDA',
    companyName: 'NVIDIA',
    date: '20260813',
    firstTradeTime: '09:35:10',
    currency: 'USD',
    volume: 500,
    executions: 2,
    grossPnL: 900,
    totalCommissions: -2,
    netPnL: 898,
    side: 'LONG',
    isOpen: false,
    netQuantity: 0,
    openAvgCost: 0,
    transactions: [
      transaction('open', 'BUYTOOPEN', '09:35:10', 126.8, 250),
      transaction('close', 'SELLTOCLOSE', '10:20:00', 130.4, -250),
    ],
  };
}

function candleTime(hour: number, minute: number): number {
  // August is EDT (UTC-4); provider candles use real UTC epoch seconds.
  return Date.UTC(2026, 7, 13, hour + 4, minute, 0) / 1000;
}

describe('buildTradeAnalysisContext market-data validation', () => {
  it('uses compatible holding-window candles for excursion metrics', () => {
    const context = buildTradeAnalysisContext(trade(), [
      { time: candleTime(9, 35), open: 126.7, high: 127, low: 126.5, close: 126.9, volume: 100 },
      { time: candleTime(10, 15), open: 130.2, high: 131, low: 130, close: 130.5, volume: 100 },
    ], { interval: '5m' });

    expect(context.flags.hasCandles).toBe(true);
    expect(context.flags.marketDataPriceMismatch).toBe(false);
    expect(context.flags.isDemoTrade).toBe(false);
    expect(context.metrics.mfe.amount).toBeCloseTo(1050);
    expect(context.metrics.timeToMfeMs).toBe(39 * 60 * 1000 + 50 * 1000);
  });

  it('falls back to executions when candle prices do not match recorded fills', () => {
    const context = buildTradeAnalysisContext(trade(), [
      { time: candleTime(9, 35), open: 222, high: 224, low: 221, close: 223, volume: 100 },
      { time: candleTime(10, 15), open: 224, high: 225, low: 223, close: 224, volume: 100 },
    ], { interval: '5m' });

    expect(context.flags.hasCandles).toBe(false);
    expect(context.flags.marketDataPriceMismatch).toBe(true);
    expect(context.evidenceConfidence).toBe('low');
    expect(context.metrics.mfe.amount).toBeCloseTo(900);
    expect(context.metrics.mae.amount).toBe(0);
    expect(context.metrics.exitGivebackFromMFE?.amount).toBe(0);
  });
});
