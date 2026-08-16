# Journal Persistence and Sync

## Status

Draft

## Last reviewed

August 16, 2026

## Purpose

Table design and sync protocol for making the journal server-authoritative for
authenticated users. This implements P0 item #1
([trading-journal-competitive-launch-gaps.md](trading-journal-competitive-launch-gaps.md#L256))
with the two decisions already made:

- **Normalized tables** (not a JSONB blob).
- **Full spec sync** (tombstones, conflict detection/merge, explicit sync states).

Trade identity follows
[flat-to-flat-trade-identity.md](flat-to-flat-trade-identity.md).

## Behavior in one sentence

A guest works entirely in IndexedDB; the moment they sign in with Google or
register, their local journal is adopted into their server account, and every
device on that login stays in sync thereafter — exactly the mental model of the
market watch, but for the whole journal.

## Storage layers

| Layer | Role |
| --- | --- |
| **Guest (unauthenticated)** | IndexedDB only. No server rows. Full app works offline/local. |
| **Authenticated** | Postgres is the source of truth. IndexedDB is a local cache + offline draft layer, write-through on change. |

This mirrors the watch model: guest = local, sign-in = server-authoritative
(`GET /api/watch/sync` returns `authenticated: false` and no rows for guests —
[app/api/watch/sync/route.ts:125](../../app/api/watch/sync/route.ts#L125)).

## Table set

New Postgres tables in [lib/db/server/schema.ts](../../lib/db/server/schema.ts),
following the existing pgTable conventions. Every user-owned row carries:

- `id uuid primary key default random` — the stable identity (never
  `date`/`symbol`/`account` composites).
- `userId text not null references user(id) on delete cascade`.
- `createdAt`, `updatedAt` (ms or timestamptz).
- `deletedAt` tombstone (nullable) — soft delete so sync can propagate deletions.
- `rev integer not null default 1` — bumped on every write; the basis for
  conflict detection.

```
trading_account      ← AccountRecord
execution            ← TransactionRecord (raw fills; immutable source)
trade_group          ← flat-to-flat round trip (see identity spec); derived + persisted
daily_note           ← DailyNoteRecord   (keyed to userId + accountId + tradingDay)
trade_note           ← TradeNoteRecord   (RE-KEYED to trade_group — see below)
tag                  ← reusable tag (was a flat string[] on TradeNoteRecord)
trade_tag            ← join: trade_group ↔ tag
trade_ai_review      ← TradeAIReviewRecord (tradeGroupId → real trade_group.id)
attachment           ← screenshot/media metadata (blob lives in object storage)
journal_event        ← monotonic per-user change log (mirrors watch_event)
```

### `execution` — idempotency

Executions get an **idempotency key** so re-import, retry, and guest-adoption
never duplicate fills:

```
idempotencyKey = hash(userId, accountId, sourceTradeId, symbol, date, time, quantity, price)
unique(userId, idempotencyKey)
```

Insert uses `onConflictDoNothing` on that key (the pattern
`serverWatch` already uses for its identity index,
[route.ts:306](../../app/api/watch/sync/route.ts#L306)).

### `trade_group` — the identity change

`trade_group` rows are produced by the flat-to-flat splitter, not stored as
`${date}:${symbol}:${accountId}`. Fields per the identity spec: `openedAt`,
`closedAt`, `side`, `entryAvgPrice`, `exitAvgPrice`, `maxPosition`, `netPnL`,
`isOpen`, `tradingDay`, ordered `executionIds`. Day/symbol totals are aggregations
over these rows, never a stored identity.

## The trade-note re-keying problem (needs a decision)

Today `TradeNoteRecord` is keyed `[date, symbol, accountId]`
([schema.ts:63-71](../../lib/db/schema.ts#L63-L71)) and
`TradeAIReviewRecord.tradeGroupId` is the string `${date}:${symbol}:${accountId}`
([schema.ts:90](../../lib/db/schema.ts#L90)). Under flat-to-flat, one day+symbol
can hold **three** trades — so a day+symbol note is ambiguous.

Decision: **notes/tags/reviews attach per trade only.**

- New trade notes/tags/reviews attach to a **`trade_group.id`** (one specific
  round trip). There is no day+symbol note concept.
- During adoption, a legacy day+symbol note maps to the single trade_group when
  that day+symbol has exactly one round trip; when it has several, the note is
  attached to the **first (earliest `openedAt`) trade_group** of that day+symbol.
  The user can move it onto another round trip afterward.

## Attachments / screenshots

`screenshotIds` currently reference binary blobs in the browser media library.
Postgres should store **metadata only**; blobs go to object storage (S3/R2), with
`attachment` holding `{ id, userId, storageKey, mime, bytes, createdAt }`. Guest
screenshots are uploaded during adoption. **Object-storage provider is an open
decision** — until chosen, attachments can remain local-only and sync
metadata-first.

## Sync protocol (full spec sync)

Modeled on the existing `watch_event` cursor + `/api/watch/sync` pattern.

### Change log

`journal_event` mirrors `watch_event`
([schema.ts:191-202](../../lib/db/server/schema.ts#L191-L202)): a `bigserial seq`
monotonic cursor per user, `type` (`account.*`, `execution.*`, `trade_group.*`,
`note.*`, `tag.*`, `review.*`), and a small payload (record id + rev only — never
blobs). Clients catch up from their last `seq`.

### Endpoints

- `GET /api/journal/sync?since=<seq>` — returns rows changed after the cursor
  (including tombstones), plus the new high-water `seq`. Guests get
  `authenticated: false` and no rows.
- `POST /api/journal/sync` — client pushes locally-dirty rows, each with its last
  known `rev` (`baseRev`).

### Conflict rule

For each pushed row the server compares `baseRev` to the stored `rev`:

- `baseRev === stored.rev` → accept, bump `rev`, emit a `journal_event`.
- `baseRev < stored.rev` → **conflict**: do not overwrite. Return both versions;
  the client surfaces a choose/merge step. Never silently clobber (spec
  acceptance criterion, [line 296](trading-journal-competitive-launch-gaps.md#L296)).
- Deletions are tombstone writes and follow the same rev check.

Executions are immutable, so they never conflict — only corrections (a new/edited
execution) do, handled by the idempotency key.

### Sync state (surfaced in UI)

`local` · `syncing` · `synced` · `conflict` · `failed` — one indicator, driven by
the last sync result, matching the spec's required states
([line 281](trading-journal-competitive-launch-gaps.md#L281)).

## Guest → authenticated adoption

On the client detecting an unauth → auth transition (Better Auth `useSession`):

1. `GET /api/journal/sync?since=0`. Two cases:
   - **Server empty, local has data** → **adopt**: bulk-push all local rows.
     Server assigns UUIDs, dedups executions by idempotency key, runs the
     flat-to-flat splitter to produce `trade_group` rows, re-keys legacy notes per
     the rule above. Client stores the `localKey → serverId` map and switches IDB
     to cache mode.
   - **Server has data** (returning user, new device) → server is source of
     truth; hydrate IDB from it.
2. **Server has data AND local guest data exists** (signed in on a device that was
   already used as a guest) → **merge by default**: local guest rows are pushed
   into the account. The idempotency key makes overlapping executions safe (no
   duplicates), so no prompt is required in the common case. A post-merge summary
   ("N trades added from this device") is shown so the merge is not silent.

Adoption is idempotent: running it twice (interrupted sign-in) cannot duplicate
executions, because every execution insert is `onConflictDoNothing` on the
idempotency key.

## Acceptance criteria

- A guest imports trades, signs in with Google, and the same trades/notes appear
  on a second device after login.
- Importing the same file (or re-running adoption) produces no duplicate
  executions.
- Editing a note offline on device A syncs to device B after reconnection.
- A concurrent edit on two devices produces a conflict the user resolves; neither
  version is silently lost.
- Deleting a trade/note on one device removes it on the other via tombstone.
- Signing out returns the user to guest/local mode without destroying the local
  cache.

## Open decisions

1. Object-storage provider for attachments (S3/R2/other), or ship attachments
   local-only first.
2. `updatedAt`/`rev` storage: numeric ms vs. `timestamptz`; whether `rev` is
   per-row or a per-user logical clock.
3. Whether `trade_group` is fully persisted or recomputed on read from executions
   (persisted is required for notes/tags/reviews to have a stable FK target —
   leaning persisted).

## Resolved decisions

- Trade notes/tags/reviews attach **per trade** (`trade_group.id`); legacy
  ambiguous notes go to the earliest round trip of that day+symbol.
- Guest data meeting an existing account **merges by default** (idempotency key
  makes it safe), with a post-merge summary rather than a blocking prompt.

## Delivery order

1. Schema + migration (`npm run db:push`, per repo DB convention).
2. Flat-to-flat splitter producing `trade_group` rows from executions (reuses the
   FIFO walk in [lib/trading/aggregator.ts](../../lib/trading/aggregator.ts)).
3. `/api/journal/sync` GET/POST + `journal_event` log.
4. Client sync engine: hydrate-on-login, write-through, dirty tracking, sync-state
   indicator.
5. Guest adoption flow + conflict UI.
6. Export + authenticated account deletion (P0 launch-safety, spec item #6).
7. Fixtures: partial fills, scale-in/out, reversals, overnight, futures
   multipliers, FX, duplicate imports, multiple round trips.
