import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummaryMetaRecord, StoredDaySummary } from '@/lib/db/schema';

const mocks = vi.hoisted(() => ({
  getDB: vi.fn(),
}));

vi.mock('@/lib/db/database', () => ({ getDB: mocks.getDB }));

import { DAY_SUMMARY_SCHEMA_VERSION } from '@/lib/db/day-summary-state';
import {
  readStoredDaySummaries,
  readStoredDaySummariesSnapshot,
  rebuildDaySummaries,
} from '@/lib/trading/day-summaries-store';

function storedDay(accountId: string, date: string): StoredDaySummary {
  return {
    accountId,
    date,
    formattedDate: date,
    trades: [],
    totalTrades: 0,
    totalVolume: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    totalCommissions: 0,
    grossPnL: 0,
    netPnL: 0,
    totalPnL: 0,
  };
}

function readDatabase(
  meta: DaySummaryMetaRecord | undefined,
  rows: StoredDaySummary[],
) {
  const transaction = vi.fn(() => ({
    objectStore: (name: string) => {
      if (name === 'daySummaryMeta') return { get: vi.fn().mockResolvedValue(meta) };
      return {
        index: vi.fn(() => ({ getAll: vi.fn().mockResolvedValue(rows) })),
      };
    },
    done: Promise.resolve(),
  }));
  return { transaction };
}

describe('persisted day summaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trusts and sorts rows only when the completion marker is current', async () => {
    const accountId = 'acct-1';
    mocks.getDB.mockResolvedValue(readDatabase({
      accountId,
      schemaVersion: DAY_SUMMARY_SCHEMA_VERSION,
      builtAt: 1,
    }, [storedDay(accountId, '20260101'), storedDay(accountId, '20260103')]));

    const summaries = await readStoredDaySummaries(accountId);

    expect(summaries?.map((summary) => summary.date)).toEqual(['20260103', '20260101']);
    expect(summaries?.[0]).not.toHaveProperty('accountId');
  });

  it('treats a completed empty account as a cache hit', async () => {
    const accountId = 'empty';
    mocks.getDB.mockResolvedValue(readDatabase({
      accountId,
      schemaVersion: DAY_SUMMARY_SCHEMA_VERSION,
      builtAt: 1,
    }, []));

    await expect(readStoredDaySummaries(accountId)).resolves.toEqual([]);
  });

  it('rejects missing and obsolete completion markers', async () => {
    mocks.getDB.mockResolvedValueOnce(readDatabase(undefined, [storedDay('acct', '20260101')]));
    await expect(readStoredDaySummaries('acct')).resolves.toBeNull();

    mocks.getDB.mockResolvedValueOnce(readDatabase({
      accountId: 'acct',
      schemaVersion: DAY_SUMMARY_SCHEMA_VERSION - 1,
      builtAt: 1,
    }, [storedDay('acct', '20260101')]));
    await expect(readStoredDaySummaries('acct')).resolves.toBeNull();
  });

  it('can paint existing rows while their completion marker is stale', async () => {
    const rows = [storedDay('acct', '20260101'), storedDay('acct', '20260103')];
    mocks.getDB.mockResolvedValue({
      getAllFromIndex: vi.fn().mockResolvedValue(rows),
    });

    await expect(readStoredDaySummariesSnapshot('acct')).resolves.toEqual([
      expect.objectContaining({ date: '20260103' }),
      expect.objectContaining({ date: '20260101' }),
    ]);
  });

  it('rebuilds the source snapshot and completion marker atomically', async () => {
    const metaPut = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(() => ({
      objectStore: (name: string) => {
        if (name === 'transactions') {
          return {
            index: vi.fn(() => ({ getAll: vi.fn().mockResolvedValue([]) })),
          };
        }
        if (name === 'daySummaryMeta') return { put: metaPut };
        return {
          index: vi.fn(() => ({ getAllKeys: vi.fn().mockResolvedValue([]) })),
          delete: vi.fn().mockResolvedValue(undefined),
          put: vi.fn().mockResolvedValue(undefined),
        };
      },
      done: Promise.resolve(),
    }));
    mocks.getDB.mockResolvedValue({ transaction });

    await expect(rebuildDaySummaries('acct')).resolves.toEqual([]);
    expect(transaction).toHaveBeenCalledWith(
      ['transactions', 'daySummaries', 'daySummaryMeta'],
      'readwrite',
    );
    expect(metaPut).toHaveBeenCalledWith(expect.objectContaining({
      accountId: 'acct',
      schemaVersion: DAY_SUMMARY_SCHEMA_VERSION,
    }));
  });
});
