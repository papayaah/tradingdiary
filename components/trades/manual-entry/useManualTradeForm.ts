'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from '@/contexts/AccountContext';
import type { AccountRecord } from '@/lib/db/schema';
import {
  getTransactionsByAccount,
  saveManualTransaction,
} from '@/lib/db/trades';
import { getInstrumentDetails } from '@/lib/trading/instruments';
import { buildManualTransaction } from '@/lib/trading/manual-entry';
import type { ManualTradeFormValues } from './types';

function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function localTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function initialValues(accountId = ''): ManualTradeFormValues {
  return {
    symbol: '',
    quantity: '100',
    direction: 'buy',
    price: '',
    date: localDate(),
    time: localTime(),
    commission: '',
    multiplier: '1',
    accountId,
  };
}

export function useManualTradeForm(onSaved?: () => void | Promise<void>) {
  const { accounts, selectedAccountId, refreshAccounts } = useAccount();
  const [values, setValues] = useState(() => initialValues(selectedAccountId ?? ''));
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const instrument = useMemo(
    () => getInstrumentDetails(values.symbol),
    [values.symbol]
  );

  useEffect(() => {
    if (!values.accountId && selectedAccountId) {
      setValues((current) => ({ ...current, accountId: selectedAccountId }));
    }
  }, [selectedAccountId, values.accountId]);

  function update<K extends keyof ManualTradeFormValues>(
    field: K,
    value: ManualTradeFormValues[K]
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function normalizeSymbol() {
    if (!values.symbol.trim()) return;
    setValues((current) => ({
      ...current,
      symbol: instrument.symbol,
      multiplier: String(instrument.multiplier),
    }));
  }

  async function fetchQuote(): Promise<number | null> {
    if (!instrument.symbol) return null;
    setIsFetchingQuote(true);
    try {
      const response = await fetch(
        `/api/quotes?symbols=${encodeURIComponent(instrument.symbol)}`
      );
      if (!response.ok) return null;
      const prices = await response.json() as Record<string, number>;
      const quote = prices[instrument.symbol];
      if (typeof quote !== 'number') return null;
      setValues((current) => ({ ...current, price: String(quote) }));
      return quote;
    } finally {
      setIsFetchingQuote(false);
    }
  }

  async function submit() {
    const quantity = Number(values.quantity);
    if (!instrument.symbol) {
      toast.error('Enter a symbol.');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error('Enter a quantity greater than zero.');
      return;
    }

    setIsSaving(true);
    try {
      const selectedAccount =
        accounts.find((account) => account.accountId === values.accountId)
        ?? accounts.find((account) => account.accountId === selectedAccountId);
      const accountId = selectedAccount?.accountId ?? `manual-${crypto.randomUUID()}`;
      const newAccount: AccountRecord | null = selectedAccount ? null : {
        accountId,
        name: 'Manual Trading Account',
        type: 'Custom',
        currency: 'USD',
        address: '',
        importedAt: Date.now(),
      };

      const price = Number(values.price) || await fetchQuote();
      if (!price || price <= 0) {
        toast.error('A live quote was unavailable. Enter the trade price to continue.');
        return;
      }

      const existingTransactions = await getTransactionsByAccount(accountId);
      const transaction = buildManualTransaction(
        {
          accountId,
          symbol: instrument.symbol,
          quantity,
          direction: values.direction,
          price,
          date: values.date,
          time: values.time,
          currency: selectedAccount?.currency ?? 'USD',
          commission: Number(values.commission) || 0,
          multiplier: Number(values.multiplier) || instrument.multiplier,
        },
        existingTransactions
      );

      await saveManualTransaction(newAccount, transaction);
      if (newAccount) await refreshAccounts(accountId);
      setValues(initialValues(accountId));
      toast.success(`${transaction.symbol} trade added.`);
      await onSaved?.();
    } catch (error) {
      console.error('Failed to save manual trade', error);
      toast.error('The trade could not be saved.');
    } finally {
      setIsSaving(false);
    }
  }

  return {
    accounts,
    fetchQuote,
    instrument,
    isFetchingQuote,
    isSaving,
    normalizeSymbol,
    submit,
    update,
    values,
  };
}
