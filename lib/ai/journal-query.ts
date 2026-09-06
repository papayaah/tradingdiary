import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import { dailyNote, tradeGroup, tradeNote, tradingAccount } from '@/lib/db/server/schema';
import type {
  JournalAnalyticsQuery,
  JournalAnalyticsResult,
  JournalAssistantEvidence,
  JournalDimension,
  JournalField,
  JournalFilter,
  JournalMeasure,
  JournalMetric,
  JournalNoteResult,
  JournalNoteSearchQuery,
  JournalNoteSearchResult,
  JournalPrimitive,
} from './journal-assistant-contract';

export interface JournalAssistantAccount {
  id: string;
  accountId: string;
  name: string;
  currency: string;
}

export interface JournalTradeRow {
  id: string;
  clientKey: string;
  accountId: string;
  accountName: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  currency: string;
  openedDate: string;
  openedTime: string;
  closedDate: string | null;
  closedTime: string | null;
  tradingDay: string;
  entryAvgPrice: number;
  exitAvgPrice: number;
  maxPosition: number;
  volume: number;
  grossPnL: number;
  totalCommissions: number;
  netPnL: number;
  isOpen: boolean;
}

const DIMENSIONS = new Set<JournalDimension>([
  'tradingDay', 'weekday', 'month', 'symbol', 'side', 'outcome', 'accountName',
  'accountId', 'currency', 'openedDate', 'openedHour', 'closedDate', 'closedHour', 'isOpen',
]);
const MEASURES = new Set<JournalMeasure>([
  'netPnL', 'grossPnL', 'commissionsPaid', 'volume', 'maxPosition',
  'entryAvgPrice', 'exitAvgPrice',
]);
const MONEY_MEASURES = new Set<JournalMeasure>([
  'netPnL', 'grossPnL', 'commissionsPaid', 'entryAvgPrice', 'exitAvgPrice',
]);
const OPERATIONS = new Set(['count', 'sum', 'average', 'min', 'max', 'win_rate', 'profit_factor']);
const FILTER_OPERATORS = new Set([
  'equals', 'not_equals', 'greater_than', 'at_least', 'less_than', 'at_most',
  'contains', 'in', 'between',
]);

export class JournalQueryError extends Error {}

export const JOURNAL_SCHEMA_CATALOG = {
  grain: 'One row is one flat-to-flat trade (round trip). Closed trades are used by default.',
  dimensions: {
    tradingDay: 'Broker-attributed trading date, YYYYMMDD. Use for questions asking which date/day.',
    weekday: 'Weekday name derived from tradingDay.',
    month: 'Calendar month derived from tradingDay, YYYY-MM.',
    symbol: 'Ticker symbol.',
    side: 'LONG or SHORT.',
    outcome: 'win, loss, breakeven, or open, derived from netPnL.',
    accountName: 'User-visible trading account name.',
    accountId: 'User-visible stable account identifier.',
    currency: 'Account currency used by P&L and price measures.',
    openedDate: 'Position opening date, YYYYMMDD.',
    openedHour: 'Hour of entry, 0 through 23.',
    closedDate: 'Position closing date, YYYYMMDD, or null for open positions.',
    closedHour: 'Hour of exit, 0 through 23, or null.',
    isOpen: 'Whether the position is still open.',
  },
  measures: {
    netPnL: 'Realized P&L after commissions, in account currency.',
    grossPnL: 'Realized P&L before commissions, in account currency.',
    commissionsPaid: 'Positive magnitude of commissions paid, in account currency.',
    volume: 'Total units/contracts transacted in the round trip.',
    maxPosition: 'Largest absolute position size during the trade.',
    entryAvgPrice: 'Average entry price.',
    exitAvgPrice: 'Average exit price.',
  },
  metricOperations: {
    count: 'Number of trades; field must be omitted.',
    sum: 'Sum of a measure.',
    average: 'Arithmetic average of a measure.',
    min: 'Smallest value of a measure.',
    max: 'Largest value of a measure.',
    win_rate: 'Winning closed trades divided by all closed trades, as a percentage; field omitted.',
    profit_factor: 'Gross winning net P&L divided by absolute gross losing net P&L; field omitted.',
  },
  safeguards: [
    'All access is read-only and automatically restricted to the authenticated user.',
    'Different account currencies are never silently combined for monetary calculations.',
    'At most 3 dimensions, 5 metrics, 8 filters, and 50 result rows are accepted.',
  ],
};

function cleanDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

function dimensionValue(row: JournalTradeRow, dimension: JournalDimension): JournalPrimitive {
  switch (dimension) {
    case 'weekday': {
      const day = cleanDate(row.tradingDay);
      if (!day) return null;
      const date = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)));
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(date);
    }
    case 'month':
      return /^\d{8}$/.test(row.tradingDay)
        ? `${row.tradingDay.slice(0, 4)}-${row.tradingDay.slice(4, 6)}`
        : row.tradingDay;
    case 'outcome':
      return row.isOpen ? 'open' : row.netPnL > 0 ? 'win' : row.netPnL < 0 ? 'loss' : 'breakeven';
    case 'openedHour':
      return Number.isFinite(Number(row.openedTime.slice(0, 2))) ? Number(row.openedTime.slice(0, 2)) : null;
    case 'closedHour':
      return row.closedTime && Number.isFinite(Number(row.closedTime.slice(0, 2)))
        ? Number(row.closedTime.slice(0, 2))
        : null;
    default:
      return row[dimension as keyof JournalTradeRow] as JournalPrimitive;
  }
}

function measureValue(row: JournalTradeRow, measure: JournalMeasure): number {
  if (measure === 'commissionsPaid') return Math.abs(row.totalCommissions);
  return row[measure] as number;
}

function fieldValue(row: JournalTradeRow, field: JournalField): JournalPrimitive {
  return DIMENSIONS.has(field as JournalDimension)
    ? dimensionValue(row, field as JournalDimension)
    : measureValue(row, field as JournalMeasure);
}

function comparable(value: JournalPrimitive): string | number | boolean | null {
  return typeof value === 'string' ? value.toLowerCase() : value;
}

function equalsValue(left: JournalPrimitive, right: JournalPrimitive): boolean {
  if (typeof left === 'number' && typeof right === 'string' && right.trim() !== '') {
    return left === Number(right);
  }
  if (typeof right === 'number' && typeof left === 'string' && left.trim() !== '') {
    return Number(left) === right;
  }
  if (typeof left === 'boolean' && typeof right === 'string') return left === (right.toLowerCase() === 'true');
  if (typeof right === 'boolean' && typeof left === 'string') return (left.toLowerCase() === 'true') === right;
  return comparable(left) === comparable(right);
}

function matchesFilter(row: JournalTradeRow, filter: JournalFilter): boolean {
  const left = fieldValue(row, filter.field);
  const right = filter.value;
  switch (filter.operator) {
    case 'equals': return !Array.isArray(right) && equalsValue(left, right);
    case 'not_equals': return !Array.isArray(right) && !equalsValue(left, right);
    case 'contains': return !Array.isArray(right) && String(left ?? '').toLowerCase().includes(String(right ?? '').toLowerCase());
    case 'in': return Array.isArray(right) && right.some((value) => equalsValue(left, value));
    case 'between': {
      if (!Array.isArray(right) || right.length !== 2 || left == null) return false;
      const value = comparable(left);
      const low = comparable(right[0]);
      const high = comparable(right[1]);
      return value != null && low != null && high != null && value >= low && value <= high;
    }
    default: {
      if (Array.isArray(right) || left == null || right == null) return false;
      const l = comparable(left);
      const r = comparable(right);
      if (filter.operator === 'greater_than') return l! > r!;
      if (filter.operator === 'at_least') return l! >= r!;
      if (filter.operator === 'less_than') return l! < r!;
      return l! <= r!;
    }
  }
}

function defaultAlias(metric: JournalMetric): string {
  return metric.field ? `${metric.operation}_${metric.field}` : metric.operation;
}

function normalizeQuery(input: JournalAnalyticsQuery): JournalAnalyticsQuery {
  const dimensions = [...new Set(input.dimensions ?? [])];
  if (dimensions.length > 3 || dimensions.some((value) => !DIMENSIONS.has(value))) {
    throw new JournalQueryError('The query contains unsupported or too many dimensions.');
  }
  if (!Array.isArray(input.metrics) || input.metrics.length < 1 || input.metrics.length > 5) {
    throw new JournalQueryError('The query must contain between 1 and 5 metrics.');
  }
  const aliases = new Set<string>();
  const metrics = input.metrics.map((metric) => {
    if (!OPERATIONS.has(metric.operation)) throw new JournalQueryError('The query contains an unsupported metric operation.');
    const requiresField = ['sum', 'average', 'min', 'max'].includes(metric.operation);
    if (requiresField && (!metric.field || !MEASURES.has(metric.field))) {
      throw new JournalQueryError(`${metric.operation} requires a supported measure.`);
    }
    if (!requiresField && metric.field) {
      throw new JournalQueryError(`${metric.operation} does not accept a field.`);
    }
    const requestedAlias = typeof metric.alias === 'string'
      ? metric.alias.trim().replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 40)
      : '';
    let alias = requestedAlias || defaultAlias(metric);
    let suffix = 2;
    while (aliases.has(alias) || dimensions.includes(alias as JournalDimension)) alias = `${requestedAlias || defaultAlias(metric)}_${suffix++}`;
    aliases.add(alias);
    return { operation: metric.operation, field: metric.field ?? null, alias };
  });
  const filters = input.filters ?? [];
  if (filters.length > 8 || filters.some((filter) =>
    (!DIMENSIONS.has(filter.field as JournalDimension) && !MEASURES.has(filter.field as JournalMeasure)) ||
    !FILTER_OPERATORS.has(filter.operator)
  )) throw new JournalQueryError('The query contains unsupported or too many filters.');
  for (const filter of filters) {
    if ((filter.operator === 'in' || filter.operator === 'between') && !Array.isArray(filter.value)) {
      throw new JournalQueryError(`${filter.operator} requires an array of filter values.`);
    }
    if (filter.operator === 'between' && (!Array.isArray(filter.value) || filter.value.length !== 2)) {
      throw new JournalQueryError('between requires exactly two filter values.');
    }
    if (filter.operator !== 'in' && filter.operator !== 'between' && Array.isArray(filter.value)) {
      throw new JournalQueryError(`${filter.operator} requires one scalar filter value.`);
    }
    if (filter.operator !== 'in' && filter.operator !== 'between' && filter.value == null) {
      throw new JournalQueryError(`${filter.operator} requires a filter value.`);
    }
  }

  const orderBy = (input.orderBy ?? []).slice(0, 3).filter((order) =>
    (dimensions.includes(order.field as JournalDimension) || aliases.has(order.field)) &&
    (order.direction === 'asc' || order.direction === 'desc')
  );
  return {
    dimensions,
    metrics,
    filters,
    orderBy: orderBy.length ? orderBy : [{ field: metrics[0].alias!, direction: 'desc' }],
    limit: Math.min(50, Math.max(1, Math.trunc(input.limit ?? 20))),
    accountScope: input.accountScope === 'all' ? 'all' : 'selected',
    includeOpenTrades: input.includeOpenTrades === true,
  };
}

function aggregate(rows: JournalTradeRow[], metric: JournalMetric): number | null {
  if (metric.operation === 'count') return rows.length;
  if (metric.operation === 'win_rate') {
    const closed = rows.filter((row) => !row.isOpen);
    return closed.length ? (closed.filter((row) => row.netPnL > 0).length / closed.length) * 100 : null;
  }
  if (metric.operation === 'profit_factor') {
    const profits = rows.reduce((sum, row) => sum + Math.max(0, row.netPnL), 0);
    const losses = Math.abs(rows.reduce((sum, row) => sum + Math.min(0, row.netPnL), 0));
    return losses ? profits / losses : profits > 0 ? null : 0;
  }
  const values = rows.map((row) => measureValue(row, metric.field!)).filter(Number.isFinite);
  if (!values.length) return null;
  if (metric.operation === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (metric.operation === 'average') return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (metric.operation === 'min') return Math.min(...values);
  return Math.max(...values);
}

function compareValues(a: JournalPrimitive, b: JournalPrimitive): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

function groupMatches(row: JournalTradeRow, resultRow: Record<string, JournalPrimitive>, dimensions: JournalDimension[]): boolean {
  return dimensions.every((dimension) => equalsValue(dimensionValue(row, dimension), resultRow[dimension]));
}

function evidenceFor(rows: JournalTradeRow[]): JournalAssistantEvidence[] {
  return [...rows]
    .sort((a, b) => Math.abs(b.netPnL) - Math.abs(a.netPnL))
    .slice(0, 8)
    .map((row) => ({
      tradeGroupId: row.id,
      tradeGroupKey: row.clientKey,
      accountId: row.accountId,
      accountName: row.accountName,
      symbol: row.symbol,
      tradingDay: row.tradingDay,
      side: row.side,
      netPnL: row.netPnL,
      currency: row.currency,
      href: `/journal?account=${encodeURIComponent(row.accountId)}&date=${row.tradingDay}&symbol=${encodeURIComponent(row.symbol)}`,
    }));
}

export function runJournalAnalyticsQuery(
  sourceRows: JournalTradeRow[],
  input: JournalAnalyticsQuery,
  options: { selectedAccount: JournalAssistantAccount; accountScopeLabel?: string; dataAsOf?: string },
): JournalAnalyticsResult {
  const query = normalizeQuery(input);
  const scopedRows = query.accountScope === 'all'
    ? sourceRows
    : sourceRows.filter((row) => row.accountId === options.selectedAccount.accountId);
  const filteredRows = scopedRows.filter((row) =>
    (query.includeOpenTrades || !row.isOpen) && query.filters!.every((filter) => matchesFilter(row, filter))
  );
  const currencies = [...new Set(filteredRows.map((row) => row.currency))].sort();
  const hasCurrencySensitiveMetric = query.metrics.some((metric) =>
    (metric.field && MONEY_MEASURES.has(metric.field)) || metric.operation === 'profit_factor'
  );
  let dimensions = [...query.dimensions!];
  let currencyWarning: string | undefined;
  if (hasCurrencySensitiveMetric && currencies.length > 1 && !dimensions.includes('currency')) {
    dimensions = [...dimensions, 'currency'];
    currencyWarning = 'Results were split by account currency because unlike currencies cannot be added or compared safely.';
  }
  if (dimensions.length > 3) throw new JournalQueryError('Currency safety would exceed the maximum of 3 dimensions. Remove one dimension.');

  const groups = new Map<string, JournalTradeRow[]>();
  for (const row of filteredRows) {
    const key = JSON.stringify(dimensions.map((dimension) => dimensionValue(row, dimension)));
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  if (!dimensions.length && !groups.size) groups.set('[]', []);

  const resultRows = [...groups.values()].map((rows) => {
    const result: Record<string, JournalPrimitive> = {};
    for (const dimension of dimensions) result[dimension] = rows.length ? dimensionValue(rows[0], dimension) : null;
    for (const metric of query.metrics) result[metric.alias!] = aggregate(rows, metric);
    return result;
  });
  resultRows.sort((a, b) => {
    for (const order of query.orderBy!) {
      const compared = compareValues(a[order.field], b[order.field]);
      if (compared) return order.direction === 'asc' ? compared : -compared;
    }
    return 0;
  });
  const limitedRows = resultRows.slice(0, query.limit!);
  const evidenceRows = limitedRows.length
    ? filteredRows.filter((row) => groupMatches(row, limitedRows[0], dimensions))
    : [];
  const accountScopeLabel = query.accountScope === 'all'
    ? (options.accountScopeLabel ?? 'All accounts')
    : options.selectedAccount.name;

  return {
    query: { ...query, dimensions },
    columns: [...dimensions, ...query.metrics.map((metric) => metric.alias!)],
    rows: limitedRows,
    evidence: evidenceFor(evidenceRows),
    scannedTradeCount: scopedRows.length,
    matchedTradeCount: filteredRows.length,
    accountScopeLabel,
    currencies,
    currencyWarning,
    dataAsOf: options.dataAsOf ?? new Date().toISOString(),
  };
}

export async function getJournalAssistantAccounts(userId: string): Promise<JournalAssistantAccount[]> {
  return db.select({
    id: tradingAccount.id,
    accountId: tradingAccount.clientAccountId,
    name: tradingAccount.name,
    currency: tradingAccount.currency,
  }).from(tradingAccount).where(and(eq(tradingAccount.userId, userId), isNull(tradingAccount.deletedAt)));
}

async function loadTradeRows(userId: string): Promise<JournalTradeRow[]> {
  const rows = await db.select({
    id: tradeGroup.id,
    clientKey: tradeGroup.clientKey,
    accountId: tradingAccount.clientAccountId,
    accountName: tradingAccount.name,
    symbol: tradeGroup.symbol,
    side: tradeGroup.side,
    currency: tradeGroup.accountCurrency,
    openedDate: tradeGroup.openedDate,
    openedTime: tradeGroup.openedTime,
    closedDate: tradeGroup.closedDate,
    closedTime: tradeGroup.closedTime,
    tradingDay: tradeGroup.tradingDay,
    entryAvgPrice: tradeGroup.entryAvgPrice,
    exitAvgPrice: tradeGroup.exitAvgPrice,
    maxPosition: tradeGroup.maxPosition,
    volume: tradeGroup.volume,
    grossPnL: tradeGroup.grossPnL,
    totalCommissions: tradeGroup.totalCommissions,
    netPnL: tradeGroup.netPnL,
    isOpen: tradeGroup.isOpen,
  }).from(tradeGroup)
    .innerJoin(tradingAccount, eq(tradeGroup.accountId, tradingAccount.id))
    .where(and(
      eq(tradeGroup.userId, userId),
      isNull(tradeGroup.deletedAt),
      isNull(tradingAccount.deletedAt),
    ));
  return rows.map((row) => ({ ...row, side: row.side === 'SHORT' ? 'SHORT' : 'LONG' }));
}

export async function queryJournalAnalytics(args: {
  userId: string;
  selectedAccount: JournalAssistantAccount;
  query: JournalAnalyticsQuery;
}): Promise<JournalAnalyticsResult> {
  const rows = await loadTradeRows(args.userId);
  return runJournalAnalyticsQuery(rows, args.query, { selectedAccount: args.selectedAccount });
}

function normalizeNoteQuery(input: JournalNoteSearchQuery): Required<JournalNoteSearchQuery> {
  return {
    text: typeof input.text === 'string' ? input.text.trim().slice(0, 200) : '',
    symbol: typeof input.symbol === 'string' ? input.symbol.trim().replace(/^\$/, '').toUpperCase().slice(0, 30) : '',
    fromDate: cleanDate(input.fromDate) ?? '',
    toDate: cleanDate(input.toDate) ?? '',
    accountScope: input.accountScope === 'all' ? 'all' : 'selected',
    limit: Math.min(30, Math.max(1, Math.trunc(input.limit ?? 10))),
  };
}

function noteMatches(note: JournalNoteResult, query: Required<JournalNoteSearchQuery>, selectedAccountId: string): boolean {
  if (query.accountScope !== 'all' && note.accountId !== selectedAccountId) return false;
  if (query.symbol && note.symbol !== query.symbol) return false;
  if (query.fromDate && note.date < query.fromDate) return false;
  if (query.toDate && note.date > query.toDate) return false;
  if (query.text) {
    const haystack = note.content.toLowerCase();
    const words = query.text.toLowerCase().split(/\s+/).filter((word) => word.length > 1);
    if (words.length && !words.some((word) => haystack.includes(word))) return false;
  }
  return Boolean(note.content.trim());
}

export async function searchJournalNotes(args: {
  userId: string;
  selectedAccount: JournalAssistantAccount;
  query: JournalNoteSearchQuery;
}): Promise<JournalNoteSearchResult> {
  const query = normalizeNoteQuery(args.query);
  const [tradeNotes, dayNotes] = await Promise.all([
    db.select({
      date: tradeGroup.tradingDay,
      symbol: tradeGroup.symbol,
      accountId: tradingAccount.clientAccountId,
      accountName: tradingAccount.name,
      content: tradeNote.content,
    }).from(tradeNote)
      .innerJoin(tradeGroup, eq(tradeNote.tradeGroupId, tradeGroup.id))
      .innerJoin(tradingAccount, eq(tradeGroup.accountId, tradingAccount.id))
      .where(and(
        eq(tradeNote.userId, args.userId), isNull(tradeNote.deletedAt),
        isNull(tradeGroup.deletedAt), isNull(tradingAccount.deletedAt),
      )),
    db.select({
      date: dailyNote.tradingDay,
      accountId: tradingAccount.clientAccountId,
      accountName: tradingAccount.name,
      content: dailyNote.content,
    }).from(dailyNote)
      .innerJoin(tradingAccount, eq(dailyNote.accountId, tradingAccount.id))
      .where(and(
        eq(dailyNote.userId, args.userId), isNull(dailyNote.deletedAt), isNull(tradingAccount.deletedAt),
      )),
  ]);
  const notes: JournalNoteResult[] = [
    ...tradeNotes.map((note) => ({
      kind: 'trade' as const,
      ...note,
      content: note.content.slice(0, 1_200),
      href: `/journal?account=${encodeURIComponent(note.accountId)}&date=${note.date}&symbol=${encodeURIComponent(note.symbol)}`,
    })),
    ...dayNotes.map((note) => ({
      kind: 'day' as const,
      ...note,
      content: note.content.slice(0, 1_200),
      href: `/journal?account=${encodeURIComponent(note.accountId)}&date=${note.date}`,
    })),
  ].filter((note) => noteMatches(note, query, args.selectedAccount.accountId))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, query.limit ?? 10);

  return {
    query: [query.text, query.symbol, query.fromDate && `from ${query.fromDate}`, query.toDate && `to ${query.toDate}`]
      .filter(Boolean).join(' · ') || 'recent notes',
    notes,
    accountScopeLabel: query.accountScope === 'all' ? 'All accounts' : args.selectedAccount.name,
    dataAsOf: new Date().toISOString(),
  };
}
