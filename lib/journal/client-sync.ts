import { getDB } from '../db/database';
import type { AccountRecord, CashFlowRecord } from '../db/schema';
import { getAccounts, getAllTransactions } from '../db/trades';
import { getAllDailyNotes, getAllTradeNotes } from '../db/notes';
import { getAllCashFlows } from '../db/cash-flows';
import { getAllTags } from '../db/tags';
import type { JournalPushRequest, JournalPullResponse } from './sync-types';

/**
 * Client sync engine (v1). Executions, accounts, and daily notes sync across
 * devices for a signed-in user. Executions are immutable and idempotent, so
 * cross-device merge can never duplicate them. Daily notes use last-write-wins
 * for now (see baseRev below). Trade notes/tags/reviews are not yet synced —
 * they wait on the journal UI adopting the flat-to-flat trade_group identity.
 *
 * See docs/specs/journal-persistence-and-sync.md.
 */

const CURSOR_PREFIX = 'journal-sync-cursor:';

export function getCursor(userId: string): number {
  if (typeof window === 'undefined') return 0;
  const raw = localStorage.getItem(CURSOR_PREFIX + userId);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setCursor(userId: string, seq: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CURSOR_PREFIX + userId, String(seq));
}

export interface PushResult {
  authenticated: boolean;
  adopted: number;
  conflicts: number;
  seq: number;
}

/**
 * Push the full local journal snapshot. Idempotent on the server. When
 * `reconcile` is true the server also tombstones its rows that are absent from
 * this snapshot (propagating local deletes) — the caller passes true only after
 * an initial pull has run this session, so a fresh device cannot wipe the server.
 */
export async function pushJournalSnapshot(reconcile: boolean): Promise<PushResult> {
  const [accounts, executions, cashFlowsRaw, dailyNotesRaw, tradeNotesRaw, tagsRaw] = await Promise.all([
    getAccounts(),
    getAllTransactions(),
    getAllCashFlows(),
    getAllDailyNotes(),
    getAllTradeNotes(),
    getAllTags(),
  ]);

  const body: JournalPushRequest = {
    accounts,
    executions,
    cashFlows: cashFlowsRaw.map((c) => ({
      clientId: c.id,
      accountId: c.accountId,
      date: c.date,
      type: c.type,
      amount: c.amount,
      currency: c.currency,
      note: c.note,
      updatedAt: c.updatedAt ?? 0,
      baseRev: Number.MAX_SAFE_INTEGER,
    })),
    dailyNotes: dailyNotesRaw.map((n) => ({
      accountId: n.accountId,
      tradingDay: n.date,
      content: n.content,
      updatedAt: n.updatedAt ?? 0,
      // v1: last-write-wins. Proper rev tracking + conflict UI is a follow-up.
      baseRev: Number.MAX_SAFE_INTEGER,
    })),
    // Notes with a real trade-group key sync; legacy fallback keys
    // (date:symbol:account) won't match a server trade group and are skipped
    // server-side. Empty content = deletion, still sent so it can clear.
    tradeNotes: tradeNotesRaw
      .filter((n) => n.tradeGroupKey.includes(' '))
      .map((n) => ({
        tradeGroupClientKey: n.tradeGroupKey,
        content: n.content,
        updatedAt: n.updatedAt ?? 0,
        baseRev: Number.MAX_SAFE_INTEGER,
      })),
    tags: tagsRaw.map((t) => ({
      clientId: t.id,
      label: t.label,
      category: t.category,
      color: t.color,
      archived: !!t.archivedAt,
      updatedAt: t.updatedAt ?? 0,
      baseRev: Number.MAX_SAFE_INTEGER,
    })),
    tradeTags: tradeNotesRaw.flatMap((n) =>
      (n.tagIds ?? []).map((tagClientId) => ({
        tradeGroupClientKey: n.tradeGroupKey,
        tagClientId,
      })),
    ),
    reviews: [],
    deletes: [],
    reconcile,
  };

  const res = await fetch('/api/journal/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`journal push failed: ${res.status}`);
  const data = await res.json();
  if (!data.authenticated) return { authenticated: false, adopted: 0, conflicts: 0, seq: 0 };
  return {
    authenticated: true,
    adopted: data.adoptedExecutions ?? 0,
    conflicts: Array.isArray(data.conflicts) ? data.conflicts.length : 0,
    seq: data.seq ?? 0,
  };
}

export interface PullResult {
  authenticated: boolean;
  changed: boolean;
  seq: number;
}

/** Pull server changes since `cursor` and merge them into IndexedDB. */
export async function pullAndMerge(cursor: number): Promise<PullResult> {
  const res = await fetch(`/api/journal/sync?since=${cursor}`);
  if (!res.ok) throw new Error(`journal pull failed: ${res.status}`);
  const data = (await res.json()) as JournalPullResponse & { authenticated: boolean };
  if (!data.authenticated) return { authenticated: false, changed: false, seq: cursor };

  const db = await getDB();

  for (const a of data.accounts) {
    const account: AccountRecord = {
      accountId: a.accountId,
      name: a.name,
      type: a.type,
      currency: a.currency,
      address: a.address,
      importedAt: a.importedAt,
      initialBalance: a.initialBalance,
    };
    await db.put('accounts', account);
  }

  for (const t of data.executions) {
    await db.put('transactions', t);
  }

  for (const c of data.cashFlows) {
    await db.put('cashFlows', {
      id: c.clientId,
      accountId: c.accountId,
      date: c.date,
      type: c.type as CashFlowRecord['type'],
      amount: c.amount,
      currency: c.currency,
      note: c.note,
      updatedAt: c.updatedAt,
    });
  }

  for (const t of data.tags) {
    await db.put('tags', {
      id: t.clientId,
      label: t.label,
      category: t.category,
      color: t.color,
      archivedAt: t.archived ? (t.updatedAt || Date.now()) : undefined,
      updatedAt: t.updatedAt,
    });
  }

  for (const n of data.dailyNotes) {
    const existing = await db.get('dailyNotes', [n.date, n.accountId]);
    await db.put('dailyNotes', {
      date: n.date,
      accountId: n.accountId,
      content: n.content,
      screenshotIds: existing?.screenshotIds,
      updatedAt: n.updatedAt,
    });
  }

  for (const n of data.tradeNotes) {
    const key = n.tradeGroupClientKey;
    if (!key) continue;
    const existing = await db.get('tradeNotes', key);
    // The trade-group key is "accountId symbol openedDate openedTime seq" —
    // derive display/search fields from it when we have no local record.
    const [acctId, sym, dt] = key.split(' ');
    await db.put('tradeNotes', {
      tradeGroupKey: key,
      date: existing?.date ?? dt ?? '',
      symbol: existing?.symbol ?? sym ?? '',
      accountId: existing?.accountId ?? acctId ?? '',
      content: n.content,
      tags: existing?.tags ?? [],
      tagIds: existing?.tagIds,
      screenshotIds: existing?.screenshotIds,
      updatedAt: n.updatedAt ?? existing?.updatedAt ?? 0,
    });
  }

  // Apply trade↔tag links to each trade's note (last-write-wins from the server).
  if (data.tradeTags.length > 0) {
    const byGroup = new Map<string, string[]>();
    for (const tt of data.tradeTags) {
      if (!tt.tradeGroupClientKey) continue;
      const arr = byGroup.get(tt.tradeGroupClientKey) ?? [];
      arr.push(tt.tagClientId);
      byGroup.set(tt.tradeGroupClientKey, arr);
    }
    for (const [key, tagIds] of byGroup) {
      const existing = await db.get('tradeNotes', key);
      const [acctId, sym, dt] = key.split(' ');
      await db.put('tradeNotes', {
        tradeGroupKey: key,
        date: existing?.date ?? dt ?? '',
        symbol: existing?.symbol ?? sym ?? '',
        accountId: existing?.accountId ?? acctId ?? '',
        content: existing?.content ?? '',
        tags: existing?.tags ?? [],
        tagIds,
        screenshotIds: existing?.screenshotIds,
        updatedAt: existing?.updatedAt ?? 0,
      });
    }
  }

  for (const d of data.deletes) {
    if (d.entity === 'daily_note') {
      const [accountId, day] = d.clientKey.split(':');
      await db.delete('dailyNotes', [day, accountId]);
    } else if (d.entity === 'trade_note') {
      await db.delete('tradeNotes', d.clientKey);
    } else if (d.entity === 'cash_flow') {
      await db.delete('cashFlows', d.clientKey);
    } else if (d.entity === 'tag') {
      await db.delete('tags', d.clientKey);
    } else if (d.entity === 'execution') {
      // clientKey is the execution's tradeId (transactions keyPath).
      await db.delete('transactions', d.clientKey);
    } else if (d.entity === 'account') {
      await db.delete('accounts', d.clientKey);
      // Cascade: remove the account's local transactions.
      const txns = await db.getAllFromIndex('transactions', 'by-accountId', d.clientKey);
      for (const t of txns) await db.delete('transactions', t.tradeId);
    }
  }

  // seq only advances when the server recorded new events. A first sync
  // (cursor 0) that returned data, or a later seq, means the local store changed.
  const hasRows =
    data.accounts.length > 0 || data.executions.length > 0 || data.cashFlows.length > 0 ||
    data.tags.length > 0 || data.tradeTags.length > 0 ||
    data.dailyNotes.length > 0 || data.tradeNotes.length > 0 || data.deletes.length > 0;
  const changed = cursor === 0 ? hasRows : data.seq > cursor;

  return { authenticated: true, changed, seq: data.seq };
}
