function parseScanTime(value: string | number | Date): Date {
  if (typeof value !== 'string') return new Date(value);
  const trimmed = value.trim();
  // PostgreSQL `timestamp` strings may arrive without an explicit zone even
  // though scanner timestamps are written in UTC. Make that contract explicit.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasZone ? trimmed : `${trimmed.replace(' ', 'T')}Z`;
  return new Date(normalized);
}

export function formatScanTimeEt(value: string | number | Date = Date.now()): string {
  return parseScanTime(value).toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
