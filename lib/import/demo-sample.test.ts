import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTLGFile } from './brokers/ibkr/tlg-parser';
import { aggregateTradeGroupsByDay, aggregateByDay } from '@/lib/trading/aggregator';

// Verifies the shipped demo sample exercises the flat-to-flat journal: the
// 2026-08-10 AAPL day is a scale in/out win, a short win, a small loss, a
// reversal (long->short) that splits into two trades, and one still-open trade.
describe('demo sample flat-to-flat day', () => {
  const content = readFileSync(
    join(process.cwd(), 'public/samples/demo-ibkr.tlg'),
    'utf8',
  );
  const parsed = parseTLGFile(content);

  it('parses and produces the multi-round-trip AAPL day', () => {
    const days = aggregateTradeGroupsByDay(parsed.transactions);
    const day = days.find((d) => d.date === '20260810');
    expect(day).toBeDefined();

    const aapl = day!.trades.filter((t) => t.symbol === 'AAPL');
    expect(aapl).toHaveLength(6);

    // Timeline order by entry time.
    expect(aapl.map((t) => t.firstTradeTime)).toEqual([
      '09:31:00', '10:15:00', '11:05:00', '13:00:00', '13:30:00', '15:30:00',
    ]);
    // Sides, incl. the reversal's long->short split (index 3 long, 4 short).
    expect(aapl.map((t) => t.side)).toEqual([
      'LONG', 'SHORT', 'LONG', 'LONG', 'SHORT', 'LONG',
    ]);

    // Exactly one open trade (the 15:30 entry with no close).
    expect(aapl.filter((t) => t.isOpen)).toHaveLength(1);
    expect(aapl[5].isOpen).toBe(true);

    // Round-trip gross P&L (native).
    expect(aapl[0].nativeGrossPnL).toBeCloseTo(700); // scale in/out win
    expect(aapl[1].nativeGrossPnL).toBeCloseTo(200); // short win
    expect(aapl[2].nativeGrossPnL).toBeCloseTo(-150); // small loss
    expect(aapl[3].nativeGrossPnL).toBeCloseTo(-200); // reversal long leg
    expect(aapl[4].nativeGrossPnL).toBeCloseTo(200); // reversal short leg
  });

  it('captures the reversal round trip that legacy day+symbol aggregation drops', () => {
    const flat = aggregateTradeGroupsByDay(parsed.transactions).find((d) => d.date === '20260810')!;
    const legacy = aggregateByDay(parsed.transactions).find((d) => d.date === '20260810')!;
    // Legacy FIFO cannot open a short from a sell-through, so it loses the short
    // leg of the reversal; flat-to-flat records both legs, so its day P&L is
    // higher by that recovered round trip.
    expect(flat.netPnL).toBeGreaterThan(legacy.netPnL);
  });

  it('reconciles with legacy aggregation on a simple (no-reversal) day', () => {
    // 2026-06-10 has plain round trips (AAPL + Samsung), so both models agree.
    const flat = aggregateTradeGroupsByDay(parsed.transactions).find((d) => d.date === '20260610')!;
    const legacy = aggregateByDay(parsed.transactions).find((d) => d.date === '20260610')!;
    expect(flat.netPnL).toBeCloseTo(legacy.netPnL);
  });
});
