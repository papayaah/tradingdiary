# Trading Journal Competitive Launch Gaps

## Status

Draft

## Last reviewed

August 14, 2026

## Implementation progress

Updated August 17, 2026. Tracks build status against the delivery milestones
below. See `flat-to-flat-trade-identity.md` and `journal-persistence-and-sync.md`.

**Milestone A — Trust the data**

- [x] Canonical trade identity — flat-to-flat splitter (`lib/trading/trade-groups.ts`),
      spec, and tests (reversal, overnight, open, FX, aggregator reconciliation).
      **Now rendered in the journal UI**: `aggregateTradeGroupsByDay` makes each
      round trip its own row (3 same-day AAPL trades → 3 rows) ordered by entry
      time — the per-day trade timeline. Trade notes, screenshots, and AI reviews
      now key **per round trip** (by the trade-group key), so each trade has its
      own note. **Interim:** the dashboard, replay, and global search still use
      the legacy day+symbol aggregation, so their trade counts differ from the
      journal until migrated; per-trade notes are keyed but not yet synced.
- [x] Automatic exchange trading-day boundary (`lib/trading/trading-day.ts`):
      equities on ET date, CME futures roll 18:00 ET. Manual "Trade Date Cutoff"
      setting removed. (Addresses the shared calc rule "record timezone and
      trading-day cutoff with every derived day grouping.")
- [~] Import integrity — execution idempotency key in schema/sync; import no
      longer fabricates dates; P&L-summary files rejected. **Not yet:** import
      batch records, checksums, per-batch undo, execution audit view.
- [x] Server persistence + live cross-device sync — Postgres tables
      (`trading_account`, `execution`, `trade_group`, notes, tags, review,
      attachment, `journal_event`) with rev + tombstones; `/api/journal/sync`
      push/pull with rev conflict detection and server-side splitter rebuild;
      client sync engine (`JournalSyncProvider`: pull→push on sign-in, debounced
      write-through, pull on focus, sync-state indicator) with guest→account
      adoption. Accounts, executions, and daily notes sync across devices;
      **deletes propagate** via authoritative-snapshot reconciliation.
      **Not yet synced:** trade notes / tags / AI reviews — the client now keys
      these per trade (unblocked), so only the push/pull wiring remains; daily
      notes are last-write-wins (no conflict UI yet); clearing all local data
      re-hydrates from the server by design (true server wipe = account-deletion).
- [~] Fixtures — splitter + trading-day unit tests. **Not yet:** full matrix
      (partial fills, futures multipliers, FX, duplicate imports, scale in/out).
- [x] Backup/export, restore, and account deletion — full JSON backup +
      executions CSV + restore-from-backup (`lib/journal/export.ts`); `DELETE
      /api/journal` wipes server data; "Clear All" also deletes synced account
      data for signed-in users. **Not yet:** per-batch import undo/audit.
- [ ] Cash-flow-aware equity (deposits/withdrawals) or scoped return metrics.
- [x] Trade times displayed in exchange time with an EST/EDT label
      (`lib/trading/exchange-time.ts`), e.g. "1:06 PM EDT" — aligned to the
      market session rather than the viewer's local clock.

**Milestone B — Complete the review loop:** not started (tags/playbooks, planned
risk/R, reports + shared filters, drill-down, supported-asset matrix).

Legend: [x] done · [~] partial · [ ] not started.

## Summary

Trading Diary already covers the beginning of the core journaling loop: users can
import or enter trades, group executions into trades and days, review charts,
write daily and trade notes, attach screenshots, inspect basic performance, run
AI-assisted trade reviews, and replay recorded activity.

This specification compares that baseline with three established products:
TradeZella, Tradervue, and TradesViz. The purpose is to decide what Trading Diary
still needs before a public debut, what may be explicitly excluded from the
launch promise, and what belongs after launch.

The shared pre-debut gaps are smaller and more focused than full competitor
parity:

1. Trustworthy execution import, duplicate prevention, correction handling, and
   clear import history.
2. Correct flat-to-flat trade identity instead of grouping every same-day symbol
   execution into one trade.
3. Durable journal storage, backup, export, and deletion behavior.
4. Editable categorized tags, a minimum viable strategy/playbook, and rule
   adherence.
5. Planned stop, target, risk, and R-multiple fields.
6. A filterable core report set with drill-down to source trades.
7. Accurate account/equity calculations that handle deposits, withdrawals,
   commissions, currencies, and open positions.
8. A polished review loop connecting trade details, notes, screenshots, tags,
   charts, and replay.

Automatic broker sync, advanced replay, guided daily routines, backtesting,
mentor sharing, prop-firm compliance, custom dashboards, and contextual AI are
important fast-follow features. They are not all debut blockers unless they are
promised in launch marketing.

This is a market benchmark, not a UI or product blueprint. Trading Diary should
preserve its own strengths: transparent calculations, user-owned observations,
modular feature code, useful AI that does not pretend to know intent, and an
interface that keeps the trader in context.

## Benchmark sources

Competitor capabilities are time-sensitive. The following official sources were
reviewed on the date above.

### TradeZella

- [TradeZella product overview](https://www.tradezella.com/) — automated
  journaling, broker connections, backtesting, replay, AI, community, and prop
  firm tracking.
- [Trading journal and analytics](https://www.tradezella.com/trading-journal) —
  stop and target tracking, planned and realized risk/reward, tags, MAE/MFE,
  ratings, attachments, templates, reports, and filters.
- [Trade Replay](https://www.tradezella.com/trade-replay) — execution-synced
  replay, variable speed, annotations, tags, notes, and day review.
- [Backtesting](https://www.tradezella.com/backtesting) — simulated execution,
  automatic backtest journaling, strategy linkage, and backtest analytics.
- [Reports: Tags](https://help.tradezella.com/en/articles/11595729-reports-tags)
  and [Reports: Playbook](https://help.tradezella.com/en/articles/11595424-reports-playbook)
  — customizable metrics, tag and strategy reports, and cross-analysis.
- [Progress Tracker rules](https://help.tradezella.com/en/articles/10371695-understanding-and-using-progress-tracker-rules)
  — prepare, trade, and reflect rules, daily risk limits, and rule adherence.
- [Notebook organization](https://help.tradezella.com/en/articles/7190696-organizing-and-managing-your-notes-within-your-tradezella-notebook)
  — folders, templates, note tags, sharing, downloads, and period recaps.
- [Mentor Mode](https://help.tradezella.com/en/articles/8293313-understanding-mentor-mode)
  — permissioned account review, comparison, and feedback.
- [PropFirm Sync](https://help.tradezella.com/en/articles/13463710-getting-started-with-the-propfirm-sync-feature)
  — evaluation rules, fees, payouts, account status, and aggregate ROI.
- [Zella AI](https://help.tradezella.com/en/articles/11201153-what-is-zella-ai-tradezella-s-ai-trading-assistant)
  — context-aware analysis across trades, reports, strategies, notes,
  backtesting, and daily planning.

### Tradervue

- [Tradervue pricing and feature comparison](https://www.tradervue.com/site/pricing/)
  — broker sync, multi-account journals, charts, MFE/MAE, interactive reports,
  exports, images, and mentoring.
- [Trading analysis](https://www.tradervue.com/site/trading-analysis) — risk,
  liquidity, tick-based, detailed, and comparison reporting.
- [Risk reporting](https://www.tradervue.com/help/reports/risk_reporting) —
  initial-risk capture and report-wide R-multiple normalization.
- [P&L reporting modes](https://app.tradervue.com/help/pl_reporting_modes) —
  base-currency, ticks, and R reporting.
- [Trade sharing](https://www.tradervue.com/site/sharing-trades) — selective
  sharing with P&L and volume hidden by default.
- [Mentoring and coaching](https://app.tradervue.com/help/mentors) — private,
  read-only account review and mentor comments.

### TradesViz

- [TradesViz pricing and feature comparison](https://www.tradesviz.com/pricing/)
  — import management, custom grids and dashboards, tags, risk analysis, exit
  analysis, simulator/replay, options tooling, AI, and prop-firm compliance.
- [Supported brokers and platforms](https://www.tradesviz.com/brokers-list/) —
  manual and automatic import coverage across brokers and asset classes.
- [Getting started with TradesViz](https://www.tradesviz.com/blog/getting-started-with-tradesviz/)
  — advanced tables, executions view, pivot analysis, filters, notes, and custom
  dashboards.
- [Unified View](https://www.tradesviz.com/blog/unified-view/) — one review
  surface combining P&L, risk, charts, notes, tags, and contextual data.
- [Options journal](https://www.tradesviz.com/options/) — trade plans, mistakes,
  options analytics, replay, simulation, and dedicated note management.
- [TradesViz 2026 feature map](https://www.tradesviz.com/blog/) — current exit
  analysis, MAE/MFE, drawdown, tags, AI, prop-firm, and import developments.

## Competitive synthesis

| Capability | TradeZella emphasis | Tradervue emphasis | TradesViz emphasis | Trading Diary status | Debut decision |
| --- | --- | --- | --- | --- | --- |
| Trade capture | Broad broker sync and automated journaling | Broker import/sync and unlimited accounts | Fine-grained import management and broad asset/platform coverage | Manual entry, generic import, and several broker adapters | **Required:** make current imports auditable, idempotent, and reversible. One live sync is conditional. |
| Trade identity | Execution-linked journal and replay | Trade-level journal and comparison reports | Separate executions, trades, symbols, and days tables | Same-day symbol grouping can merge distinct round trips | **Required:** stable flat-to-flat trade groups before analytics are trusted. |
| Notes and evidence | Trade/day notes, attachments, templates, voice | Trade/day notes, screenshots, no-trade-day notes | Dedicated searchable notes, tags, templates, unified review | Trade/day notes, screenshots, media library | **Required:** finish the current loop and remove placeholder note/tag states; full notebook can follow. |
| Tags and strategies | Categorized tags, playbooks, rule statistics | Tags, filters, tag reports | Custom tag groups, day tags, plans, mistakes analysis | Flat stored tag array without a complete workflow | **Required:** editable categories, strategy linkage, and reportable stable IDs. |
| Risk and process | Stops, targets, risk/reward, ratings, rules | Initial risk and report-wide R mode | Stops, targets, plans, R/points/ticks modes, exit analysis | Some derived MAE/MFE/R logic; no persistent plan | **Required:** initial risk, stop, targets, planned/realized R, and process review. |
| Reports | 50+ reports, 30+ filters, cross-analysis | Detailed/comparison/risk/liquidity reports | Flexible grids, pivoting, custom dashboards, hundreds of metrics | Fixed dashboard and basic date ranges | **Required:** focused core reports and filters; custom pivot/dashboard is post-launch. |
| Account accuracy | Multi-account and prop-firm views | Independent accounts and base-currency reports | Cash flows, equity comparison, open P&L, multi-currency | Multiple accounts, FX, open positions | **Required:** deposits/withdrawals or clearly scoped return metrics; consolidated account filters. |
| Replay and simulation | Execution-synced replay and backtesting | Chart review rather than simulator breadth | Replay, multi-asset simulator, what-if stops/targets | Functional replay with limited review persistence | **Conditional:** replay must be stable if advertised; annotations and simulation can follow. |
| Daily process | Prepare/trade/reflect progress tracker | Daily notes and planning | Trade/day plans, goals, mistakes analysis | Daily notes without a guided process | **Post-launch:** valuable retention feature, not required for a credible first journal. |
| Sharing and mentoring | Spaces and Mentor Mode | Privacy-first sharing and private mentor comments | Public/private trade, account, dashboard sharing | Missing | **Post-launch:** do not delay debut; sharing requires server authority and permissions. |
| Asset-specific depth | Stocks, options, futures, forex | Stocks, options, futures, forex | Deep options, futures, forex, crypto, and CFD tooling | Best aligned today with stocks/futures | **Required:** publish an honest supported-asset matrix; do not imply options parity. |
| AI | Context-aware assistant and daily planning | Not the central value proposition | AI Q&A, coach, notes, trade chat | Evidence-based trade review | **Post-launch:** keep the current scoped review; cross-journal AI depends on structured data. |

## Public debut definition

For this document, a public debut means Trading Diary is presented to users as a
dependable journal rather than an internal prototype. A feature is a debut blocker
when its absence can corrupt data, produce misleading statistics, prevent users
from completing the core review loop, or make a launch claim materially false.

### Required before debut

- Define and test one canonical execution-to-trade grouping model.
- Provide import history, duplicate detection, validation warnings, and undo or
  safe rollback for the existing import paths.
- Persist or export all user-owned trades, notes, tags, screenshots, settings,
  and reviews; document whether the debut is local-first or cloud-synced.
- Replace the journal's `No notes` and tag placeholders with saved summaries and
  working tag controls.
- Add strategy/setup linkage, initial risk, stop, targets, and review status.
- Ship a core report set: net P&L, win rate, average win/loss, payoff ratio,
  profit factor, expectancy, drawdown, commissions, hold time, R, MAE/MFE, and
  breakdowns by account, symbol, side, day/time, strategy, and tag.
- Make every report drill down to the exact included trades and reconcile to the
  journal.
- Handle cash flows or suppress account-return metrics that cannot distinguish
  trading performance from deposits and withdrawals.
- Publish the supported brokers, formats, asset classes, currencies, timezones,
  and known data limitations.
- Complete privacy, account deletion, data export, error recovery, empty-state,
  and mobile smoke tests.

### Conditional debut requirements

- **Automatic broker sync:** required only if the debut is marketed as automatic
  journaling. Otherwise, launch with reliable manual/file import and label sync
  as coming later.
- **Replay:** required only if replay is a headline launch feature. If included,
  it must restore the correct trade/day, entries, exits, timestamps, and data
  resolution without overstating tick accuracy.
- **AI review:** required only if the debut is marketed as AI-powered. If included,
  it must preserve user text, cite deterministic evidence, expose provider/model,
  and fail without losing the journal draft.
- **Cloud sync:** required for a multi-device promise, collaboration, or mentor
  access. A clearly disclosed local-first debut may defer it if backup/export is
  complete.

### Explicitly not required before debut

- Hundreds of reports or a generic pivot-table builder.
- Drag-and-drop custom dashboards.
- Full backtesting or multi-asset simulation.
- Public trade feeds, Spaces, mentor mode, or firm administration.
- Prop-firm fee, payout, and challenge compliance.
- Options Greeks, options flow, spread detection, or payoff simulation unless
  options are an advertised launch asset class.
- Liquidity/add-remove reporting unless source execution data reliably contains
  liquidity flags.
- Native iOS/Android apps; a reliable responsive web experience is sufficient.
- Natural-language analytics across the entire journal.

## Current Trading Diary baseline

The status below is based on the repository as reviewed, not on planned specs.

### Present

- Manual trade entry with symbol, direction, quantity, price, timestamp, fees,
  multiplier, and account.
- File-based import with broker adapters for IBKR, Schwab, Fidelity, Robinhood,
  Webull, and eSignal, plus generic column mapping and AI-assisted extraction.
- Multiple accounts with account currency and historical FX normalization.
- FIFO execution aggregation, open-position handling, commissions, realized and
  unrealized P&L.
- Daily journal grouping, daily notes, trade notes, screenshots, and media
  library integration.
- Dashboard calendar, cumulative P&L, win/loss counts, average and largest
  wins/losses, holding-time comparisons, and open positions.
- Trade charts with entry and exit context.
- Trade analysis that can calculate MAE, MFE, exit efficiency, and R-multiple
  when sufficient market and planned-risk context is available.
- AI-assisted trade review with evidence and provenance.
- Trade/day replay controls and P&L timeline.
- Market watch, deterministic pattern scanning, alerts, and push notifications.

### Partial

- `TradeNoteRecord` stores a flat `tags` array, but there is no complete tag
  editor, category taxonomy, summary display, or tag-based reporting workflow.
- Daily and trade notes exist, but there is no independent notebook, reusable
  templates, folders, search, or weekly/monthly recap entity.
- Replay exists, but it is not yet a complete review surface with drawings,
  annotations, persistent replay observations, strategy checks, and analytics
  feedback.
- Multiple accounts exist, but analytics primarily operate on one selected
  account rather than arbitrary consolidated account sets.
- MAE/MFE and R calculations exist in analysis code, but they are not first-class
  persisted trade fields or portfolio-wide reports.
- Authentication and server infrastructure exist, but core trades and journal
  records are still primarily stored in IndexedDB on one browser.

### Missing

- Live broker trade synchronization and reconciliation status.
- Strategy/playbook entities, rules, examples, and trade linkage.
- Planned stop, targets, risk amount, planned R, execution rating, and explicit
  rule-adherence fields.
- Reusable multidimensional reports and shared filters.
- Guided daily planning, trading, and review stages with checklists and streaks.
- Independent notebook folders, templates, period recaps, and note search.
- A separate strategy backtesting workspace.
- Permissioned trade sharing and mentor review.
- Prop firm evaluation, funded-account, fee, payout, and breach tracking.
- A contextual assistant that can reason across reports, strategies, notes, and
  daily plans rather than one trade at a time.

## Priority model

- **P0 — Debut gate:** required before public debut, or must be explicitly scoped
  out of the launch promise through honest product messaging.
- **P1 — Fast follow:** important to retention and trader improvement, but not
  required to prove the core journal is dependable.
- **P2 — Expansion:** valuable for specific audiences or collaboration, but should
  not delay the core journal.

## P0 — debut-gate requirements

### 1. Durable storage and canonical trade identity

#### Problem

Browser-local storage without backup is too fragile for a dependable journal.
Server authority is required for multi-device use, collaboration, and automatic
server imports; a disclosed local-first debut may defer it only when complete
backup and restore are available.

#### Requirements

- For a cloud or multi-device debut, add server-side, user-owned tables for
  trading accounts, executions, imported files, trade groups, daily notes, trade
  notes, attachments, tags, and AI review references.
- Define a trade as a flat-to-flat round trip by default, with an explicit policy
  for overnight positions, scaling, reversals, and multiple same-symbol trades in
  one day.
- Give executions, positions, round trips, and journal days separate stable IDs;
  do not use date/symbol/account as the identity of an individual trade.
- In cloud mode, keep IndexedDB as an offline cache and draft layer rather than
  the only source of truth. In local-first mode, provide complete backup/restore
  and label the storage boundary during onboarding.
- Use stable server IDs and idempotency keys for imported executions.
- Record `createdAt`, `updatedAt`, and deletion tombstones so synchronization can
  resolve offline edits without silent data loss.
- Provide explicit sync state: local only, syncing, synced, conflict, and failed.
- Encrypt provider credentials and never expose them to the client.
- Provide account export and deletion covering both local and server data.

#### Acceptance criteria

- In cloud mode, an authenticated user can import on one device and review the
  same trades and notes on another.
- In local-first mode, a full backup restored in a clean browser reproduces the
  same executions, trades, notes, tags, settings, and totals.
- Two completed AAPL round trips on the same day remain two reviewable trades,
  while their executions still roll up into the correct day and symbol totals.
- Retrying an interrupted import cannot duplicate executions.
- Editing a note offline synchronizes after reconnection.
- A conflict never silently overwrites both versions; the user can choose or
  merge content.

### 2. Import integrity, diagnostics, and conditional broker sync

#### Problem

Every competitor treats ingestion as a product surface, not just a file parser.
Before debut, current imports must be observable and reversible. Automatic sync
is required only if it is part of the launch promise.

#### Requirements

- Introduce a broker-connection abstraction independent of the existing file
  adapter abstraction.
- Add an import-batch record containing source filename/provider, checksum,
  account, timestamps, row counts, accepted/rejected rows, warnings, and created
  execution IDs.
- Provide an execution audit view with raw source values, normalized values, and
  the adapter/version responsible for each conversion.
- Detect overlapping files and previously imported executions before the user
  confirms an import.
- Support a safe import-batch undo that removes only records created by that
  batch and recomputes affected trades/days.
- Make malformed rows downloadable with actionable error reasons.
- Start with IBKR because the repository already contains IBKR integration work;
  do not attempt hundreds of shallow integrations at once.
- Support initial history backfill, incremental sync, manual refresh, connection
  health, and reconnect flows.
- Persist source execution IDs and broker account IDs.
- Reconcile corrections, busts, partial fills, commissions, fees, and late
  updates without generating duplicate trades.
- Show last successful sync, next retry, imported count, warning count, and
  actionable errors.
- Retain file import as a supported fallback and historical backfill method.

#### Acceptance criteria

- Re-running the same sync produces no duplicate executions.
- Importing the same file twice is blocked or becomes an explicit no-op.
- A user can inspect and undo the most recent import batch without affecting
  older data.
- A corrected broker execution updates the existing record and triggers affected
  trade/day metric recomputation.
- Disconnecting a broker stops future access without deleting already imported
  journal data.
- Sync failures are visible and retryable without blocking journal review.

### 3. Strategy playbooks and categorized tags

#### Problem

P&L alone cannot explain whether a repeatable setup works or whether losses come
from execution mistakes. Trades need structured labels and explicit strategy
rules.

#### Requirements

- Add reusable tag categories such as `setup`, `mistake`, `emotion`,
  `market-condition`, and user-defined categories.
- Let users create, rename, archive, color, and reorder tags without rewriting
  historical meaning.
- Add a playbook entity with title, thesis, direction eligibility, market/time
  context, entry criteria, exit criteria, risk rules, checklist items, examples,
  and archived state.
- Link zero or one primary playbook to a trade and preserve historical linkage
  when a playbook is later edited.
- Record rule adherence as `followed`, `violated`, or `not-applicable`, with an
  optional trader note.
- Make tag and playbook editing available inside the expanded trade panel as an
  embedded panel, not a modal.
- Display tags in the existing journal table column instead of the current
  placeholder.

#### Acceptance criteria

- A user can tag a trade with `FOMO`, link it to `Opening Range Breakout`, and
  mark which strategy rules were followed.
- Archived tags and playbooks remain visible on historical trades.
- Reports can aggregate P&L and adherence using stable tag/playbook IDs rather
  than display text.

### 4. Planned risk and execution-quality record

#### Problem

The application can describe what happened, but it cannot consistently compare
the result with what the trader planned.

#### Requirements

- Add editable trade-plan fields: planned entry, initial stop, one or more
  targets, planned quantity, planned risk amount, planned risk percentage,
  maximum day loss, and thesis.
- Store stop and target revisions as timestamped events rather than overwriting
  the initial plan.
- Calculate planned R, realized R, risk/reward, MAE, MFE, exit efficiency, and
  plan deviation from deterministic inputs.
- Support report-wide display modes for account/base currency and R. Add points
  or ticks only for instruments with authoritative tick-size metadata.
- Add best-exit and end-of-day-exit comparisons as review metrics, clearly
  labeled as hindsight analysis rather than recommendations.
- Add execution rating and process rating as separate optional values; do not
  equate profitability with good execution.
- Record whether the plan was created before, during, or after the trade.
- Clearly label unavailable and low-confidence calculations.
- Reuse these fields in manual entry, trade review, replay, playbooks, reports,
  and AI context.

#### Acceptance criteria

- A user can record a `$100` initial risk and review a `+1.8R` outcome.
- Changing the stop during a trade does not erase the initial planned risk.
- A profitable rule-breaking trade can receive a low process rating without
  being mislabeled as a bad financial result.
- The app never invents an initial stop from price action or execution data.

### 5. Reports and shared filtering engine

#### Problem

The current dashboard answers a small set of fixed questions. Users need to ask
the same performance questions across accounts, strategies, tags, time, symbols,
risk, and behavior without each report becoming custom one-off code.

#### Requirements

- Create one normalized query/filter contract shared by Dashboard, Journal,
  Reports, Replay review, and AI context.
- Support date range, one or more accounts, symbol, side, open/closed, win/loss,
  playbook, tag category/tag, entry/exit time bucket, duration, size, rating,
  R-multiple range, and reviewed/unreviewed.
- Add saved report views with a name, filter set, metric set, chart type, and
  grouping dimensions.
- Let users choose visible trade-table columns and preserve that preference.
- Add core metrics: net/gross P&L, commissions, win rate, average win/loss,
  payoff ratio, profit factor, expectancy, average and maximum drawdown,
  planned/realized R, MAE/MFE, streaks, hold time, trade count, and adherence.
- Add cross-analysis using a primary dimension and secondary dimension, for
  example `mistake tag by entry-hour` or `playbook by weekday`.
- Support currency and R modes across the same filtered population. Support
  points/ticks only where comparison is meaningful and label excluded trades.
- Every metric must have a definition, formula, included population, currency,
  timezone, and empty-state behavior.
- Allow drilling from any aggregate point to its underlying trades.
- Keep calculations deterministic and unit tested.

#### Acceptance criteria

- A user can compare all selected accounts, then narrow to one account without
  changing pages.
- A user can answer: “How does FOMO affect my ORB trades during the first 30
  minutes?” and open the matching trade list.
- Totals in a report reconcile exactly with the filtered journal trades.
- Reports do not combine currencies without an explicit conversion basis.

### 6. Account cash flows, portability, and launch safety

#### Problem

TradesViz highlights deposits, withdrawals, equity comparison, export management,
and fine-grained import controls; Tradervue provides spreadsheet export. Without
cash-flow awareness and user-controlled export, account return and drawdown can be
misleading and browser-local data is too fragile for a public debut.

#### Requirements

- Add deposit, withdrawal, interest, dividend, borrow fee, platform fee, and
  manual adjustment records where those values affect displayed equity.
- Separate trading P&L from account cash flow in calculations and charts.
- If cash flows are unavailable, label equity/return metrics as trade-only and do
  not imply total account return.
- Export accounts, executions, normalized trades, notes, tags, strategies, plans,
  reviews, and settings in documented CSV/JSON formats.
- Provide a restore/import path for the product's own full backup format.
- Implement authenticated account deletion and local-data deletion with a clear
  scope and confirmation.
- Add calculation definitions and data-freshness labels to every financial
  summary.
- Add end-to-end fixtures covering partial fills, scale-ins/outs, reversals,
  overnight positions, futures multipliers, fees, FX, duplicate imports, and
  multiple round trips.

#### Acceptance criteria

- A `$10,000` deposit changes account equity but never appears as trading P&L.
- Exported execution totals reconcile with the journal and can be restored to a
  clean account without duplication.
- Deleting an account removes server data and instructs the user how local cache
  and downloaded backups are handled.
- The launch test suite proves totals for every supported asset/import fixture.

## P1 — fast-follow requirements

### 7. Guided trading-day workflow and progress tracker

#### Requirements

- Add configurable `Prepare`, `Trade`, and `Reflect` stages.
- Support reusable daily rules, selected weekdays, reminders, and manual or
  automatic completion conditions.
- Include first-class controls for allowed trading hours, per-trade loss limit,
  daily loss limit, required playbook linkage, required initial stop, and required
  end-of-day review.
- Let the trader start and finish a day explicitly.
- Lock the final snapshot after finishing while allowing a separately audited
  correction flow.
- Show adherence rate and streaks without gamifying P&L.
- Feed rule compliance into reports and AI review.

#### Acceptance criteria

- A trader can define “No trading after 11:30” and see objective violations from
  execution timestamps.
- The day review distinguishes automatically evaluated rules from self-reported
  rules.
- Missing a rule affects process adherence, never retroactively changes P&L.

### 8. Notebook, templates, and period recaps

#### Requirements

- Add independent notes that do not require a trade or imported day.
- Support system and user-created folders, note tags, full-text search, archive,
  recently deleted, and restore.
- Support templates for pre-market plans, trade reviews, end-of-day reviews,
  weekly reviews, and monthly reviews.
- Let users generate a recap over a selected date range with linked metrics and
  selected trades while keeping the written reflection user-editable.
- Link a note to zero or more dates, trades, playbooks, replay sessions, or
  backtesting sessions.
- Reuse the existing attachment/media system.
- Treat AI drafting as explicit assistance; preserve the original user text.

#### Acceptance criteria

- A user can start a pre-market note from a template without having imported a
  trade that day.
- Searching `revenge trading` finds matching trade notes, daily notes, and
  notebook notes the user is authorized to see.
- Deleting a note moves it to a recoverable state before permanent deletion.

### 9. Replay as a structured review tool

#### Requirements

- Preserve existing replay controls and execution-synced P&L timeline.
- Add persistent drawings, markers, screenshots, notes, tags, and rule checks.
- Add jump-to-entry, jump-to-exit, previous/next execution, and configurable
  playback speeds.
- Support a day replay and a focused single-trade replay.
- Save a replay-review record containing observations and links to the reviewed
  trades.
- Feed replay-created tags and observations into the journal and reports without
  duplicating records.
- Label candle/tick granularity accurately; do not market candle data as
  tick-by-tick replay.

#### Acceptance criteria

- A tag added during replay appears on the original trade and in tag reports.
- Returning to a reviewed replay restores drawings and notes.
- The review records the available data resolution and provider.

### 10. Strategy backtesting workspace

#### Requirements

- Keep backtesting separate from replaying real trades.
- Reuse playbooks, chart components, order simulation, tags, notes, and metric
  definitions where appropriate.
- Record simulated entries, partial exits, stops, targets, commissions, slippage,
  and session metadata.
- Maintain separate live and backtest datasets with an explicit comparison view.
- Support bar-by-bar reveal without allowing future data leakage.
- Add backtest session summaries, notes, and reproducible configuration.

#### Acceptance criteria

- A backtested trade can never appear in live-account P&L.
- Reopening a session restores symbol, date, interval, strategy, costs, and trades.
- A user can compare live versus backtested performance for one playbook using
  identical metric definitions.

## P2 — expansion requirements

### 11. Prop firm challenge tracking

Build only if prop-firm traders are a validated target segment.

- Track evaluation, verification, funded, payout, and breached states.
- Support profit target, minimum days, daily loss, static/EOD/trailing drawdown,
  consistency, and time-limit rules.
- Link journal accounts to challenges without conflating trading P&L with prop
  firm business ROI.
- Track evaluation fees, resets, activation fees, and payouts.
- Show distance to limits and data freshness; never imply that delayed data is a
  live risk control.

### 12. Permissioned sharing and mentor review

- Share selected trades, notes, reports, playbooks, or replay reviews with
  explicit scopes and expiration.
- Add mentor invitations with least-privilege permissions.
- Allow comments without allowing a mentor to rewrite the trader's original
  journal entry.
- Provide access logs and immediate revocation.
- Keep all sharing private by default; public community feeds are a separate
  product decision.

### 13. Contextual journal assistant

Build after the structured data and permission model exist.

- Let the assistant use the current report, trade, day, playbook, notebook note,
  or backtest session as explicit context.
- Support questions over deterministic metrics and linked journal text.
- Draft daily plans and recaps for trader review rather than auto-publishing them.
- Cite the trades, rules, notes, and metric calculations behind every material
  observation.
- Preserve the safeguards in the existing AI review contract: no invented intent,
  no unsupported facts, and no financial advice presented as certainty.

## Proposed data model additions

The exact storage technology may change, but the domain boundaries should remain
stable.

```ts
interface StrategyRecord {
  id: string;
  userId: string;
  name: string;
  thesis?: string;
  rules: StrategyRuleRecord[];
  archivedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface TradeReviewRecord {
  tradeGroupId: string;
  strategyId?: string;
  tagIds: string[];
  plannedEntry?: number;
  initialStop?: number;
  targets: Array<{ price: number; quantity?: number }>;
  plannedRiskAmount?: number;
  plannedRiskPercent?: number;
  executionRating?: number;
  processRating?: number;
  planCreatedAt?: number;
  reviewedAt?: number;
}

interface StrategyRuleCheckRecord {
  tradeGroupId: string;
  strategyRuleId: string;
  status: 'followed' | 'violated' | 'not-applicable';
  source: 'trader' | 'deterministic';
  note?: string;
}

interface JournalNoteRecord {
  id: string;
  userId: string;
  folderId: string;
  title?: string;
  content: string;
  templateId?: string;
  tagIds: string[];
  links: Array<{
    type: 'date' | 'trade' | 'strategy' | 'replay' | 'backtest';
    id: string;
  }>;
  deletedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface SavedReportRecord {
  id: string;
  userId: string;
  name: string;
  filters: ReportFilter;
  metrics: MetricId[];
  primaryDimension?: DimensionId;
  secondaryDimension?: DimensionId;
  visualization: 'table' | 'bar' | 'line';
}
```

## Shared calculation rules

- Store raw executions and user inputs; derive aggregates from versioned
  calculation functions.
- Define a stable trade-group identity that supports multiple round trips in one
  symbol and day. The current date/symbol/account note key is insufficient when a
  trader makes separate trades in the same symbol on the same day.
- Version aggregation, FX, metric, and strategy-rule evaluators.
- Record timezone and trading-day cutoff with every derived day grouping.
- Preserve native currency and show the conversion rate/date whenever reporting
  in account or base currency.
- Keep planned, actual, inferred, and AI-generated fields distinct.
- Recompute only affected trade, day, and report partitions after an import or
  edit.

## Suggested delivery sequence

### Debut milestone A — Trust the data

1. Stable execution, position, round-trip, and journal-day identities.
2. Import batches, checksums, duplicate detection, diagnostics, and undo.
3. Fixtures for partial fills, multiple round trips, reversals, overnight trades,
   fees, futures multipliers, currencies, and open positions.
4. Complete backup/export, restore, and deletion behavior.
5. Cash-flow-aware equity or explicit removal of unsupported return claims.
6. Cloud synchronization only if required by the debut promise.

### Debut milestone B — Complete the review loop

1. Working note summaries and categorized tag controls in the journal table.
2. Minimum viable strategy/playbook linkage and rule checks.
3. Initial risk, stop, target, planned/realized R, and review status.
4. Shared filters and the focused core report set.
5. Report drill-down and reconciliation to source trades.
6. Supported broker/asset matrix, calculation definitions, privacy review, and
   mobile smoke tests.

### Fast-follow milestone C — Reduce journaling friction

1. IBKR automatic synchronization and reconciliation.
2. Multi-account consolidated reporting and saved report views.
3. Guided prepare/trade/reflect workflow.
4. Progress rules, adherence, and streaks.
5. Notebook folders, templates, search, and period recaps.
6. Structured replay annotations and exit analysis.

### Expansion milestone D — Validate and collaborate

1. Backtesting workspace and live-versus-simulated strategy comparison.
2. Permissioned sharing and mentor mode.
3. Prop firm tracking if validated.
4. Asset-specific modules such as options analytics if validated.
5. Contextual assistant over the completed structured data model.

## Product success measures

- Percentage of imported trades reviewed within 24 hours.
- Percentage of reviewed trades with a strategy, planned risk, and at least one
  meaningful tag.
- Weekly active journaling days per active trader.
- Prepare/trade/reflect completion rate.
- Percentage of report aggregates that successfully reconcile to source trades.
- Automatic sync success, duplicate prevention, and correction-reconciliation
  rates.
- Replay reviews that create a saved observation, tag, or rule check.
- Four-week retention for users who complete at least three structured reviews.

Do not use profitability improvement as the sole product-success measure. Market
results are noisy and can reward poor process over short periods. The product
should primarily measure whether it helps traders capture complete data, follow a
repeatable review process, identify behavior patterns, and make evidence-based
adjustments.

## Non-goals

- Copying TradeZella, Tradervue, or TradesViz interfaces, terminology, or pricing
  structures.
- Claiming that journaling guarantees profitability.
- Building hundreds of broker integrations before one sync path is reliable.
- Treating AI opinions as a replacement for deterministic metrics or trader
  reflection.
- Mixing live trades and simulated backtests in one P&L dataset.
- Launching a public social feed before private sharing and permissions are safe.
- Shipping education content or mentor marketplaces as a prerequisite for the
  core journal.

## Open product decisions

- Whether authenticated accounts should be server-authoritative immediately or
  use an explicit local/private mode.
- Whether a trade group represents one flat-to-flat round trip or all activity in
  a symbol during a configured trading day.
- Which asset classes and IBKR account types are required for the first automatic
  sync release.
- Whether strategy rule versions are snapshotted per trade or resolved through a
  versioned strategy history.
- Which report dimensions belong in the first release and which can be added by a
  generic dimension registry later.
- Whether process ratings use a fixed scale, a simple pass/fail, or a trader-
  configurable rubric.
- Whether prop firm tracking is part of the core product or an optional module.
- Which sharing model is needed first: read-only link, named collaborator, or
  mentor relationship.
