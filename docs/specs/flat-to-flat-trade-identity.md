# Flat-to-Flat Trade Identity

## Status

Draft

## Last reviewed

August 16, 2026

## Purpose

Define the canonical rule that turns a stream of executions into individual,
reviewable trades. This is P0 item #1 in
[trading-journal-competitive-launch-gaps.md](trading-journal-competitive-launch-gaps.md#L256)
and the "open product decision" at
[line 777](trading-journal-competitive-launch-gaps.md#L777). It is a prerequisite
for the normalized `trade_group` table, correct per-trade statistics, and the
per-day trade timeline.

## Decision

A **trade** is one **flat-to-flat round trip**: a position that opens from a flat
(zero) position and closes back to flat. Scaling in and scaling out happen
*inside* one trade. Multiple round trips in the same symbol on the same day are
**separate trades**.

This matches Tradervue, TradeZella, and TradesViz, and replaces the current
`date + symbol` grouping in
[lib/trading/aggregator.ts](../../lib/trading/aggregator.ts), which merges
distinct round trips into a single row.

## Model

Three layers, aggregations flow upward (the TradesViz shape):

1. **Execution** — one raw fill. Immutable source record.
2. **Trade group** — one flat-to-flat round trip. The unit users review, tag,
   annotate, rate, and plan. Owns its own stable ID.
3. **Day / symbol totals** — derived aggregations *over* trade groups. Never a
   storage identity.

A trade group holds:

- Stable UUID (never `date`/`symbol`/`account`).
- `accountId`, `symbol`, `side` (`LONG` | `SHORT`, from the opening execution).
- Ordered execution IDs.
- `openedAt` (first opening fill), `closedAt` (fill that returns to flat; null
  while open).
- `entryAvgPrice`, `exitAvgPrice`, `maxPosition` (peak absolute size), `volume`.
- `grossPnL`, `commissions`, `netPnL` (native + account currency), `isOpen`.
- `tradingDay` — the effective day the trade is attributed to (see below).

## The splitting rule

Walk executions in **true execution order** (raw file `date` + `time`), running a
signed `runningPosition`, exactly as the aggregator does today
([aggregator.ts:139-260](../../lib/trading/aggregator.ts#L139-L260)). FIFO lot
matching and P&L math are unchanged — only the *grouping* changes:

- Start a new trade group when `runningPosition` moves **from 0 to non-zero**.
- Keep appending executions (scale-in, scale-out, partial closes) while
  `runningPosition` stays non-zero and keeps the same sign.
- **Close** the current trade group when `runningPosition` returns to **0**.
- The next non-zero movement starts a fresh trade group.

Scale-ins and scale-outs never split a trade — only crossing zero does.

## Edge cases

### Reversal (long straight to short, or vice versa)

A single fill can both close the position *and* open the opposite side (e.g. long
+100, then a sell of 200 → flat at 0, then short −100). Split at the zero
crossing:

- The portion that brings the position to 0 **closes** the current trade group.
- The remaining portion **opens** a new trade group on the opposite side.
- The crossing execution is referenced by both groups with its quantity split at
  the zero point; each group's P&L uses only its share. Record it as a synthetic
  split so totals still reconcile to the raw fill.

### Overnight / multi-day hold

A position that does not return to flat by end of day stays **one open trade
group** spanning days until it finally closes. It does not split at the session
boundary.

- `tradingDay` = the day the trade **opened** (post-cutoff, using the existing
  `effectiveDate` logic, [aggregator.ts:80-84](../../lib/trading/aggregator.ts#L80-L84)).
- The trade appears on its opening day's timeline as an open position and is
  updated in place when it later closes; it is not duplicated onto each day it is
  held.
- Day/symbol P&L still attributes each *realized* close to the day it occurred
  (preserve current cross-day realized attribution).

### Still open at end of available data

`isOpen = true`, `closedAt = null`. Unrealized P&L uses market price via the
existing `applyMarketPrices`
([aggregator.ts:356-394](../../lib/trading/aggregator.ts#L356-L394)). An open
trade is reviewable but excluded from closed-trade win-rate/expectancy stats.

### Imported realized/unrealized P&L

When a source provides `realizedPnL`/`unrealizedPnL` directly (no matchable
lots), attribute it to the trade group open at that execution; if none is open,
it opens and immediately closes a single-execution trade group.

## What this enables

- **Per-day trade timeline** — each trade group has its own `openedAt`/`closedAt`,
  so a day renders as a time-ordered sequence of completed trades (the requested
  timeline view) instead of one merged symbol row.
- **Correct per-trade stats** — win rate, expectancy, payoff, R, MAE/MFE are
  computed per round trip, not per merged day.
- **Per-trade review** — notes, tags, playbook, plan, and ratings attach to one
  round trip.

## Acceptance criteria

- Three completed AAPL round trips on one day produce **three** trade groups,
  three timeline nodes, and three independent notes/tags targets — while their
  executions still roll up into the correct AAPL day and symbol totals.
- Scaling into and out of a single position produces **one** trade group.
- A long position sold through zero into a short produces **two** trade groups
  whose combined P&L equals the FIFO P&L of the raw fills.
- A position held overnight is one trade group attributed to its opening day, not
  split per calendar day.
- Removing the flat-to-flat split and re-running the current fixtures reproduces
  today's day/symbol totals exactly (aggregation-only change; no P&L drift).

## Open questions

- Reversal fill: store as one execution referenced twice with a split quantity,
  or synthesize two execution rows? (Reconciliation must hold either way.)
- Trade-group `side` for a reversal-opened group: derived from its own opening
  portion (yes) vs. inherited (no).
- Whether `maxPosition` and scale-event timestamps are stored or derived on read.
