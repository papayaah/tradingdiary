import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/server';
import {
  cashFlow,
  execution,
  tradeGroup,
  tradeGroupExecution,
  tradingAccount,
} from '@/lib/db/server/schema';
import type { CashFlowRecord } from '@/lib/db/schema';
import type { TransactionRecord } from '@/lib/db/schema';
import type { Holding } from './portfolio';
import {
  resolveDashboardDateRange,
  type DashboardDateRange,
  type DashboardRangeType,
} from './dashboard-range';
import { aggregateByDay, type DailySummary } from './aggregator';

/**
 * Strip raw fills from each summary. Dashboard/calendar/journal render scalar day
 * and trade fields only; fills are fetched on demand, so this keeps payloads small.
 */
function compactSummaries(summaries: DailySummary[]): DailySummary[] {
  return summaries.map((summary) => ({
    ...summary,
    trades: summary.trades.map((trade) => {
      const copy = { ...trade };
      delete copy.transactions;
      return copy;
    }),
  }));
}

/** Map a persisted execution row to the shared TransactionRecord contract. */
function mapExecutionRow(
  row: typeof execution.$inferSelect,
  clientAccountId: string,
): TransactionRecord {
  return {
    tradeId: row.sourceTradeId,
    accountId: clientAccountId,
    symbol: row.symbol,
    companyName: row.companyName,
    exchanges: row.exchanges,
    side: row.side as TransactionRecord['side'],
    orderType: row.orderType,
    date: row.date,
    time: row.time,
    tradeDate: row.tradeDate ?? undefined,
    currency: row.currency,
    quantity: row.quantity,
    multiplier: row.multiplier,
    price: row.price,
    totalValue: row.totalValue,
    commission: row.commission,
    feeMultiplier: row.feeMultiplier,
    realizedPnL: row.realizedPnL ?? undefined,
    unrealizedPnL: row.unrealizedPnL ?? undefined,
    fxRateToAccount: row.fxRateToAccount ?? undefined,
    fxAccountCurrency: row.fxAccountCurrency ?? undefined,
    fxRateDate: row.fxRateDate ?? undefined,
    fxRateProvider: (row.fxRateProvider as TransactionRecord['fxRateProvider']) ?? undefined,
  };
}

export interface ServerDashboardRange {
  accountId: string;
  currency: string;
  initialBalance: number | null;
  range: DashboardDateRange;
  summaries: DailySummary[];
  cashFlows: CashFlowRecord[];
  holdings: Holding[];
}

interface DashboardRangeRequest {
  rangeType: DashboardRangeType;
  startDate?: string;
  endDate?: string;
}

export async function getServerDashboardRange(
  userId: string,
  clientAccountId: string,
  request: DashboardRangeRequest,
): Promise<ServerDashboardRange | null> {
  const [account] = await db
    .select()
    .from(tradingAccount)
    .where(and(
      eq(tradingAccount.userId, userId),
      eq(tradingAccount.clientAccountId, clientAccountId),
      isNull(tradingAccount.deletedAt),
    ))
    .limit(1);
  if (!account) return null;

  // Each fill's own trading day (broker TradeDate, else the execution date). P&L
  // is realized on the day a position is closed, so daily totals bucket by this.
  const fillDay = sql<string>`coalesce(${execution.tradeDate}, ${execution.date})`;

  const [latest] = await db
    .select({ latestDay: sql<string | null>`max(${fillDay})` })
    .from(execution)
    .where(and(
      eq(execution.userId, userId),
      eq(execution.accountId, account.id),
      isNull(execution.deletedAt),
    ));

  const range = resolveDashboardDateRange(
    request.rangeType,
    latest?.latestDay ?? undefined,
    request.startDate,
    request.endDate,
  );
  // Daily P&L is computed per fill (IBKR realized × FX, bucketed by trading day)
  // via the same aggregateByDay the client uses — the single source of truth.
  const execConditions = [
    eq(execution.userId, userId),
    eq(execution.accountId, account.id),
    isNull(execution.deletedAt),
  ];
  if (range.start) execConditions.push(gte(fillDay, range.start));
  if (range.end) execConditions.push(lte(fillDay, range.end));

  const cashConditions = [
    eq(cashFlow.userId, userId),
    eq(cashFlow.accountId, account.id),
    isNull(cashFlow.deletedAt),
  ];
  if (range.start) cashConditions.push(gte(cashFlow.date, range.start));
  if (range.end) cashConditions.push(lte(cashFlow.date, range.end));

  const [execRows, cashRows, openGroups] = await Promise.all([
    db
      .select()
      .from(execution)
      .where(and(...execConditions)),
    db
      .select()
      .from(cashFlow)
      .where(and(...cashConditions))
      .orderBy(asc(cashFlow.date)),
    db
      .select({
        id: tradeGroup.id,
        symbol: tradeGroup.symbol,
        companyName: tradeGroup.companyName,
        openedDate: tradeGroup.openedDate,
        netQuantity: tradeGroup.netQuantity,
        openAvgCost: tradeGroup.openAvgCost,
      })
      .from(tradeGroup)
      .where(and(
        eq(tradeGroup.userId, userId),
        eq(tradeGroup.accountId, account.id),
        eq(tradeGroup.isOpen, true),
        isNull(tradeGroup.deletedAt),
      )),
  ]);

  const openGroupIds = openGroups.map((group) => group.id);
  const openExecutionRows = openGroupIds.length > 0
    ? await db
        .select({
          groupId: tradeGroupExecution.tradeGroupId,
          multiplier: execution.multiplier,
          totalValue: execution.totalValue,
          quantity: execution.quantity,
          price: execution.price,
        })
        .from(tradeGroupExecution)
        .innerJoin(execution, eq(tradeGroupExecution.executionId, execution.id))
        .where(and(
          inArray(tradeGroupExecution.tradeGroupId, openGroupIds),
          isNull(execution.deletedAt),
        ))
    : [];
  const factorByGroup = new Map<string, number>();
  for (const row of openExecutionRows) {
    if (factorByGroup.has(row.groupId)) continue;
    const denominator = Math.abs(row.quantity) * Math.abs(row.price);
    const derived = denominator > 0 ? Math.abs(row.totalValue) / denominator : 0;
    factorByGroup.set(row.groupId, derived > 0 ? derived : (row.multiplier || 1));
  }

  const transactions = execRows.map((row) => mapExecutionRow(row, account.clientAccountId));

  return {
    accountId: account.clientAccountId,
    currency: account.currency,
    initialBalance: account.initialBalance,
    range,
    summaries: compactSummaries(aggregateByDay(transactions)),
    cashFlows: cashRows.map((row) => ({
      id: row.clientId,
      accountId: account.clientAccountId,
      date: row.date,
      type: row.type as CashFlowRecord['type'],
      amount: row.amount,
      currency: row.currency,
      note: row.note ?? undefined,
      updatedAt: Date.parse(row.updatedAt),
    })),
    holdings: openGroups.map((group) => {
      const multiplier = factorByGroup.get(group.id) ?? 1;
      return {
        symbol: group.symbol,
        companyName: group.companyName,
        quantity: group.netQuantity,
        averageCost: group.openAvgCost,
        totalCost: Math.abs(group.netQuantity) * group.openAvgCost * multiplier,
        multiplier,
        lastUpdate: group.openedDate,
      };
    }),
  };
}

/**
 * All-history day summaries for the journal, computed server-side from the
 * account's executions with the same aggregateByDay used everywhere else — so
 * the journal, dashboard, and calendar are consistent by construction.
 */
export async function getServerJournalSummaries(
  userId: string,
  clientAccountId: string,
): Promise<DailySummary[] | null> {
  const [account] = await db
    .select({ id: tradingAccount.id, clientAccountId: tradingAccount.clientAccountId })
    .from(tradingAccount)
    .where(and(
      eq(tradingAccount.userId, userId),
      eq(tradingAccount.clientAccountId, clientAccountId),
      isNull(tradingAccount.deletedAt),
    ))
    .limit(1);
  if (!account) return null;

  const rows = await db
    .select()
    .from(execution)
    .where(and(
      eq(execution.userId, userId),
      eq(execution.accountId, account.id),
      isNull(execution.deletedAt),
    ));

  const transactions = rows.map((row) => mapExecutionRow(row, account.clientAccountId));
  return compactSummaries(aggregateByDay(transactions));
}

/** Fetch only the raw fills required by the supplemental replay widget. */
export async function getServerDashboardActivity(
  userId: string,
  clientAccountId: string,
  tradingDay: string,
): Promise<TransactionRecord[] | null> {
  const [account] = await db
    .select({ id: tradingAccount.id, clientAccountId: tradingAccount.clientAccountId })
    .from(tradingAccount)
    .where(and(
      eq(tradingAccount.userId, userId),
      eq(tradingAccount.clientAccountId, clientAccountId),
      isNull(tradingAccount.deletedAt),
    ))
    .limit(1);
  if (!account) return null;

  // Match the summaries' per-fill day bucketing (broker TradeDate, else date) so
  // the replay shows exactly the fills that make up that day's P&L.
  const fillDay = sql<string>`coalesce(${execution.tradeDate}, ${execution.date})`;
  const rows = await db
    .select()
    .from(execution)
    .where(and(
      eq(execution.userId, userId),
      eq(execution.accountId, account.id),
      isNull(execution.deletedAt),
      eq(fillDay, tradingDay),
    ));

  return rows.map((row) => mapExecutionRow(row, account.clientAccountId));
}
