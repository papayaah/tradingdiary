# Trade AI Assistant & Notes Integration Spec

**Status**: Approved Spec — Revised (Implementation-Ready)  
**Date**: 2026-08-10 (rev. adds §2 trade identity, §3 analyzer invariants, §4 validation, §7 IndexedDB migration)  
**Target Area**: Trade Journal expanded view (`components/journal/TradeTable.tsx`), Note storage (`lib/db/notes.ts`), deterministic metrics calculator, and `@reactkits.dev/ai-connect` integration.

---

## 1. Overview & Objectives

Users viewing expanded trades in the Trading Journal need:
1. **Trade Note Editing**: Ability to write and persist notes directly per trade group (`tradeId`).
2. **Evidence-First AI Trade Review**: An AI assistant action that evaluates objective trade execution data and metrics without generic or judgmental advice.
3. **Deterministic Metrics & Events Engine**: A pure calculation engine that extracts objective measurements (MFE, MAE, R-multiple, explicit scale-in/out events, target/stop touches) before handing data to AI.
4. **Clean Note & Review Storage Separation**: Keeping human user notes and AI-generated reviews distinct in storage to avoid clobbering user notes and enable long-term cross-trade behavior analysis.

---

## 2. Trade Identification & Data Storage (`lib/db/notes.ts`)

### Trade group identity (decision)

A "trade group" for v1 is the existing composite `[date, symbol, accountId]` — the same key the
implemented `tradeNotes` store and screenshot attachments already use
(`lib/db/schema.ts` `TradeNoteRecord`, `lib/db/notes.ts` `getTradeNote(date, symbol, accountId)`).

- We do **not** introduce a separate `tradeId: string` for notes/reviews. The `tradeId` field on
  `TransactionRecord` is the per-order TLG id (one fill), **not** a round-trip group, and must not be
  reused as the group key.
- A stable string form `tradeGroupId = \`${date}:${symbol}:${accountId}\`` is derived only where a
  single-string reference is convenient (e.g. the AI review store's `by-tradeGroup` index). It is a
  pure function of the composite key, never stored as a separate identity.

**Known limitation (accepted for v1):** same-day re-entries in one symbol collapse into a single
group, so MFE/MAE/R-multiple for that group span multiple round-trips. The Deterministic Analyzer
(§3) MUST detect this (more than one flat→open→flat cycle within the group) and, when present,
set `evidenceConfidence: 'low'` and emit a `MULTIPLE_ROUND_TRIPS` note in the payload so the AI and
the fallback panel disclose it rather than reporting misleading single-excursion numbers. Per-round-trip
splitting is deferred to a future revision.

### User notes — reuse the existing store

User notes continue to use the implemented `tradeNotes` store and its `content` field. **Do not
rename `content → userNote`** and do not add a new note store. Note saves MUST patch `content` only,
preserving `screenshotIds` and `tags` (read-modify-write, mirroring `saveDailyNote`), so a debounced
auto-save cannot clobber a concurrently attached screenshot.

```ts
// Existing — unchanged:
export async function getTradeNote(date, symbol, accountId): Promise<TradeNoteRecord | undefined>;
// Add — content-only patch, preserves screenshotIds/tags:
export async function saveTradeNoteContent(date, symbol, accountId, content: string): Promise<void>;
```

### AI reviews — new store

AI reviews are stored separately from user notes (never clobber human input).

```ts
export interface ObservationEvidence {
  metric: string;
  value: string;
  source?: 'METRIC' | 'EVENT' | 'STRATEGY_RULE';
}

export interface TradeAIReview {
  id: string;                 // keyPath
  date: string;               // group key part
  symbol: string;             // group key part
  accountId: string;          // group key part
  tradeGroupId: string;       // derived `${date}:${symbol}:${accountId}` — indexed for lookup
  summary: string;
  observations: {
    label: string;
    detail: string;
    evidence?: ObservationEvidence[]; // Structured deterministic citations for UI chips
  }[];
  executionReview?: string;
  riskReview?: string;
  questionsForTrader?: string[];
  takeaway?: string;
  evidenceConfidence: 'low' | 'medium' | 'high'; // See single definition in §4
  // Provenance — required for reproducibility and cross-model comparison:
  provider: string;           // ai-connect provider id
  model: string;              // model id used
  promptVersion: string;      // bump when the prompt template changes
  contextHash: string;        // hash of the TradeAnalysisContext the review was built from
  createdAt: number;
}

export async function getTradeAIReviews(
  date: string, symbol: string, accountId: string
): Promise<TradeAIReview[]>;                                  // newest first, via by-tradeGroup index
export async function saveTradeAIReview(review: TradeAIReview): Promise<void>;
```

A saved review is **stale** when its `contextHash` no longer matches the current
`TradeAnalysisContext` for the group (executions or candles changed). The UI shows a stale badge but
never auto-deletes.

---

## 3. Data Architecture & Full Context Contract

### Analyzer rules (must-hold invariants)
- **Side sign convention:** MFE, MAE, giveback, and R-multiple are computed relative to trade
  direction. For `SHORT`, favorable = price falls, adverse = price rises; invert all excursion signs
  and R math accordingly. Never assume LONG.
- **OHLCV source:** intraday candles come **through the shared market-data cache** (server-side
  Polygon layer), never a fresh per-review fetch. Granularity: minute bars for intraday holds; for
  multi-day holds fall back to a coarser bar and cap total candles. When candles are unavailable,
  compute excursion from executions only and set `evidenceConfidence` no higher than `low`.
- **Round-trip detection:** see the `MULTIPLE_ROUND_TRIPS` rule in §2.

Raw trade data passes through a **Deterministic Analyzer** first.

```
Trade + Full Executions + OHLCV + Risk Parameters
                       │
                       ▼
             Deterministic Analyzer
    (Calculates MFE, MAE, R-Multiple, Giveback,
  Deterministic Events with Sources: Scale-in/out, Stop/Target touches)
                       │
                 ┌─────┴─────┐
                 ▼           ▼
            Objective     Fallback Stats
          Metrics Payload  (When no AI API Key)
                 │
                 ▼
           AI Assistant (via @reactkits.dev/ai-connect)
                 │
                 ▼
        Evidence-First Review Contract
```

### Full Deterministic Context (`TradeAnalysisContext`)
```ts
export type OHLCV = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ExcursionMetric = {
  amount: number;      // Dollar value ($)
  points: number;      // Price move ($ per share / contract points)
  percent: number;     // Percentage move (%)
};

export type GivebackMetric = {
  amount: number;         // Dollar value ($)
  percentOfMFE: number;   // Percentage of peak MFE given back (%)
};

export type TradeAnalysisContext = {
  trade: {
    tradeId: string;
    symbol: string;
    side: 'LONG' | 'SHORT';
    openedAt: number;
    closedAt?: number;
    entryPrice: number;
    exitPrice?: number;
    netPnL: number;
    maxPositionQuantity: number;  // Peak position size held during trade lifecycle
  };

  executions: {
    timestamp: number;
    side: 'BUY' | 'SELL';
    price: number;
    quantity: number;
  }[];

  risk?: {
    initialStop?: number;
    initialTarget?: number;
    plannedRiskAmount?: number;
    initialR?: number;
  };

  marketContext?: {
    timeframe: string;
    candles?: OHLCV[];
  };

  metrics: {
    mfe: ExcursionMetric;
    mae: ExcursionMetric;
    rMultiple?: number;                       // Realized R-Multiple if initial risk is available
    currentGivebackFromMFE?: GivebackMetric;  // Active/live position giveback from peak
    exitGivebackFromMFE?: GivebackMetric;     // Closed trade giveback between peak and exit
    timeToMfeMs?: number;
    holdingDurationMs: number;
  };

  events?: {
    type:
      | 'ENTRY'
      | 'SCALE_IN'
      | 'SCALE_OUT'
      | 'TARGET_TOUCH'
      | 'STOP_TOUCH'
      | 'MFE'
      | 'MAE'
      | 'EXIT';
    timestamp: number;
    price?: number;
    quantity?: number;
    source: 'EXECUTION' | 'MARKET_DATA' | 'DERIVED'; // Provenance of the detected event
  }[];

  traderContext?: {
    strategyName?: string;
    strategyRules?: string[];
    preTradePlan?: string;              // Execution intent for rule comparison
    postTradeReflection?: string;       // Trader reflections (isolated from prompt bias)
  };
};
```

---

## 4. Prompt Hierarchy & AI Output Contract

### Prompt Hierarchy & Rules
1. **State facts**: Report exact execution data and objective metrics.
2. **Identify notable behavior**: Highlight scale-in clustering, giveback, or duration without assigning moral judgment.
3. **Compare against explicit trader rules**: Compare execution against `strategyRules` or `preTradePlan` when supplied.
4. **Ask questions when intent is unknown**: Prompt the trader on whether actions were planned or reactive.
5. **Do not infer that profit = good trade or loss = bad trade**: Execution quality is evaluated by plan adherence and risk control, not outcome bias.
6. **Do not infer intent from execution behavior alone**: Describe observable actions objectively and only classify them as planned, reactive, disciplined, or undisciplined when trader rules or pre-trade intent provide evidence.

### AI Output Contract
```ts
export interface TradeAnalysis {
  summary: string;
  observations: {
    label: string;
    detail: string;
    evidence?: ObservationEvidence[]; // Structured citations
  }[];
  executionReview?: string;
  riskReview?: string;
  questionsForTrader?: string[];
  takeaway?: string;
  evidenceConfidence: 'low' | 'medium' | 'high';
}
```

**`evidenceConfidence` — single definition (referenced from §2):** reflects *data completeness*, not
AI opinion strength. `low` = missing OHLCV or risk parameters, or `MULTIPLE_ROUND_TRIPS` present;
`medium` = metrics + candles but no trader rules/plan; `high` = full dataset **and** trader rules or
pre-trade plan available. The deterministic layer sets a ceiling; the model may lower but never raise it.

**Validation & repair:** the model returns via `useAIService().generateText<TradeAnalysis>`. The raw
result MUST be validated against a zod schema for `TradeAnalysis`. On failure, retry once with a
repair instruction; if it still fails, discard the AI result and fall back to the Objective Trade
Statistics Panel (§5). A malformed AI response never blocks the deterministic stats.

---

## 5. UI & Fallback Behavior

### Fallback Mode (No AI Key Configured)
When `@reactkits.dev/ai-connect` has no active provider or key, the UI displays an **Objective Trade Statistics Panel** calculated by the deterministic engine:

```
+-----------------------------------------------------------------------+
| Objective Trade Statistics                                            |
| Holding Time: 15m 32s | Executions: 10 fills | Net: +$388.08          |
| MFE (Max Favorable): +$520.00 (+2.3%) | MAE (Max Adverse): -$45.00     |
| Exit Giveback: $131.92 (25.3% of MFE) | Time to Peak: 8m 10s           |
| Events: Entry (09:30), 2x Scale-in (09:32, 09:35), Exit (09:45)      |
+-----------------------------------------------------------------------+
```

### Expanded Trade Row UX
- **User Notes**: Auto-saving textarea dedicated exclusively to the trader's personal reflections.
- **AI Review Card**: Rendered below user notes upon request (`Ask AI Assistant`).
- **Actions**:
  - `Save Review`: Persists the AI review as a distinct record linked to the trade group.
  - `Copy`: Copies formatted review text.
  - `Dismiss`: Closes the AI card.

### Cost & rate limiting
`Ask AI Assistant` is a paid call on the user's own key (BYOK). Debounce/guard repeat requests via
ai-connect's `useRateLimit`, and surface token cost via `useCostTracking`, consistent with the rest
of the app's ai-connect usage. Re-running a review on an unchanged `contextHash` should warn (a
non-stale review already exists) rather than silently re-billing.

---

## 6. Design System & Guideline Compliance
- [x] Legible across light and dark themes using semantic tokens (`bg-card-bg`, `border-card-border`, `text-foreground`, `text-muted`, `text-accent`).
- [x] In-page embedded drawer/panel flow within the trade table row context.
- [x] Strict data storage separation between human notes and AI analysis records.

---

## 7. IndexedDB Schema Change (`lib/db/database.ts`)

This is **client-side IndexedDB**, not the Postgres `db:push` flow. Adding the `tradeAIReviews`
store requires a `getDB()` version bump and a `createObjectStore` in the `upgrade()` callback —
required even though the app has no users yet, because dev/tester browsers already hold a DB at the
current version and will not otherwise create the new store.

```ts
// bump DB_VERSION to N+1
if (oldVersion < /* N+1 */) {
  const s = db.createObjectStore('tradeAIReviews', { keyPath: 'id' });
  s.createIndex('by-tradeGroup', 'tradeGroupId');
}
```

- **New store (AI reviews):** version bump + create store. No data migration/backfill — nothing to
  transform.
- **User notes store:** unchanged shape (`content` kept). No migration needed.
- If any existing store shape *is* changed later, prefer recreate-empty + local dev wipe over
  backfill code while there are no real users.
