import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../db/server';
import {
  tradingAccount,
  execution,
  tradeGroup,
  tradeGroupExecution,
  dailyNote,
  tradeNote,
  tag,
  tradeTag,
  tradeAiReview,
  attachment,
  cashFlow,
  journalEvent,
} from '../db/server/schema';
import type { TransactionRecord } from '../db/schema';
import { splitIntoTradeGroups } from '../trading/trade-groups';
import { tagKey } from '../trading/tags';
import { executionIdempotencyKey } from './execution-key';
import type {
  JournalPushRequest,
  JournalPushResponse,
  JournalPullResponse,
  SyncConflict,
  SyncEntity,
} from './sync-types';

/**
 * Permanently delete all of a user's journal data from the server. Deleting the
 * accounts cascades to executions, trade groups, memberships, daily/trade notes,
 * and reviews (FK onDelete cascade); tags, attachments, and the event log are
 * user-scoped and removed explicitly.
 */
export async function deleteAllJournal(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(tag).where(eq(tag.userId, userId)); // cascades trade_tag
    await tx.delete(attachment).where(eq(attachment.userId, userId));
    await tx.delete(tradingAccount).where(eq(tradingAccount.userId, userId)); // cascades the rest
    await tx.delete(journalEvent).where(eq(journalEvent.userId, userId));
  });
}

/** Map an execution DB row back to the TransactionRecord shape the splitter and
 * clients expect. `accountClientId` is used as `accountId` so the splitter's
 * deterministic keys match the ones the client computed locally. */
function rowToTransaction(
  row: typeof execution.$inferSelect,
  accountClientId: string,
): TransactionRecord {
  return {
    tradeId: row.sourceTradeId,
    accountId: accountClientId,
    symbol: row.symbol,
    companyName: row.companyName,
    exchanges: row.exchanges,
    side: row.side as TransactionRecord['side'],
    orderType: row.orderType,
    date: row.date,
    time: row.time,
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

/**
 * Apply a client push. Executions are inserted idempotently; trade groups are
 * re-derived by the splitter; notes/tags/reviews are upserted with rev-based
 * conflict detection. Returns any conflicts for the client to resolve.
 */
export async function pushJournal(
  userId: string,
  payload: JournalPushRequest,
  onProgress?: (phase: 'executions' | 'trade_groups', done: number, total: number) => void,
): Promise<JournalPushResponse> {
  const PROGRESS_EVERY = 500;
  const conflicts: SyncConflict[] = [];
  let adoptedExecutions = 0;
  const nowIso = new Date().toISOString();

  await db.transaction(async (tx) => {
    const events: { entity: SyncEntity; entityId: string; op: 'upsert' | 'delete'; rev: number }[] = [];

    // ── 1. Accounts → map clientAccountId → { uuid, clientId } ──
    const accountUuidByClientId = new Map<string, string>();
    const clientIdByUuid = new Map<string, string>();
    for (const acc of payload.accounts) {
      const existing = await tx
        .select()
        .from(tradingAccount)
        .where(and(eq(tradingAccount.userId, userId), eq(tradingAccount.clientAccountId, acc.accountId)))
        .limit(1);

      if (existing.length === 0) {
        const [inserted] = await tx
          .insert(tradingAccount)
          .values({
            userId,
            clientAccountId: acc.accountId,
            name: acc.name,
            type: acc.type,
            currency: acc.currency,
            address: acc.address ?? '',
            initialBalance: acc.initialBalance,
            importedAt: acc.importedAt ? new Date(acc.importedAt).toISOString() : null,
            updatedAt: nowIso,
          })
          .returning({ id: tradingAccount.id, rev: tradingAccount.rev });
        accountUuidByClientId.set(acc.accountId, inserted.id);
        clientIdByUuid.set(inserted.id, acc.accountId);
        events.push({ entity: 'account', entityId: inserted.id, op: 'upsert', rev: inserted.rev });
      } else {
        accountUuidByClientId.set(acc.accountId, existing[0].id);
        clientIdByUuid.set(existing[0].id, acc.accountId);
        // Account metadata rarely changes; update in place, bump rev.
        const nextRev = existing[0].rev + 1;
        await tx
          .update(tradingAccount)
          .set({
            name: acc.name,
            type: acc.type,
            currency: acc.currency,
            address: acc.address ?? '',
            initialBalance: acc.initialBalance,
            rev: nextRev,
            updatedAt: nowIso,
          })
          .where(eq(tradingAccount.id, existing[0].id));
        events.push({ entity: 'account', entityId: existing[0].id, op: 'upsert', rev: nextRev });
      }
    }

    // ── 2. Executions — idempotent insert ──
    const executionTotal = payload.executions.length;
    let executionsSeen = 0;
    for (const t of payload.executions) {
      executionsSeen += 1;
      if (executionsSeen % PROGRESS_EVERY === 0 || executionsSeen === executionTotal) {
        onProgress?.('executions', executionsSeen, executionTotal);
      }
      const accountUuid = accountUuidByClientId.get(t.accountId);
      if (!accountUuid) continue; // execution for an unknown account — skip
      const key = executionIdempotencyKey(t);
      const inserted = await tx
        .insert(execution)
        .values({
          userId,
          accountId: accountUuid,
          idempotencyKey: key,
          sourceTradeId: t.tradeId,
          symbol: t.symbol,
          companyName: t.companyName ?? '',
          exchanges: t.exchanges ?? '',
          side: t.side,
          orderType: t.orderType ?? '',
          date: t.date,
          time: t.time,
          currency: t.currency,
          quantity: t.quantity,
          multiplier: t.multiplier ?? 1,
          price: t.price,
          totalValue: t.totalValue,
          commission: t.commission ?? 0,
          feeMultiplier: t.feeMultiplier ?? 1,
          realizedPnL: t.realizedPnL,
          unrealizedPnL: t.unrealizedPnL,
          fxRateToAccount: t.fxRateToAccount,
          fxAccountCurrency: t.fxAccountCurrency,
          fxRateDate: t.fxRateDate,
          fxRateProvider: t.fxRateProvider,
          updatedAt: nowIso,
        })
        .onConflictDoNothing({ target: [execution.userId, execution.idempotencyKey] })
        .returning({ id: execution.id, rev: execution.rev });
      if (inserted.length > 0) {
        adoptedExecutions += 1;
        events.push({ entity: 'execution', entityId: inserted[0].id, op: 'upsert', rev: inserted[0].rev });
      }
    }

    // Resolve client ids for every account the user owns (not only those in this
    // push), so executions from earlier pushes still map for the splitter.
    const accountRows = await tx.select().from(tradingAccount).where(eq(tradingAccount.userId, userId));
    for (const a of accountRows) clientIdByUuid.set(a.id, a.clientAccountId);

    // ── Reconcile deletes ──
    // When the client sends an authoritative snapshot (reconcile), tombstone any
    // account/execution/daily-note the user owns that is absent from it, so local
    // deletes propagate. Skipped for an empty snapshot as a wipe guard.
    const doReconcile =
      payload.reconcile === true &&
      (payload.accounts.length > 0 || payload.executions.length > 0);
    const deletedExecutionIds = new Set<string>();
    if (doReconcile) {
      const pushedAccountKeys = new Set(payload.accounts.map((a) => a.accountId));
      for (const a of accountRows) {
        if (a.deletedAt) continue;
        if (!pushedAccountKeys.has(a.clientAccountId)) {
          const nextRev = a.rev + 1;
          await tx.update(tradingAccount).set({ deletedAt: nowIso, rev: nextRev }).where(eq(tradingAccount.id, a.id));
          events.push({ entity: 'account', entityId: a.id, op: 'delete', rev: nextRev });
        }
      }
    }

    const allExecutions = await tx.select().from(execution).where(eq(execution.userId, userId));

    if (doReconcile) {
      const pushedExecKeys = new Set(payload.executions.map((t) => executionIdempotencyKey(t)));
      for (const row of allExecutions) {
        if (row.deletedAt) continue;
        if (!pushedExecKeys.has(row.idempotencyKey)) {
          const nextRev = row.rev + 1;
          await tx.update(execution).set({ deletedAt: nowIso, rev: nextRev }).where(eq(execution.id, row.id));
          deletedExecutionIds.add(row.id);
          events.push({ entity: 'execution', entityId: row.id, op: 'delete', rev: nextRev });
        }
      }
    }

    // ── 3. Re-derive trade groups from the remaining (non-deleted) executions ──
    const execIdByIdemKey = new Map<string, string>();
    const transactions: TransactionRecord[] = [];
    for (const row of allExecutions) {
      if (row.deletedAt || deletedExecutionIds.has(row.id)) continue;
      const clientId = clientIdByUuid.get(row.accountId);
      if (!clientId) continue;
      execIdByIdemKey.set(row.idempotencyKey, row.id);
      transactions.push(rowToTransaction(row, clientId));
    }

    const groups = splitIntoTradeGroups(transactions);
    const groupUuidByClientKey = new Map<string, string>();

    let groupsSeen = 0;
    for (const g of groups) {
      groupsSeen += 1;
      if (groupsSeen % PROGRESS_EVERY === 0 || groupsSeen === groups.length) {
        onProgress?.('trade_groups', groupsSeen, groups.length);
      }
      const accountUuid = accountUuidByClientId.get(g.accountId)
        ?? accountRows.find((a) => a.clientAccountId === g.accountId)?.id;
      if (!accountUuid) continue;

      const existing = await tx
        .select({ id: tradeGroup.id })
        .from(tradeGroup)
        .where(and(eq(tradeGroup.userId, userId), eq(tradeGroup.clientKey, g.key)))
        .limit(1);

      const values = {
        userId,
        accountId: accountUuid,
        clientKey: g.key,
        symbol: g.symbol,
        companyName: g.companyName,
        currency: g.currency,
        accountCurrency: g.accountCurrency,
        side: g.side,
        openedDate: g.openedDate,
        openedTime: g.openedTime,
        closedDate: g.closedDate ?? null,
        closedTime: g.closedTime ?? null,
        tradingDay: g.tradingDay,
        entryAvgPrice: g.entryAvgPrice,
        exitAvgPrice: g.exitAvgPrice,
        maxPosition: g.maxPosition,
        volume: g.volume,
        grossPnL: g.grossPnL,
        totalCommissions: g.totalCommissions,
        netPnL: g.netPnL,
        nativeGrossPnL: g.nativeGrossPnL,
        nativeTotalCommissions: g.nativeTotalCommissions,
        nativeNetPnL: g.nativeNetPnL,
        isOpen: g.isOpen,
        netQuantity: g.netQuantity,
        openAvgCost: g.openAvgCost,
        fxRateToAccount: g.fxRateToAccount,
        fxRateDate: g.fxRateDate,
        updatedAt: nowIso,
      };

      let groupId: string;
      if (existing.length === 0) {
        const [ins] = await tx.insert(tradeGroup).values(values).returning({ id: tradeGroup.id, rev: tradeGroup.rev });
        groupId = ins.id;
        events.push({ entity: 'trade_group', entityId: groupId, op: 'upsert', rev: ins.rev });
      } else {
        groupId = existing[0].id;
        await tx.update(tradeGroup).set(values).where(eq(tradeGroup.id, groupId));
      }
      groupUuidByClientKey.set(g.key, groupId);

      // Rebuild membership joins for this group.
      await tx.delete(tradeGroupExecution).where(eq(tradeGroupExecution.tradeGroupId, groupId));
      for (const leg of g.legs) {
        const execId = execIdByIdemKey.get(executionIdempotencyKey(leg.transaction));
        if (!execId) continue;
        await tx.insert(tradeGroupExecution).values({
          tradeGroupId: groupId,
          executionId: execId,
          role: leg.role,
          sliceQuantity: leg.quantity,
        }).onConflictDoNothing();
      }
    }

    // ── 4. Daily notes (rev-checked) ──
    for (const n of payload.dailyNotes) {
      const accountUuid = accountUuidByClientId.get(n.accountId)
        ?? accountRows.find((a) => a.clientAccountId === n.accountId)?.id;
      if (!accountUuid) continue;
      const existing = await tx
        .select()
        .from(dailyNote)
        .where(and(eq(dailyNote.userId, userId), eq(dailyNote.accountId, accountUuid), eq(dailyNote.tradingDay, n.tradingDay)))
        .limit(1);
      if (existing.length === 0) {
        const [ins] = await tx.insert(dailyNote).values({
          userId, accountId: accountUuid, tradingDay: n.tradingDay, content: n.content, updatedAt: nowIso,
        }).returning({ id: dailyNote.id, rev: dailyNote.rev });
        events.push({ entity: 'daily_note', entityId: ins.id, op: 'upsert', rev: ins.rev });
      } else if (existing[0].rev > n.baseRev) {
        conflicts.push({ entity: 'daily_note', clientKey: `${n.accountId}:${n.tradingDay}`, serverRev: existing[0].rev, serverValue: existing[0] });
      } else {
        const nextRev = existing[0].rev + 1;
        await tx.update(dailyNote).set({ content: n.content, rev: nextRev, deletedAt: null, updatedAt: nowIso }).where(eq(dailyNote.id, existing[0].id));
        events.push({ entity: 'daily_note', entityId: existing[0].id, op: 'upsert', rev: nextRev });
      }
    }

    // Reconcile daily-note deletes against the authoritative snapshot.
    if (doReconcile) {
      const pushedDailyKeys = new Set(payload.dailyNotes.map((n) => `${n.accountId}:${n.tradingDay}`));
      const dailyRows = await tx.select().from(dailyNote).where(eq(dailyNote.userId, userId));
      for (const n of dailyRows) {
        if (n.deletedAt) continue;
        const clientId = clientIdByUuid.get(n.accountId);
        if (!clientId) continue;
        if (!pushedDailyKeys.has(`${clientId}:${n.tradingDay}`)) {
          const nextRev = n.rev + 1;
          await tx.update(dailyNote).set({ deletedAt: nowIso, rev: nextRev }).where(eq(dailyNote.id, n.id));
          events.push({ entity: 'daily_note', entityId: n.id, op: 'delete', rev: nextRev });
        }
      }
    }

    // ── Cash flows (last-write-wins), keyed by client id ──
    for (const c of payload.cashFlows) {
      const accountUuid = accountUuidByClientId.get(c.accountId)
        ?? accountRows.find((a) => a.clientAccountId === c.accountId)?.id;
      if (!accountUuid) continue;
      const existing = await tx
        .select({ id: cashFlow.id, rev: cashFlow.rev })
        .from(cashFlow)
        .where(and(eq(cashFlow.userId, userId), eq(cashFlow.clientId, c.clientId)))
        .limit(1);
      const values = {
        accountId: accountUuid, date: c.date, type: c.type, amount: c.amount,
        currency: c.currency, note: c.note ?? null, updatedAt: nowIso,
      };
      if (existing.length === 0) {
        const [ins] = await tx.insert(cashFlow).values({
          userId, clientId: c.clientId, ...values,
        }).returning({ id: cashFlow.id, rev: cashFlow.rev });
        events.push({ entity: 'cash_flow', entityId: ins.id, op: 'upsert', rev: ins.rev });
      } else if (existing[0].rev <= c.baseRev) {
        const nextRev = existing[0].rev + 1;
        await tx.update(cashFlow).set({ ...values, rev: nextRev, deletedAt: null }).where(eq(cashFlow.id, existing[0].id));
        events.push({ entity: 'cash_flow', entityId: existing[0].id, op: 'upsert', rev: nextRev });
      }
    }

    // Reconcile cash-flow deletes against the authoritative snapshot.
    if (doReconcile) {
      const pushedCashIds = new Set(payload.cashFlows.map((c) => c.clientId));
      const rows = await tx.select().from(cashFlow).where(eq(cashFlow.userId, userId));
      for (const r of rows) {
        if (r.deletedAt) continue;
        if (!pushedCashIds.has(r.clientId)) {
          const nextRev = r.rev + 1;
          await tx.update(cashFlow).set({ deletedAt: nowIso, rev: nextRev }).where(eq(cashFlow.id, r.id));
          events.push({ entity: 'cash_flow', entityId: r.id, op: 'delete', rev: nextRev });
        }
      }
    }

    // ── 5. Tags (rev-checked), keyed by (category,label) identity ──
    const tagUuidByClientId = new Map<string, string>();
    for (const tg of payload.tags) {
      const existing = await tx
        .select()
        .from(tag)
        .where(and(eq(tag.userId, userId), eq(tag.category, tg.category), eq(tag.label, tg.label)))
        .limit(1);
      if (existing.length === 0) {
        const [ins] = await tx.insert(tag).values({
          userId, label: tg.label, category: tg.category, color: tg.color,
          archivedAt: tg.archived ? nowIso : null, updatedAt: nowIso,
        }).returning({ id: tag.id, rev: tag.rev });
        tagUuidByClientId.set(tg.clientId, ins.id);
        events.push({ entity: 'tag', entityId: ins.id, op: 'upsert', rev: ins.rev });
      } else {
        tagUuidByClientId.set(tg.clientId, existing[0].id);
        if (existing[0].rev <= tg.baseRev) {
          const nextRev = existing[0].rev + 1;
          await tx.update(tag).set({
            color: tg.color, archivedAt: tg.archived ? nowIso : null, rev: nextRev, deletedAt: null, updatedAt: nowIso,
          }).where(eq(tag.id, existing[0].id));
          events.push({ entity: 'tag', entityId: existing[0].id, op: 'upsert', rev: nextRev });
        }
      }
    }

    // ── 6. Trade notes (rev-checked), resolved to trade_group uuid ──
    for (const n of payload.tradeNotes) {
      const groupId = groupUuidByClientKey.get(n.tradeGroupClientKey);
      if (!groupId) continue; // no such trade (yet) — skip; client retries after next split
      const existing = await tx
        .select()
        .from(tradeNote)
        .where(and(eq(tradeNote.userId, userId), eq(tradeNote.tradeGroupId, groupId)))
        .limit(1);
      if (existing.length === 0) {
        const [ins] = await tx.insert(tradeNote).values({
          userId, tradeGroupId: groupId, content: n.content, updatedAt: nowIso,
        }).returning({ id: tradeNote.id, rev: tradeNote.rev });
        events.push({ entity: 'trade_note', entityId: ins.id, op: 'upsert', rev: ins.rev });
      } else if (existing[0].rev > n.baseRev) {
        conflicts.push({ entity: 'trade_note', clientKey: n.tradeGroupClientKey, serverRev: existing[0].rev, serverValue: existing[0] });
      } else {
        const nextRev = existing[0].rev + 1;
        await tx.update(tradeNote).set({ content: n.content, rev: nextRev, deletedAt: null, updatedAt: nowIso }).where(eq(tradeNote.id, existing[0].id));
        events.push({ entity: 'trade_note', entityId: existing[0].id, op: 'upsert', rev: nextRev });
      }
    }

    // ── 7. Trade↔tag joins ──
    // On an authoritative snapshot, reset the current groups' joins so tag
    // removals (and emptied trades) propagate, not just additions.
    if (doReconcile) {
      const groupIds = [...groupUuidByClientKey.values()];
      if (groupIds.length > 0) {
        await tx.delete(tradeTag).where(inArray(tradeTag.tradeGroupId, groupIds));
      }
    }
    for (const tt of payload.tradeTags) {
      const groupId = groupUuidByClientKey.get(tt.tradeGroupClientKey);
      const tagId = tagUuidByClientId.get(tt.tagClientId);
      if (!groupId || !tagId) continue;
      await tx.insert(tradeTag).values({ tradeGroupId: groupId, tagId }).onConflictDoNothing();
    }

    // ── 8. AI reviews ──
    for (const r of payload.reviews) {
      const groupId = groupUuidByClientKey.get(r.tradeGroupClientKey);
      if (!groupId) continue;
      const existing = await tx
        .select({ id: tradeAiReview.id, rev: tradeAiReview.rev })
        .from(tradeAiReview)
        .where(and(eq(tradeAiReview.userId, userId), eq(tradeAiReview.tradeGroupId, groupId)))
        .limit(1);
      const values = {
        userId, tradeGroupId: groupId, summary: r.summary,
        observations: r.observations, executionReview: r.executionReview,
        riskReview: r.riskReview, questionsForTrader: r.questionsForTrader,
        takeaway: r.takeaway, evidenceConfidence: r.evidenceConfidence,
        provider: r.provider, model: r.model, promptVersion: r.promptVersion,
        contextHash: r.contextHash, updatedAt: nowIso,
      };
      if (existing.length === 0) {
        const [ins] = await tx.insert(tradeAiReview).values(values).returning({ id: tradeAiReview.id, rev: tradeAiReview.rev });
        events.push({ entity: 'review', entityId: ins.id, op: 'upsert', rev: ins.rev });
      } else if (existing[0].rev <= r.baseRev) {
        const nextRev = existing[0].rev + 1;
        await tx.update(tradeAiReview).set({ ...values, rev: nextRev }).where(eq(tradeAiReview.id, existing[0].id));
        events.push({ entity: 'review', entityId: existing[0].id, op: 'upsert', rev: nextRev });
      }
    }

    // ── 9. Deletes (tombstones) ──
    for (const d of payload.deletes) {
      if (d.entity === 'daily_note') {
        const [aid, day] = d.clientKey.split(':');
        const accountUuid = accountRows.find((a) => a.clientAccountId === aid)?.id;
        if (!accountUuid) continue;
        const [row] = await tx.select().from(dailyNote)
          .where(and(eq(dailyNote.userId, userId), eq(dailyNote.accountId, accountUuid), eq(dailyNote.tradingDay, day))).limit(1);
        if (row && row.rev <= d.baseRev) {
          const nextRev = row.rev + 1;
          await tx.update(dailyNote).set({ deletedAt: nowIso, rev: nextRev }).where(eq(dailyNote.id, row.id));
          events.push({ entity: 'daily_note', entityId: row.id, op: 'delete', rev: nextRev });
        }
      } else if (d.entity === 'trade_note') {
        const [row] = await tx.select({ id: tradeNote.id, rev: tradeNote.rev, groupKey: tradeGroup.clientKey })
          .from(tradeNote).innerJoin(tradeGroup, eq(tradeNote.tradeGroupId, tradeGroup.id))
          .where(and(eq(tradeNote.userId, userId), eq(tradeGroup.clientKey, d.clientKey))).limit(1);
        if (row && row.rev <= d.baseRev) {
          const nextRev = row.rev + 1;
          await tx.update(tradeNote).set({ deletedAt: nowIso, rev: nextRev }).where(eq(tradeNote.id, row.id));
          events.push({ entity: 'trade_note', entityId: row.id, op: 'delete', rev: nextRev });
        }
      }
      // account/execution deletes are intentionally omitted from v1 client deletes.
    }

    // ── 10. Emit change events ──
    // Insert in batches: a single multi-row insert of tens of thousands of rows
    // (a full-history import) overflows the SQL query builder's recursion.
    const EVENT_INSERT_CHUNK = 1_000;
    for (let i = 0; i < events.length; i += EVENT_INSERT_CHUNK) {
      const batch = events.slice(i, i + EVENT_INSERT_CHUNK);
      await tx.insert(journalEvent).values(batch.map((e) => ({
        userId, entity: e.entity, entityId: e.entityId, op: e.op, rev: e.rev, createdAt: nowIso,
      })));
    }
  });

  const [{ seq } = { seq: 0 }] = await db
    .select({ seq: journalEvent.seq })
    .from(journalEvent)
    .where(eq(journalEvent.userId, userId))
    .orderBy(desc(journalEvent.seq))
    .limit(1);

  return { authenticated: true, seq: seq ?? 0, conflicts, adoptedExecutions };
}

/**
 * Return the journal for a user. `since=0` yields a full snapshot; a later cursor
 * yields only rows changed after it (including tombstones).
 */
export async function pullJournal(userId: string, since: number): Promise<JournalPullResponse> {
  const accountRows = await db.select().from(tradingAccount).where(eq(tradingAccount.userId, userId));
  const clientIdByUuid = new Map<string, string>();
  for (const a of accountRows) clientIdByUuid.set(a.id, a.clientAccountId);

  // For a delta pull, restrict to entities changed after the cursor.
  const changed = since > 0
    ? await db.select().from(journalEvent).where(and(eq(journalEvent.userId, userId), gt(journalEvent.seq, since)))
    : null;
  const changedIds = (entity: SyncEntity) =>
    changed ? new Set(changed.filter((e) => e.entity === entity).map((e) => e.entityId)) : null;

  const inChanged = <T extends { id: string; deletedAt: string | null }>(rows: T[], entity: SyncEntity) => {
    const ids = changedIds(entity);
    const filtered = ids ? rows.filter((r) => ids.has(r.id)) : rows.filter((r) => !r.deletedAt);
    return {
      upserts: filtered.filter((r) => !r.deletedAt),
      deletes: filtered.filter((r) => !!r.deletedAt),
    };
  };

  const execRows = await db.select().from(execution).where(eq(execution.userId, userId));
  const cashRows = await db.select().from(cashFlow).where(eq(cashFlow.userId, userId));
  const groupRows = await db.select().from(tradeGroup).where(eq(tradeGroup.userId, userId));
  const groupKeyByUuid = new Map(groupRows.map((g) => [g.id, g.clientKey]));
  const dailyRows = await db.select().from(dailyNote).where(eq(dailyNote.userId, userId));
  const tradeNoteRows = await db.select().from(tradeNote).where(eq(tradeNote.userId, userId));
  const tagRows = await db.select().from(tag).where(eq(tag.userId, userId));
  const reviewRows = await db.select().from(tradeAiReview).where(eq(tradeAiReview.userId, userId));
  const tradeTagRows = await db
    .select({ groupId: tradeTag.tradeGroupId, category: tag.category, label: tag.label })
    .from(tradeTag)
    .innerJoin(tradeGroup, eq(tradeTag.tradeGroupId, tradeGroup.id))
    .innerJoin(tag, eq(tradeTag.tagId, tag.id))
    .where(eq(tradeGroup.userId, userId));

  const accountsPart = inChanged(accountRows, 'account');
  const cashPart = inChanged(cashRows, 'cash_flow');
  const dailyPart = inChanged(dailyRows, 'daily_note');
  const tradeNotePart = inChanged(tradeNoteRows, 'trade_note');
  const tagPart = inChanged(tagRows, 'tag');
  const reviewPart = inChanged(reviewRows, 'review');

  // Execution tombstones only flow on delta pulls (a fresh device has nothing to
  // delete). The client removes local transactions by their tradeId (sourceTradeId).
  const execChangedIds = changedIds('execution');
  const execDeletes = execChangedIds
    ? execRows.filter((r) => r.deletedAt && execChangedIds.has(r.id))
    : [];

  const deletes: JournalPullResponse['deletes'] = [
    ...accountsPart.deletes.map((a) => ({ entity: 'account' as const, clientKey: a.clientAccountId, baseRev: a.rev })),
    ...execDeletes.map((r) => ({ entity: 'execution' as const, clientKey: r.sourceTradeId, baseRev: r.rev })),
    ...cashPart.deletes.map((c) => ({ entity: 'cash_flow' as const, clientKey: c.clientId, baseRev: c.rev })),
    ...dailyPart.deletes.map((n) => ({ entity: 'daily_note' as const, clientKey: `${clientIdByUuid.get(n.accountId)}:${n.tradingDay}`, baseRev: n.rev })),
    ...tradeNotePart.deletes.map((n) => ({ entity: 'trade_note' as const, clientKey: groupKeyByUuid.get(n.tradeGroupId) ?? '', baseRev: n.rev })),
    ...tagPart.deletes.map((t) => ({ entity: 'tag' as const, clientKey: tagKey(t.category, t.label), baseRev: t.rev })),
  ];

  return {
    authenticated: true,
    seq: changed && changed.length ? Math.max(...changed.map((e) => e.seq)) : since,
    accounts: accountsPart.upserts.map((a) => ({
      accountId: a.clientAccountId, name: a.name, type: a.type, currency: a.currency,
      address: a.address, importedAt: a.importedAt ? Date.parse(a.importedAt) : 0,
      initialBalance: a.initialBalance ?? undefined, rev: a.rev,
    })),
    executions: execRows.filter((r) => !r.deletedAt).map((r) => rowToTransaction(r, clientIdByUuid.get(r.accountId) ?? r.accountId)),
    cashFlows: cashPart.upserts.map((c) => ({
      clientId: c.clientId,
      accountId: clientIdByUuid.get(c.accountId) ?? c.accountId,
      date: c.date, type: c.type, amount: c.amount, currency: c.currency,
      note: c.note ?? undefined, updatedAt: Date.parse(c.updatedAt), baseRev: c.rev, rev: c.rev,
    })),
    dailyNotes: dailyPart.upserts.map((n) => ({
      accountId: clientIdByUuid.get(n.accountId) ?? n.accountId, date: n.tradingDay, content: n.content,
      updatedAt: Date.parse(n.updatedAt), rev: n.rev,
    })),
    tradeNotes: tradeNotePart.upserts.map((n) => ({
      tradeGroupClientKey: groupKeyByUuid.get(n.tradeGroupId) ?? '',
      // date/symbol/accountId are denormalized on the client from the trade group.
      tradeGroupKey: groupKeyByUuid.get(n.tradeGroupId) ?? '',
      date: '', symbol: '', accountId: '', content: n.content, tags: [],
      updatedAt: Date.parse(n.updatedAt), rev: n.rev,
    })),
    tags: tagPart.upserts.map((t) => ({
      clientId: tagKey(t.category, t.label), label: t.label, category: t.category, color: t.color ?? undefined,
      archived: !!t.archivedAt, updatedAt: Date.parse(t.updatedAt), baseRev: t.rev, rev: t.rev,
    })),
    tradeTags: tradeTagRows.map((tt) => ({
      tradeGroupClientKey: groupKeyByUuid.get(tt.groupId) ?? '',
      tagClientId: tagKey(tt.category, tt.label),
    })),
    reviews: reviewPart.upserts.map((r) => ({
      id: r.id, date: '', symbol: '', accountId: '', tradeGroupClientKey: groupKeyByUuid.get(r.tradeGroupId) ?? '',
      summary: r.summary, observations: r.observations as never, executionReview: r.executionReview ?? undefined,
      riskReview: r.riskReview ?? undefined, questionsForTrader: (r.questionsForTrader as string[] | null) ?? undefined,
      takeaway: r.takeaway ?? undefined, evidenceConfidence: r.evidenceConfidence as 'low' | 'medium' | 'high',
      provider: r.provider, model: r.model, promptVersion: r.promptVersion, contextHash: r.contextHash,
      createdAt: Date.parse(r.createdAt), baseRev: r.rev, rev: r.rev,
    })),
    deletes,
  };
}
