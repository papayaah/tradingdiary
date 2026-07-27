import type { TransactionRecord } from '@/lib/db/schema';
import { getInstrumentDetails } from './instruments';

export type ManualDirection = 'buy' | 'sell';

export interface ManualTradeInput {
  accountId: string;
  symbol: string;
  quantity: number;
  direction: ManualDirection;
  price: number;
  date: string;
  time: string;
  currency: string;
  commission?: number;
  multiplier?: number;
}

export function getNetPosition(
  transactions: TransactionRecord[],
  symbol: string
): number {
  return transactions
    .filter((transaction) => transaction.symbol === symbol)
    .reduce((position, transaction) => {
      const quantity = Math.abs(transaction.quantity);
      return transaction.side === 'BUYTOOPEN' || transaction.side === 'BUYTOCLOSE'
        ? position + quantity
        : position - quantity;
    }, 0);
}

export function resolveTransactionSide(
  direction: ManualDirection,
  currentPosition: number
): TransactionRecord['side'] {
  if (direction === 'buy') {
    return currentPosition < 0 ? 'BUYTOCLOSE' : 'BUYTOOPEN';
  }
  return currentPosition > 0 ? 'SELLTOCLOSE' : 'SELLTOOPEN';
}

export function buildManualTransaction(
  input: ManualTradeInput,
  existingTransactions: TransactionRecord[],
  tradeId = crypto.randomUUID()
): TransactionRecord {
  const instrument = getInstrumentDetails(input.symbol);
  const quantity = Math.abs(input.quantity);
  const multiplier = input.multiplier ?? instrument.multiplier;
  const currentPosition = getNetPosition(existingTransactions, instrument.symbol);

  return {
    tradeId,
    accountId: input.accountId,
    symbol: instrument.symbol,
    companyName: instrument.symbol,
    exchanges: instrument.assetClass === 'future' ? 'CME' : '',
    side: resolveTransactionSide(input.direction, currentPosition),
    orderType: 'MARKET',
    date: input.date.replaceAll('-', ''),
    time: input.time.length === 5 ? `${input.time}:00` : input.time,
    currency: input.currency,
    quantity,
    multiplier,
    price: input.price,
    totalValue: quantity * input.price * multiplier,
    commission: -(Math.abs(input.commission ?? 0)),
    feeMultiplier: 1,
  };
}
