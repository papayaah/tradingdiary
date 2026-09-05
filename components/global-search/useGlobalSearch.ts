'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { searchIndex } from '@/lib/search/search';
import { getSearchIndex, prewarmSearchIndex } from '@/lib/search/search-index-cache';
import type { SearchIndex } from '@/lib/search/types';

const EMPTY_INDEX: SearchIndex = { trades: [], dailyNotes: [], tradeNotes: [] };

export function useGlobalSearch(query: string, enabled: boolean) {
  const { selectedAccountId, accounts } = useAccount();
  const [indexedData, setIndexedData] = useState<{ accountId: string; index: SearchIndex } | null>(null);

  // Prewarm the index shortly after an account is available, on idle, so the
  // first ⌘K is instant instead of paying for the full-history build then.
  useEffect(() => {
    if (!selectedAccountId) return;
    const timer = setTimeout(() => prewarmSearchIndex(selectedAccountId), 600);
    return () => clearTimeout(timer);
  }, [selectedAccountId]);

  // On open, get the (usually warm) index. Returns instantly when cached;
  // otherwise builds once and every subsequent open is instant.
  useEffect(() => {
    if (!enabled || !selectedAccountId) return;

    let active = true;
    getSearchIndex(selectedAccountId)
      .then((index) => {
        if (active) setIndexedData({ accountId: selectedAccountId, index });
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
