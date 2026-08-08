import { normalizeDate, normalizeTime } from '../utils/normalizer';

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findHeader(headers: string[], aliases: string[]): string | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.find((header) => normalizedAliases.has(normalizeHeader(header)));
}

export function hasHeaders(headers: string[], requiredAliases: string[][]): boolean {
  return requiredAliases.every((aliases) => Boolean(findHeader(headers, aliases)));
}

export function readValue(
  row: Record<string, string>,
  headers: string[],
  aliases: string[],
): string {
  const header = findHeader(headers, aliases);
  return header ? String(row[header] ?? '').trim() : '';
}

export function parseBrokerNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '--' || trimmed === '-') return undefined;

  const negative = /^\s*\(.*\)\s*$/.test(trimmed) || /^\s*-/.test(trimmed);
  const normalized = trimmed
    .replace(/[()]/g, '')
    .replace(/[^0-9.,+-]/g, '')
    .replace(/,/g, '');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

export function splitBrokerDateTime(value: string): { date: string; time: string } {
  const clean = value.trim();
  const match = clean.match(/^(.+?)(?:[ T](\d{1,2}:\d{2}(?::\d{2})?)(?:\s*[A-Z]{2,4})?)?$/i);
  const datePart = match?.[1] || clean;
  const timePart = match?.[2] || '00:00:00';
  return {
    date: normalizeDate(datePart),
    time: normalizeTime(timePart),
  };
}

export function normalizeBrokerSide(value: string): 'BUY' | 'SELL' | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (/\b(sell|sold|sld|short|sto|stc)\b/.test(normalized)) return 'SELL';
  if (/\b(buy|bought|bot|bto|btc|reinvest(?:ment| shares)?)\b/.test(normalized)) return 'BUY';
  return undefined;
}

export function cleanSymbol(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '').toUpperCase();
}
