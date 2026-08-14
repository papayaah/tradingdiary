import type { TransactionRecord } from '@/lib/db/schema';

type FxResponse = {
  accountCurrency: string;
  rates: Record<string, {
    rate: number;
    rateDate: string;
    provider: 'exchange-rate-api';
  }>;
  error?: string;
};

export async function enrichTransactionsWithHistoricalFx(
  transactions: TransactionRecord[],
  accountCurrency: string,
): Promise<TransactionRecord[]> {
  const target = accountCurrency.trim().toUpperCase();
  const requests = new Map<string, { date: string; currency: string }>();

  for (const transaction of transactions) {
    const currency = transaction.currency.trim().toUpperCase();
    if (currency === target) continue;
    if (
      transaction.fxRateToAccount &&
      transaction.fxAccountCurrency === target &&
      transaction.fxRateDate === transaction.date &&
      transaction.fxRateProvider === 'exchange-rate-api'
    ) continue;
    requests.set(`${transaction.date}:${currency}`, { date: transaction.date, currency });
  }

  if (requests.size === 0) {
    return transactions.map((transaction) => ({
      ...transaction,
      fxRateToAccount: transaction.currency.toUpperCase() === target ? 1 : transaction.fxRateToAccount,
      fxAccountCurrency: target,
      fxRateDate: transaction.fxRateDate ?? transaction.date,
    }));
  }

  const response = await fetch('/api/fx/historical', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountCurrency: target, requests: [...requests.values()] }),
  });
  const payload = await response.json() as FxResponse;
  if (!response.ok) {
    throw new Error(payload.error || 'Historical exchange rates could not be loaded');
  }

  return transactions.map((transaction) => {
    const currency = transaction.currency.toUpperCase();
    if (currency === target) {
      return {
        ...transaction,
        fxRateToAccount: 1,
        fxAccountCurrency: target,
        fxRateDate: transaction.date,
      };
    }
    const fx = payload.rates[`${transaction.date}:${currency}`];
    if (!fx) throw new Error(`Missing ${currency}/${target} rate for ${transaction.date}`);
    return {
      ...transaction,
      fxRateToAccount: fx.rate,
      fxAccountCurrency: target,
      fxRateDate: fx.rateDate,
      fxRateProvider: fx.provider,
    };
  });
}
