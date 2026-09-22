/**
 * Deterministic report metrics over a set of trades (day/symbol grain — the same
 * rows the journal, dashboard, and AI use). Pure and unit-tested so report totals
 * reconcile exactly with the journal. A trade counts toward win/loss, ratio,
 * streak, and drawdown metrics once it has a realized result (fully closed, or an
 * open position that already booked P&L from partial closes); positions with no
 * realized P&L yet are excluded.
 */

export interface ReportTrade {
  /** Stable key for drill-down / dedupe. */
  key: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  tradingDay: string; // YYYYMMDD — the day P&L is realized
  firstTradeTime: string; // HH:MM:SS
  netPnL: number; // account currency, net of commissions
  grossPnL: number; // account currency, before commissions
  totalCommissions: number; // account currency (negative = charge)
  volume: number;
  isOpen: boolean;
  holdMinutes?: number;
  currency: string;
  accountId: string;
  accountName: string;
}

export interface ReportMetrics {
  tradeCount: number; // trades with a realized result
  openCount: number;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRate: number; // %, over realized trades
  netPnL: number;
  grossPnL: number;
  commissions: number; // magnitude of commissions paid (positive)
  avgTrade: number; // net / realized count
  avgWin: number;
  avgLoss: number; // <= 0
  largestWin: number;
  largestLoss: number; // <= 0
  payoffRatio: number | null; // avgWin / |avgLoss|
  profitFactor: number | null; // gross wins / |gross losses| (null = no losses)
  expectancy: number; // expected net per realized trade
  maxDrawdown: number; // <= 0, worst peak-to-trough of cumulative net
  maxWinStreak: number;
  maxLossStreak: number;
  avgHoldMinutes: number | null;
  totalVolume: number;
}

function chronological(trades: ReportTrade[]): ReportTrade[] {
  return [...trades].sort((a, b) => {
    const dayCmp = a.tradingDay.localeCompare(b.tradingDay);
    if (dayCmp !== 0) return dayCmp;
    return a.firstTradeTime.localeCompare(b.firstTradeTime);
  });
}

export function computeReportMetrics(trades: ReportTrade[]): ReportMetrics {
  // A trade counts toward realized metrics when it's fully closed OR it booked
  // realized P&L from partial closes even though a position is still carried —
  // matching how the journal/dashboard total each day (an "open" symbol-day
  // still contributes its realized P&L). Only positions with no realized result
  // yet are excluded.
  const realized = trades.filter((t) => !t.isOpen || Math.abs(t.grossPnL) > 0.01 || Math.abs(t.netPnL) > 0.01);
  const openCount = trades.length - realized.length;

  const wins = realized.filter((t) => t.netPnL > 0);
  const losses = realized.filter((t) => t.netPnL < 0);
  const breakeven = realized.filter((t) => t.netPnL === 0);

  const netPnL = realized.reduce((s, t) => s + t.netPnL, 0);
  const grossPnL = realized.reduce((s, t) => s + t.grossPnL, 0);
  const commissions = Math.abs(realized.reduce((s, t) => s + t.totalCommissions, 0));

  const grossWin = wins.reduce((s, t) => s + t.netPnL, 0);
  const grossLoss = losses.reduce((s, t) => s + t.netPnL, 0); // <= 0
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  const payoffRatio = losses.length && avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : null;
  const profitFactor = losses.length && grossLoss !== 0
    ? grossWin / Math.abs(grossLoss)
    : null;

  const winRate = realized.length ? (wins.length / realized.length) * 100 : 0;
  const expectancy = realized.length ? netPnL / realized.length : 0;

  // Drawdown + streaks walk the realized trades in realization order.
  const ordered = chronological(realized);
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  for (const t of ordered) {
    cumulative += t.netPnL;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.min(maxDrawdown, cumulative - peak);
    if (t.netPnL > 0) {
      winStreak += 1;
      lossStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (t.netPnL < 0) {
      lossStreak += 1;
      winStreak = 0;
      maxLossStreak = Math.max(maxLossStreak, lossStreak);
    } else {
      winStreak = 0;
      lossStreak = 0;
    }
  }

  const holdTimes = realized
    .map((t) => t.holdMinutes)
    .filter((m): m is number => typeof m === 'number' && Number.isFinite(m));
  const avgHoldMinutes = holdTimes.length
    ? holdTimes.reduce((s, m) => s + m, 0) / holdTimes.length
    : null;

  return {
    tradeCount: realized.length,
    openCount,
    winCount: wins.length,
    lossCount: losses.length,
    breakevenCount: breakeven.length,
    winRate,
    netPnL,
    grossPnL,
    commissions,
    avgTrade: realized.length ? netPnL / realized.length : 0,
    avgWin,
    avgLoss,
    largestWin: wins.reduce((m, t) => Math.max(m, t.netPnL), 0),
    largestLoss: losses.reduce((m, t) => Math.min(m, t.netPnL), 0),
    payoffRatio,
    profitFactor,
    expectancy,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    avgHoldMinutes,
    totalVolume: trades.reduce((s, t) => s + t.volume, 0),
  };
}

export type ReportDimension =
  | 'symbol'
  | 'side'
  | 'weekday'
  | 'month'
  | 'hour'
  | 'account'
  | 'outcome';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The bucket a trade falls into for a given breakdown dimension. */
export function dimensionKey(trade: ReportTrade, dimension: ReportDimension): string {
  switch (dimension) {
    case 'symbol':
      return trade.symbol;
    case 'side':
      return trade.side;
    case 'account':
      return trade.accountName;
    case 'outcome':
      return trade.isOpen ? 'Open' : trade.netPnL > 0 ? 'Win' : trade.netPnL < 0 ? 'Loss' : 'Breakeven';
    case 'month':
      return /^\d{8}$/.test(trade.tradingDay)
        ? `${trade.tradingDay.slice(0, 4)}-${trade.tradingDay.slice(4, 6)}`
        : trade.tradingDay;
    case 'weekday': {
      if (!/^\d{8}$/.test(trade.tradingDay)) return trade.tradingDay;
      const d = new Date(Date.UTC(+trade.tradingDay.slice(0, 4), +trade.tradingDay.slice(4, 6) - 1, +trade.tradingDay.slice(6, 8)));
      return WEEKDAYS[d.getUTCDay()];
    }
    case 'hour': {
      const h = Number(trade.firstTradeTime.slice(0, 2));
      return Number.isFinite(h) ? `${String(h).padStart(2, '0')}:00` : '—';
    }
  }
}

export interface ReportBreakdownRow {
  key: string;
  trades: ReportTrade[];
  metrics: ReportMetrics;
}

/** Group trades by a dimension and compute metrics per bucket. */
export function computeBreakdown(
  trades: ReportTrade[],
  dimension: ReportDimension,
): ReportBreakdownRow[] {
  const groups = new Map<string, ReportTrade[]>();
  for (const trade of trades) {
    const key = dimensionKey(trade, dimension);
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }
  return [...groups.entries()]
    .map(([key, groupTrades]) => ({ key, trades: groupTrades, metrics: computeReportMetrics(groupTrades) }))
    .sort((a, b) => b.metrics.netPnL - a.metrics.netPnL);
}
