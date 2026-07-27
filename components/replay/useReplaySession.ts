'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { getTransactionsByAccount } from '@/lib/db/trades';
import type { TransactionRecord } from '@/lib/db/schema';
import {
  computePnLTimeline,
  timeToSeconds,
  type PnLSnapshot,
} from '@/lib/replay/engine';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay } from '@/lib/trading/aggregator';

interface ReplayDay {
  date: string;
  formattedDate: string;
  transactions: TransactionRecord[];
}

interface ReplayData {
  allTransactions: TransactionRecord[];
  days: ReplayDay[];
}

export function useReplaySession(date?: string | null, symbol?: string | null) {
  const { selectedAccountId } = useAccount();
  const [data, setData] = useState<ReplayData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!selectedAccountId) {
        setData({ allTransactions: [], days: [] });
        return;
      }

      setData(null);
      const allTransactions = await getTransactionsByAccount(selectedAccountId);
      if (cancelled) return;

      const summaries = aggregateByDay(allTransactions, getTradeDateCutoff());
      const days = summaries.map((summary) => ({
        date: summary.date,
        formattedDate: summary.formattedDate,
        transactions: summary.trades.flatMap((trade) => trade.transactions),
      }));

      setData({ allTransactions, days });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  const selectedDay = useMemo(() => {
    if (!data?.days.length) return undefined;
    if (date) {
      const requestedDay = data.days.find((day) => day.date === date);
      if (requestedDay) return requestedDay;
    }
    return data.days[0];
  }, [data, date]);

  const selectedDate = selectedDay?.date ?? '';

  const dayTransactions = useMemo(() => {
    if (!selectedDay) return [];
    const transactions = symbol
      ? selectedDay.transactions.filter((transaction) => transaction.symbol === symbol)
      : selectedDay.transactions;

    return [...transactions].sort(
      (a, b) => timeToSeconds(a.time) - timeToSeconds(b.time),
    );
  }, [selectedDay, symbol]);

  const symbols = useMemo(() => {
    const firstTradeBySymbol = new Map<string, number>();
    for (const transaction of dayTransactions) {
      const time = timeToSeconds(transaction.time);
      const previous = firstTradeBySymbol.get(transaction.symbol);
      if (previous === undefined || time < previous) {
        firstTradeBySymbol.set(transaction.symbol, time);
      }
    }

    return [...firstTradeBySymbol.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([sessionSymbol]) => sessionSymbol);
  }, [dayTransactions]);

  const relevantTransactions = useMemo(() => {
    const transactions = symbol
      ? data?.allTransactions.filter((transaction) => transaction.symbol === symbol) ?? []
      : data?.allTransactions ?? [];

    return [...transactions].sort(
      (a, b) =>
        a.date.localeCompare(b.date)
        || timeToSeconds(a.time) - timeToSeconds(b.time),
    );
  }, [data, symbol]);

  const snapshots = useMemo(() => {
    if (!selectedDate || relevantTransactions.length === 0) return [];

    const fullTimeline = computePnLTimeline(relevantTransactions);
    const firstIndex = relevantTransactions.findIndex(
      (transaction) => transaction.date === selectedDate,
    );
    if (firstIndex === -1) return [];

    const baselinePnL = firstIndex > 0
      ? computePnLTimeline(relevantTransactions.slice(0, firstIndex)).at(-1)?.cumulativeNetPnL ?? 0
      : 0;

    const daySnapshots: PnLSnapshot[] = [];
    for (let index = firstIndex; index < relevantTransactions.length; index += 1) {
      if (relevantTransactions[index].date !== selectedDate) break;
      const snapshot = fullTimeline[index];
      if (!snapshot) continue;
      daySnapshots.push({
        ...snapshot,
        cumulativeNetPnL: snapshot.cumulativeNetPnL - baselinePnL,
      });
    }
    return daySnapshots;
  }, [relevantTransactions, selectedDate]);

  const timeRange = useMemo(() => {
    if (dayTransactions.length === 0) return { start: 0, end: 0 };
    const times = dayTransactions.map((transaction) => timeToSeconds(transaction.time));
    return {
      start: Math.max(0, Math.min(...times) - 300),
      end: Math.min(86_400, Math.max(...times) + 300),
    };
  }, [dayTransactions]);

  return {
    loading: data === null,
    empty: data?.days.length === 0,
    selectedDate,
    formattedDate: selectedDay?.formattedDate,
    dayTransactions,
    symbols,
    snapshots,
    timeRange,
  };
}
