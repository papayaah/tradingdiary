import type { DailySummary, AggregatedTrade } from './aggregator';

export interface CalendarDay {
  date: string;
  dayNum: number;
  dayName: string;
  pnl: number;
  tradeCount: number;
  hasData: boolean;
}

export interface CumulativePnLPoint {
  date: string;
  label: string;
  value: number;
}

export interface DashboardData {
  calendar: CalendarDay[];
  cumulativePnL: CumulativePnLPoint[];
  totalWins: number;
  totalLosses: number;
  avgWin: number;
  avgLoss: number;
  largestGain: number;
  largestLoss: number;
  avgWinHoldMinutes: number;
  avgLossHoldMinutes: number;
}

function parseDate(dateStr: string): Date {
  const y = parseInt(dateStr.substring(0, 4));
  const m = parseInt(dateStr.substring(4, 6)) - 1;
  const d = parseInt(dateStr.substring(6, 8));
  return new Date(y, m, d);
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function timeToSeconds(time: string): number {
  const [h, m, s] = time.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function holdTimeMinutes(trade: AggregatedTrade): number {
  if (trade.transactions.length < 2) return 0;
  const times = trade.transactions.map((t) => timeToSeconds(t.time));
  const first = Math.min(...times);
  const last = Math.max(...times);
  return Math.max(0, (last - first) / 60);
}

export function computeDashboard(summaries: DailySummary[]): DashboardData {
  const sorted = [...summaries].sort((a, b) => a.date.localeCompare(b.date));

  // Determine the month range from data
  const allDates = sorted.map((s) => parseDate(s.date));
  const firstDate = allDates.length > 0 ? allDates[0] : new Date();
  const lastDate = allDates.length > 0 ? allDates[allDates.length - 1] : new Date();

  // Build calendar for the week containing data
  const monthStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const weekStart = new Date(firstDate);
  weekStart.setDate(firstDate.getDate() - firstDate.getDay());

  const pnlByDate = new Map<string, { pnl: number; trades: number }>();
  for (const s of sorted) {
    pnlByDate.set(s.date, { pnl: s.netPnL, trades: s.totalTrades });
  }

  // Build full week calendar from first day's week
  const calendar: CalendarDay[] = [];
  const calStart = new Date(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = new Date(calStart);
    d.setDate(calStart.getDate() + i);
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const data = pnlByDate.get(dateStr);
    calendar.push({
      date: dateStr,
      dayNum: d.getDate(),
      dayName: DAY_NAMES[d.getDay()],
      pnl: data?.pnl ?? 0,
      tradeCount: data?.trades ?? 0,
      hasData: !!data,
    });
  }

  // Cumulative P&L
  let cumulative = 0;
  const cumulativePnL: CumulativePnLPoint[] = [];
  for (const s of sorted) {
    cumulative += s.netPnL;
    cumulativePnL.push({
      date: s.date,
      label: formatDateLabel(parseDate(s.date)),
      value: Math.round(cumulative * 100) / 100,
    });
  }

  // Collect all closed trades across all days
  const allClosed: AggregatedTrade[] = [];
  for (const s of sorted) {
    for (const t of s.trades) {
      if (!t.isOpen) allClosed.push(t);
    }
  }

  const wins = allClosed.filter((t) => t.netPnL > 0);
  const losses = allClosed.filter((t) => t.netPnL < 0);

  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnL, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, t) => s + t.netPnL, 0) / losses.length : 0;
  const largestGain = wins.length > 0 ? Math.max(...wins.map((t) => t.netPnL)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.netPnL)) : 0;

  const winHoldTimes = wins.map(holdTimeMinutes).filter((m) => m > 0);
  const lossHoldTimes = losses.map(holdTimeMinutes).filter((m) => m > 0);
  const avgWinHoldMinutes = winHoldTimes.length > 0
    ? winHoldTimes.reduce((s, m) => s + m, 0) / winHoldTimes.length
    : 0;
  const avgLossHoldMinutes = lossHoldTimes.length > 0
    ? lossHoldTimes.reduce((s, m) => s + m, 0) / lossHoldTimes.length
    : 0;

  return {
    calendar,
    cumulativePnL,
    totalWins: wins.length,
    totalLosses: losses.length,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    largestGain: Math.round(largestGain * 100) / 100,
    largestLoss: Math.round(largestLoss * 100) / 100,
    avgWinHoldMinutes: Math.round(avgWinHoldMinutes),
    avgLossHoldMinutes: Math.round(avgLossHoldMinutes),
  };
}
