'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { getAllDailyNotes, getAllTradeNotes } from '@/lib/db/notes';
import { getTransactionsByAccount } from '@/lib/db/trades';
import { getTradeDateCutoff } from '@/lib/settings';
import { aggregateByDay } from '@/lib/trading/aggregator';
import { searchIndex } from '@/lib/search/search';
import type { SearchIndex } from '@/lib/search/types';

const EMPTY_INDEX: SearchIndex = { trades: [], dailyNotes: [], tradeNotes: [] };

export function useGlobalSearch(query: string, enabled: boolean) {
  const { selectedAccountId, accounts } = useAccount();
  const [indexedData, setIndexedData] = useState<{ accountId: string; index: SearchIndex } | null>(null);

  useEffect(() => {
    if (!enabled || !selectedAccountId) {
      return;
    }

    let active = true;
    Promise.all([
      getTransactionsByAccount(selectedAccountId),
      getAllDailyNotes(),
      getAllTradeNotes(),
    ])
      .then(([transactions, dailyNotes, tradeNotes]) => {
        if (!active) return;
        const trades = aggregateByDay(transactions, getTradeDateCutoff())
          .flatMap((summary) => summary.trades);
        setIndexedData({
          accountId: selectedAccountId,
          index: {
            trades,
            dailyNotes: dailyNotes.filter((note) => note.accountId === selectedAccountId),
            tradeNotes: tradeNotes.filter((note) => note.accountId === selectedAccountId),
          },
        });
      })
      .catch(() => {
        if (active) setIndexedData(null);
      });

    return () => {
      active = false;
    };
  }, [enabled, selectedAccountId]);

  const index = indexedData?.accountId === selectedAccountId ? indexedData.index : EMPTY_INDEX;
  const results = useMemo(() => searchIndex(index, query), [index, query]);
  const activeAccount = accounts.find((account) => account.accountId === selectedAccountId);
  const isLoading = Boolean(enabled && selectedAccountId && indexedData?.accountId !== selectedAccountId);

  return {
    results,
    isLoading,
    currency: activeAccount?.currency || 'USD',
  };
}
