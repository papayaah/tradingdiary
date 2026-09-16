import { and, asc, eq, gte, inArray, isNull, lte, max } from 'drizzle-orm';
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
import {
  buildDashboardDaySummaries,
  type DashboardTradeGroupRow,
} from './dashboard-summaries';
import type { DailySummary } from './aggregator';

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

  const [latest] = await db
    .select({ tradingDay: max(tradeGroup.tradingDay) })
    .from(tradeGroup)
    .where(and(
      eq(tradeGroup.userId, userId),
      eq(tradeGroup.accountId, account.id),
      isNull(tradeGroup.deletedAt),
    ));

  const range = resolveDashboardDateRange(
    request.rangeType,
    latest?.tradingDay ?? undefined,
    request.startDate,
    request.endDate,
  );
  const groupConditions = [
    eq(tradeGroup.userId, userId),
    eq(tradeGroup.accountId, account.id),
    isNull(tradeGroup.deletedAt),
  ];
  if (range.start) groupConditions.push(gte(tradeGroup.tradingDay, range.start));
  if (range.end) groupConditions.push(lte(tradeGroup.tradingDay, range.end));

  const cashConditions = [
    eq(cashFlow.userId, userId),
    eq(cashFlow.accountId, account.id),
    isNull(cashFlow.deletedAt),
  ];
  if (range.start) cashConditions.push(gte(cashFlow.date, range.start));
  if (range.end) cashConditions.push(lte(cashFlow.date, range.end));

  const [groups, cashRows, openGroups] = await Promise.all([
    db
      .select({
        clientKey: tradeGroup.clientKey,
        symbol: tradeGroup.symbol,
        companyName: tradeGroup.companyName,
        currency: tradeGroup.currency,
        accountCurrency: tradeGroup.accountCurrency,
        side: tradeGroup.side,
        openedDate: tradeGroup.openedDate,
        openedTime: tradeGroup.openedTime,
        closedDate: tradeGroup.closedDate,
        closedTime: tradeGroup.closedTime,
        tradingDay: tradeGroup.tradingDay,
        volume: tradeGroup.volume,
        grossPnL: tradeGroup.grossPnL,
        totalCommissions: tradeGroup.totalCommissions,
        netPnL: tradeGroup.netPnL,
        nativeGrossPnL: tradeGroup.nativeGrossPnL,
        nativeTotalCommissions: tradeGroup.nativeTotalCommissions,
        nativeNetPnL: tradeGroup.nativeNetPnL,
        isOpen: tradeGroup.isOpen,
        netQuantity: tradeGroup.netQuantity,
        openAvgCost: tradeGroup.openAvgCost,
        fxRateToAccount: tradeGroup.fxRateToAccount,
        fxRateDate: tradeGroup.fxRateDate,
      })
      .from(tradeGroup)
      .where(and(...groupConditions))
      .orderBy(asc(tradeGroup.tradingDay), asc(tradeGroup.openedTime)),
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

  return {
    accountId: account.clientAccountId,
    currency: account.currency,
    initialBalance: account.initialBalance,
    range,
    summaries: buildDashboardDaySummaries(groups satisfies DashboardTradeGroupRow[]),
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

  const rows = await db
    .select()
    .from(execution)
    .innerJoin(tradeGroupExecution, eq(execution.id, tradeGroupExecution.executionId))
    .innerJoin(tradeGroup, eq(tradeGroupExecution.tradeGroupId, tradeGroup.id))
    .where(and(
      eq(execution.userId, userId),
      eq(execution.accountId, account.id),
      isNull(execution.deletedAt),
      eq(tradeGroup.tradingDay, tradingDay),
      isNull(tradeGroup.deletedAt),
    ));

  const unique = new Map<string, typeof execution.$inferSelect>();
  for (const joined of rows) unique.set(joined.execution.id, joined.execution);
  return [...unique.values()].map((row) => ({
    tradeId: row.sourceTradeId,
    accountId: account.clientAccountId,
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
  }));
}
