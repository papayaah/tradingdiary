export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-${formatted}` : formatted;
}

export function formatPnL(value: number): string {
  const formatted = formatCurrency(value);
  return value > 0 ? `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : formatted;
}

export function pnlColorClass(value: number): string {
  if (value > 0.005) return 'text-profit';
  if (value < -0.005) return 'text-loss';
  return 'text-muted';
}

export function formatTime(time24: string): string {
  const [h, m] = time24.split(':');
  const hour = parseInt(h);
  if (hour === 0) return `12:${m} AM`;
  if (hour < 12) return `${hour}:${m} AM`;
  if (hour === 12) return `12:${m} PM`;
  return `${hour - 12}:${m} PM`;
}

export function formatTradeTime(time24: string): string {
  return time24.substring(0, 5);
}

/**
 * Strip provider notation for display only. The stored symbol keeps its
 * canonical form (e.g. NQ=F) — which the frontend futures detection and the
 * backend provider fallback both depend on — while the UI shows the clean root.
 *   NQ=F -> NQ, /NQ -> NQ, NQ.C.0 -> NQ. Crypto (BTC-USD) and equities pass through.
 */
export function displaySymbol(symbol: string): string {
  let s = symbol.trim();
  if (s.startsWith('/')) s = s.slice(1);
  s = s.replace(/=F$/i, '').replace(/\.C\.0$/i, '');
  return s;
}

/** Yahoo market data is presented as delayed in end-user trading views. */
export function isDelayedMarketDataProvider(provider?: string): boolean {
  return provider?.toLowerCase().includes('yahoo') ?? false;
}

export function formatVolume(volume: number): string {
  return volume.toLocaleString('en-US');
}

/**
 * Converts a set of candles and optional interval into a human-readable timespan string.
 * e.g., 144 candles of 10m -> "24h duration (10m)" or "10 Days history (10m)"
 */
export function formatCandlesTimespan(
  candles?: Array<{ time: number | string }>,
  interval?: string,
): string {
  if (!candles || candles.length === 0) {
    return interval ? `0m duration (${interval})` : 'No data';
  }

  if (candles.length === 1) {
    return interval ? `1 bar (${interval})` : '1 bar';
  }

  const toSec = (t: number | string): number => {
    if (typeof t === 'number') {
      return t > 1e11 ? t / 1000 : t;
    }
    const parsed = Date.parse(t);
    return isNaN(parsed) ? 0 : parsed / 1000;
  };

  const start = toSec(candles[0].time);
  const end = toSec(candles[candles.length - 1].time);

  if (!start || !end || start >= end) {
    const barSec = parseIntervalToSeconds(interval);
    if (barSec > 0) {
      const totalSec = candles.length * barSec;
      return formatDurationString(totalSec, interval);
    }
    return `${candles.length} bars${interval ? ` (${interval})` : ''}`;
  }

  const totalSec = end - start;
  return formatDurationString(totalSec, interval);
}

function parseIntervalToSeconds(interval?: string): number {
  if (!interval) return 0;
  const num = parseInt(interval.replace(/[^0-9]/g, ''), 10) || 1;
  const unit = interval.replace(/[0-9]/g, '').toLowerCase();
  if (unit === 's') return num;
  if (unit === 'm') return num * 60;
  if (unit === 'h') return num * 3600;
  if (unit === 'd') return num * 86400;
  if (unit === 'w') return num * 604800;
  return num * 60;
}

function formatDurationString(totalSec: number, interval?: string): string {
  const totalHours = totalSec / 3600;
  const totalDays = totalHours / 24;

  let durationText = '';

  if (totalHours < 1) {
    const mins = Math.max(1, Math.round(totalSec / 60));
    durationText = `${mins}m duration`;
  } else if (totalHours < 36) {
    const roundedHours = Math.round(totalHours * 10) / 10;
    const intHours = Math.round(totalHours);
    if (Math.abs(totalHours - intHours) < 0.2) {
      durationText = `${intHours}h duration`;
    } else {
      durationText = `${roundedHours}h duration`;
    }
  } else if (totalDays < 30) {
    const roundedDays = Math.round(totalDays * 10) / 10;
    const intDays = Math.round(totalDays);
    if (Math.abs(totalDays - intDays) < 0.2) {
      durationText = `${intDays} Days history`;
    } else {
      durationText = `${roundedDays} Days history`;
    }
  } else if (totalDays < 365) {
    const months = Math.round((totalDays / 30.4) * 10) / 10;
    const intMonths = Math.round(totalDays / 30.4);
    if (Math.abs(totalDays / 30.4 - intMonths) < 0.2) {
      durationText = `${intMonths} Mo history`;
    } else {
      durationText = `${months} Mo history`;
    }
  } else {
    const years = Math.round((totalDays / 365.25) * 10) / 10;
    durationText = `${years} Yr history`;
  }

  return interval ? `${durationText} (${interval})` : durationText;
}
