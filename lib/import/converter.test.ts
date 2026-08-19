import { describe, expect, it } from 'vitest';
import { toTransactionRecords } from './converter';
import type { NormalizedTransaction } from './types';

const tx = (over: Partial<NormalizedTransaction> = {}): NormalizedTransaction => ({
  date: '2026-08-14',
  time: '10:00:00',
  symbol: 'AAPL',
  side: 'BUY',
  quantity: 100,
  price: 200,
  ...over,
});

describe('toTransactionRecords — deterministic identity', () => {
  it('produces identical ids when the same input is converted twice', () => {
    const input = [
      tx({ side: 'BUY', time: '10:00:00', orderId: 'A1' }),
      tx({ side: 'SELL', time: '11:00:00', orderId: 'A2' }),
    ];

    const first = toTransactionRecords(input, 'acc-1', 'USD');
    const second = toTransactionRecords(input, 'acc-1', 'USD');

    expect(first.map((t) => t.tradeId)).toEqual(second.map((t) => t.tradeId));
  });

  it('never derives ids from wall-clock time (re-import stays stable)', () => {
    const input = [tx({ orderId: 'X' })];
    const a = toTransactionRecords(input, 'acc-1', 'USD')[0].tradeId;
    const b = toTransactionRecords(input, 'acc-1', 'USD')[0].tradeId;
    expect(a).toBe(b);
    expect(a).not.toMatch(/\d{13}/); // no epoch-millis fingerprint
  });

  it('gives distinct ids to genuinely identical fills (occurrence counter)', () => {
    const input = [tx({ orderId: undefined }), tx({ orderId: undefined })];
    const records = toTransactionRecords(input, 'acc-1', 'USD');
    expect(records[0].tradeId).not.toBe(records[1].tradeId);
    // ...but still deterministic across runs
    const rerun = toTransactionRecords(input, 'acc-1', 'USD');
    expect(records.map((t) => t.tradeId)).toEqual(rerun.map((t) => t.tradeId));
  });

  it('separates executions that differ in any identity field', () => {
    const records = toTransactionRecords(
      [
        tx({ symbol: 'AAPL', price: 200, orderId: undefined }),
        tx({ symbol: 'AAPL', price: 201, orderId: undefined }),
        tx({ symbol: 'MSFT', price: 200, orderId: undefined }),
      ],
      'acc-1',
      'USD',
    );
    const ids = new Set(records.map((t) => t.tradeId));
    expect(ids.size).toBe(3);
  });

  it('scopes identity to the account (same fill, different account → different id)', () => {
    const input = [tx({ orderId: undefined })];
    const a = toTransactionRecords(input, 'acc-1', 'USD')[0].tradeId;
    const b = toTransactionRecords(input, 'acc-2', 'USD')[0].tradeId;
    expect(a).not.toBe(b);
  });

  it('still assigns open/close sides from running position', () => {
    const records = toTransactionRecords(
      [
        tx({ side: 'BUY', time: '10:00:00', orderId: 'o1' }),
        tx({ side: 'SELL', time: '11:00:00', orderId: 'o2' }),
      ],
      'acc-1',
      'USD',
    );
    expect(records[0].side).toBe('BUYTOOPEN');
    expect(records[1].side).toBe('SELLTOCLOSE');
  });

  it('preserves futures multipliers in the execution value', () => {
    const [record] = toTransactionRecords(
      [tx({ symbol: 'MES', quantity: 2, price: 5_000, multiplier: 5, orderId: 'future-1' })],
      'acc-1',
      'USD',
    );
    expect(record.multiplier).toBe(5);
    expect(record.totalValue).toBe(50_000);
  });

  it('keeps identity stable when inferred open/close context changes', () => {
    const execution = tx({ side: 'SELL', orderId: 'ibkr-transaction-42' });
    const withoutPriorPosition = toTransactionRecords([execution], 'acc-1', 'USD')[0];
    const withPriorPosition = toTransactionRecords([
      tx({ side: 'BUY', time: '09:00:00', orderId: 'prior' }),
      execution,
    ], 'acc-1', 'USD')[1];

    expect(withoutPriorPosition.side).toBe('SELLTOOPEN');
    expect(withPriorPosition.side).toBe('SELLTOCLOSE');
    expect(withoutPriorPosition.tradeId).toBe(withPriorPosition.tradeId);
  });
});
