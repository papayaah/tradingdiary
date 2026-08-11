# AI Journal Assistant & Unbiased Note Generation Spec

## Status

Draft / Proposal

## Summary

A non-biased, automated AI Journal Co-Pilot powered by `@reactkits.dev/ai-connect` that assists traders when viewing or reviewing trade journal entries in Trading Diary. 

When a user opens a trade journal entry, the AI Assistant analyzes the raw trade data (entry/exit timestamps, price levels, risk-to-reward ratio, execution velocity, position size relative to portfolio, and prevailing market context) and automatically generates **objective, unbiased journal notes**.

The assistant focuses strictly on **process quality over trade outcome**, ensuring that winning trades with bad habits are flagged and losing trades with flawless execution are recognized.

---

## Key Principles & Unbiased Design Philosophy

1. **Process Quality over Outcome Bias**:
   - A trade that made money by breaking stop-loss rules is graded as a **poor process**.
   - A trade that hit a stop-loss cleanly according to the plan is graded as a **flawless execution**.
2. **Fact-Based & Data-Driven**:
   - Evaluates objective metrics: R-multiple, slippage, holding duration, distance from key moving averages/VWAP, and volume profile.
3. **Non-Judgmental Tone**:
   - Tone is analytical, constructive, and neutral—acting as an institutional trading desk risk auditor rather than an opinionated observer.
4. **Embedded In-Page Flow**:
   - Adheres to `AGENTS.md`: The AI Assistant mounts as an embedded, expandable panel alongside the journal entry—never as a blocking overlay modal.

---

## Architectural Overview & Component Hierarchy

```
packages/ai-connect/
├── src/
│   ├── components/
│   │   ├── AIJournalAssistant.tsx       # Main embedded assistant container
│   │   ├── AIExecutionAuditCard.tsx     # Process grade & metrics visualization
│   │   ├── AINotesStream.tsx            # Streaming AI generated notes with Markdown rendering
│   │   └── AIInteractivePrompt.tsx      # Follow-up Q&A input bar
│   ├── hooks/
│   │   ├── useAIJournalNotes.ts         # Hook to analyze trade data & stream response
│   │   └── useTradeAuditPrompt.ts       # Structured prompt builder for unbiased trade review
│   ├── types/
│   │   └── index.ts                     # Trade payload & AI note interfaces
```

---

## Feature Specifications

### 1. Automated Unbiased Note Generation (`useAIJournalNotes`)

When viewing a journal entry, the assistant constructs a structured, non-biased prompt containing:
- **Trade Execution Data:** Symbol, Direction (Long/Short), Entry Price, Exit Price, Stop Loss, Target, Position Size, Fees/Commissions, Holding Duration.
- **Execution Timeline:** Time elapsed before hitting stop/target, price drawdown vs runup (MAE/MFE).
- **Market Context:** S&P 500 / NASDAQ trend, VWAP position at entry, sector momentum, market volatility (VIX).
- **Trader Rules:** Planned Risk ($ amount), Max Portfolio Risk %, Tagged Setup Strategy.

#### Generated Note Sections:
1. 📊 **Execution & Process Audit** (Grade: A+ to F based strictly on rule adherence).
2. 🎯 **Risk & Sizing Audit** (Planned R:R vs Realized R:R, Max Adverse Excursion assessment).
3. ⏱️ **Timing & Discipline Insights** (Identifies chasing, early exits, or stop moving).
4. 🌐 **Market Context Sync** (Aligns trade with broader market trend at time of entry).
5. 💡 **Actionable Process Adjustment** (1-2 objective takeaways for the next trade).

---

### 2. Embedded Assistant UI Panel (`<AIJournalAssistant />`)

- **Location:** Embedded cleanly in the right column or expandable drawer of the trade detail page (`app/(journal)/trades/[id]/page.tsx`).
- **Interactive Controls:**
  - **"Generate AI Analysis":** Triggers streamable AI analysis using `@ai-sdk/openai` or `@ai-sdk/google` via `@reactkits.dev/ai-connect`.
  - **"Apply Note to Journal":** Appends the AI notes directly into the user's personal trade journal text field.
  - **"Ask Co-Pilot":** Interactive prompt box for follow-up questions (e.g. *"What was my risk-to-reward ratio compared to my average trade?"* or *"Did I chase the open?"*).
- **Legibility & Theme:** Strict adherence to `docs/design-system.md` using semantic tokens (`var(--background)`, `var(--foreground)`, `var(--card-bg)`, `var(--card-border)`, `var(--accent)`, `var(--profit)`, `var(--loss)`).

---

## API & Data Models

### 1. Trade Context Payload (`TradeAuditContext`)

```typescript
export interface TradeAuditContext {
  tradeId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  quantity: number;
  pnl: number;
  pnlPercentage: number;
  plannedRiskAmount?: number;
  realizedRiskMultiple?: number; // R-multiple
  holdingDurationMinutes: number;
  maxAdverseExcursion?: number;  // MAE (worst drawdown during trade)
  maxFavorableExcursion?: number; // MFE (best profit peak during trade)
  entryTimestamp: string;
  exitTimestamp: string;
  marketContext?: {
    vwapAtEntry?: number;
    spyTrend?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    relativeVolume?: number;
  };
  userStrategyTags?: string[];
}
```

### 2. AI Journal Output Schema (`AIJournalNoteResult`)

```typescript
export interface AIJournalNoteResult {
  processGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  gradeRationale: string;
  unbiasedNotes: {
    executionSummary: string;
    riskAudit: string;
    timingAnalysis: string;
    marketContextSummary: string;
    keyTakeaway: string;
  };
  flaggedBehaviors: Array<{
    type: 'CHASING' | 'EARLY_EXIT' | 'STOP_MOVED' | 'OVERSIZING' | 'FLAWLESS_RISK';
    severity: 'info' | 'warning' | 'positive';
    description: string;
  }>;
}
```

---

## System Prompt Guidelines (Enforcing Unbiased AI Behavior)

The AI prompt in `@reactkits.dev/ai-connect` strictly instructs the model:

> *"You are an elite, objective quantitative trading risk manager. Your sole job is to analyze trade execution data and write unbiased, constructive journal notes. Do NOT judge a trade by whether it made or lost money. Evaluate it purely by execution discipline, risk management, and setup adherence. A winning trade that violated stop rules must be flagged as high-risk. A losing trade executed strictly according to plan must be praised for discipline."*

---

## Integration Plan in Trading Diary

1. **Package Enhancements (`packages/ai-connect`):**
   - Export `<AIJournalAssistant />` and `useAIJournalNotes` hook from `@reactkits.dev/ai-connect`.
2. **Next.js API Route (`app/api/ai/journal-notes/route.ts`):**
   - Stream response using Next.js AI SDK (`ai` package with OpenRouter / Google Gemini / OpenAI).
3. **Trade Detail Page Mounting (`app/(journal)/trades/[id]/page.tsx`):**
   - Embed `<AIJournalAssistant />` side-by-side with trade execution timeline and charts.

---

## Verification & Testing Plan

### Automated Verification
- Unit tests for prompt generation given various trade outcomes (winning with bad risk vs losing with good risk).
- Type checking via `npx tsc -p packages/ai-connect/tsconfig.json`.

### Manual Verification
- View a winning trade where stop-loss was exceeded -> Verify AI flags rule violation despite positive P&L.
- View a losing trade with target R:R -> Verify AI rates execution positively for discipline.
- Test "Append Note to Journal" button.
