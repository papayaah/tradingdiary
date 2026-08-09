import type { AggregatedTrade } from './aggregator';
import type { TransactionRecord } from '../db/schema';

export interface TradeDetails {
  side: 'LONG' | 'SHORT';
  isOpen: boolean;
  dateLabel: string;            // "2026-03-31"
  openTime: string | null;      // "10:50:21"
  closeTime: string | null;     // "10:53:27" (null while still open)
  durationSeconds: number | null;
  avgEntry: number;
  avgExit: number | null;       // null while still open
  entryQty: number;             // shares that opened the position
  totalQty: number;             // total shares transacted
  remainingQty: number;         // shares still held (open trades)
  positionCost: number;
  netPnL: number;
  grossPnL: number;
  commissions: number;
  pnlPerShare: number;
  pointsPerShare: number | null;
  pointsTotal: number | null;
  executions: number;
}

function timeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function weightedAvgPrice(txns: TransactionRecord[]): number {
  const qty = txns.reduce((sum, t) => sum + Math.abs(t.quantity), 0);
  if (qty === 0) return 0;
  return txns.reduce((sum, t) => sum + Math.abs(t.quantity) * t.price, 0) / qty;
}

/**
 * Derive the per-trade summary stats shown in the expanded journal panel, all
 * from the trade's own transactions — no extra data access.
 */
export function computeTradeDetails(trade: AggregatedTrade): TradeDetails {
  const txns = trade.transactions;
  const buys = txns.filter((t) => t.side === 'BUYTOOPEN' || t.side === 'BUYTOCLOSE');
  const sells = txns.filter((t) => t.side === 'SELLTOOPEN' || t.side === 'SELLTOCLOSE');

  const isLong = trade.side === 'LONG';
  const entrySide = isLong ? buys : sells;
  const exitSide = isLong ? sells : buys;

  const avgEntry = weightedAvgPrice(entrySide);
  const avgExit = exitSide.length > 0 ? weightedAvgPrice(exitSide) : null;

  const entryQty = entrySide.reduce((sum, t) => sum + Math.abs(t.quantity), 0);
  const multiplier = txns[0]?.multiplier || 1;
  const positionCost = entryQty * avgEntry * multiplier;

  const sorted = [...txns].sort((a, b) => timeToSeconds(a.time) - timeToSeconds(b.time));
  const openTime = sorted[0]?.time ?? null;
  const closeTime = trade.isOpen ? null : (sorted[sorted.length - 1]?.time ?? null);
  const durationSeconds =
    openTime && closeTime ? Math.max(0, timeToSeconds(closeTime) - timeToSeconds(openTime)) : null;

  const pnlPerShare = entryQty > 0 ? trade.netPnL / entryQty : 0;
  const pointsPerShare =
    avgExit != null ? (isLong ? avgExit - avgEntry : avgEntry - avgExit) : null;
  const pointsTotal = pointsPerShare != null ? pointsPerShare * entryQty : null;

  const y = trade.date.slice(0, 4);
  const m = trade.date.slice(4, 6);
  const d = trade.date.slice(6, 8);

  return {
    side: trade.side,
    isOpen: trade.isOpen,
    dateLabel: `${y}-${m}-${d}`,
    openTime,
    closeTime,
    durationSeconds,
    avgEntry,
    avgExit,
    entryQty,
    totalQty: trade.volume,
    remainingQty: Math.abs(trade.netQuantity),
    positionCost,
    netPnL: trade.netPnL,
    grossPnL: trade.grossPnL,
    commissions: trade.totalCommissions,
    pnlPerShare,
    pointsPerShare,
    pointsTotal,
    executions: trade.executions,
  };
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}
