import type { ManualDirection } from '@/lib/trading/manual-entry';

export interface ManualTradeFormValues {
  symbol: string;
  quantity: string;
  direction: ManualDirection;
  price: string;
  date: string;
  time: string;
  commission: string;
  multiplier: string;
  accountId: string;
}
