import { TransactionRecord } from '../db/schema';

export interface Holding {
  symbol: string;
  companyName: string;
  quantity: number;
  averageCost: number;
  totalCost: number;
  multiplier: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPnL?: number;
  unrealizedPnLPercent?: number;
  lastUpdate: string;
}

interface FIFOLot {
  qty: number;
  entryPrice: number;
  multiplier: number;
}

export function computePortfolio(transactions: TransactionRecord[]): Holding[] {
  const bySymbol = new Map<string, TransactionRecord[]>();

  for (const t of transactions) {
    const existing = bySymbol.get(t.symbol);
    if (existing) existing.push(t);
    else bySymbol.set(t.symbol, [t]);
  }

  const holdings: Holding[] = [];

  for (const [symbol, txns] of bySymbol) {
    // Sort chronologically
    txns.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.time.localeCompare(b.time);
    });

    const openLots: FIFOLot[] = [];
    let runningPosition = 0;
    let companyName = symbol;

    for (const t of txns) {
      companyName = t.companyName || symbol;
      const isOpening = t.side === 'BUYTOOPEN' || t.side === 'SELLTOOPEN';
      const qty = Math.abs(t.quantity);

      if (isOpening && qty > 0) {
        openLots.push({
          qty,
          entryPrice: Math.abs(t.price),
          multiplier: t.multiplier || 1,
        });
        runningPosition += (t.side === 'BUYTOOPEN' ? qty : -qty);
      } else if (!isOpening && qty > 0) {
        let remaining = qty;
        while (remaining > 0.001 && openLots.length > 0) {
          const lot = openLots[0];
          const matched = Math.min(remaining, lot.qty);
          lot.qty -= matched;
          remaining -= matched;
          if (lot.qty < 0.001) openLots.shift();
        }
        runningPosition += (t.side === 'BUYTOCLOSE' ? qty : -qty);
      }
    }

    if (Math.abs(runningPosition) > 0.001) {
      const totalQty = openLots.reduce((s, l) => s + l.qty, 0);
      const totalCost = openLots.reduce(
        (sum, lot) => sum + lot.qty * lot.entryPrice * lot.multiplier,
        0
      );
      const weightedEntryPrice = openLots.reduce(
        (sum, lot) => sum + lot.qty * lot.entryPrice,
        0
      );
      const multiplier = openLots[0]?.multiplier || 1;
      
      holdings.push({
        symbol,
        companyName,
        quantity: runningPosition,
        averageCost: totalQty > 0 ? weightedEntryPrice / totalQty : 0,
        totalCost: totalCost,
        multiplier,
        lastUpdate: txns[txns.length - 1].date,
      });
    }
  }

  return holdings;
}
