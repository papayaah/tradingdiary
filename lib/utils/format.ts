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

export function formatVolume(volume: number): string {
  return volume.toLocaleString('en-US');
}
