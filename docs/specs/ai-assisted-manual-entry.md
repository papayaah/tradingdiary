# AI-Assisted Manual Trading Entry

## Status

Draft

## Summary

Allow a trader to create a private journal entry by writing a short, natural-language note and optionally asking AI to enhance it. A broker import is not required.

Example input:

> I entered SLV at 51.5 overnight because it was holding while the market was falling.

The application extracts useful trade details, lets the trader correct them, expands the thought into an editable reflection, and displays relevant market data on an interactive chart.

The trader owns the journal entry. AI assists with organization, context, visualization, and reflection; it does not grade, verify, or approve the trade.

## Goals

- Let a user create a journal entry without importing trading records.
- Make the initial capture as quick as writing one sentence.
- Preserve the user's original words.
- Use AI only after an explicit **Enhance with AI** action.
- Convert natural language into editable structured trade details.
- Add an actual market-data chart when the symbol and date are known.
- Produce useful reflection without presenting financial advice as fact.

## Non-goals

- Proving that a trade occurred.
- Reconciling an entry with a broker statement.
- Scoring whether a trade was good or bad.
- Giving buy, sell, or position-sizing recommendations.
- Requiring complete execution details before saving.
- Using AI-generated images as price charts.

## Primary user flow

1. The user selects **New Journal Entry**.
2. The app defaults the journal date to today and shows a large text field.
3. The user enters a short note, for example:

   > I entered SLV at 51.5 overnight because it was holding while the market was falling.

4. The user can immediately select **Save Entry**, or select **Enhance with AI**.
5. When enhancement is requested, the app extracts the following when present:
   - Symbol: `SLV`
   - Direction: inferred only if expressed; otherwise unknown
   - Entry price: `51.50`
   - Date: journal date unless the note states another date
   - Session: `overnight`
   - Entry time: unknown
   - Quantity: unknown
   - Reasoning: `holding while the market was falling`
6. The app shows the extracted fields in an editable review panel. Missing fields remain optional.
7. The app retrieves market data for the selected symbol and date.
8. The app generates an editable enhanced reflection using the user's note, corrected fields, and calculated market context.
9. The user accepts, edits, regenerates, or discards the enhancement.
10. The app saves the original note, structured details, enhanced text, and chart configuration as one manual journal entry.

## Proposed interface

### Initial state

```text
New Journal Entry                              July 18, 2026

What happened in your trade?
┌──────────────────────────────────────────────────────────┐
│ I entered SLV at 51.5 overnight because it was holding  │
│ while the market was falling.                            │
└──────────────────────────────────────────────────────────┘

[Save Entry]                              [Enhance with AI]
```

### Enhanced state

```text
Original note
I entered SLV at 51.5 overnight because it was holding
while the market was falling.

Trade details
Symbol [SLV]   Direction [Not specified]   Entry [$51.50]
Date [Jul 18]  Session [Overnight]         Time [Optional]

AI-assisted reflection
I entered SLV at approximately $51.50 during the overnight
session. My thesis was based on relative strength: SLV appeared
to hold its level while the broader market weakened...

[Edit] [Regenerate] [Discard enhancement]

SLV chart · Jul 18
[interactive candlestick chart]
────────────── Stated entry $51.50 ──────────────

[Save Entry]
```

## Enhancement behavior

AI enhancement should return structured data rather than unrestricted prose alone.

```ts
interface AIEntryEnhancement {
  extractedTrade: {
    symbol?: string;
    direction?: 'long' | 'short';
    entryPrice?: number;
    exitPrice?: number;
    quantity?: number;
    tradeDate?: string;
    entryTime?: string;
    session?: 'overnight' | 'premarket' | 'regular' | 'afterhours';
  };
  enhancedReflection: string;
  themes: string[];
  reflectionQuestions: string[];
  chartRequest?: {
    symbol: string;
    date: string;
    entryPrice?: number;
    interval: string;
  };
}
```

The server must validate the AI response before it is used or stored. The user can edit every extracted value and every generated sentence.

## Chart behavior

- Charts use real OHLCV data returned by the configured chart provider.
- The existing chart provider abstraction and Lightweight Charts integration should be reused.
- A stated entry price is rendered as a horizontal price line.
- If an exact entry time is supplied, render an entry marker on the corresponding candle.
- If time is missing, do not invent one; display the full selected session and the price line.
- Session boundaries, volume, VWAP, previous close, and benchmark comparison may be added incrementally.
- If data is unavailable, save the journal entry normally and show a non-blocking chart-unavailable state.
- A chart is an aid to reflection, not a prerequisite for an entry.

## Data model

Add a journal-entry entity independent of imported transactions.

```ts
interface JournalEntryRecord {
  id: string;
  accountId?: string;
  date: string;
  source: 'manual' | 'imported';
  originalContent: string;
  enhancedContent?: string;
  symbol?: string;
  direction?: 'long' | 'short';
  entryPrice?: number;
  exitPrice?: number;
  quantity?: number;
  entryTime?: string;
  session?: 'overnight' | 'premarket' | 'regular' | 'afterhours';
  themes?: string[];
  reflectionQuestions?: string[];
  screenshotIds?: number[];
  createdAt: number;
  updatedAt: number;
}
```

Manual journal entries must be visible even when there are no accounts or imported transactions. A later design may link a manual entry to imported executions, but that is not required for this feature.

## AI context and safeguards

The enhancement request may include:

- The original note.
- The journal date and user-confirmed structured fields.
- Calculated market observations from the chart service.
- User-selected reflection style or focus, if introduced later.

The AI should:

- Write in the first person when expanding the trader's journal.
- Preserve uncertainty expressed by the trader.
- Avoid inventing missing prices, times, quantities, motives, or outcomes.
- Treat market observations as context, not as proof of the trader's experience.
- Avoid prescriptive financial advice.
- Keep the original note unchanged and separately accessible.

## Error and empty states

- AI not configured: allow ordinary manual saving and link to AI settings.
- AI request fails: preserve the draft and offer retry.
- Symbol not recognized: ask the user to edit the symbol; do not block saving.
- Date missing: use the selected journal date.
- Market data unavailable: save the text and allow chart retry later.
- Ambiguous price or symbol: display the extracted value for confirmation.
- User closes the page during generation: retain the local draft.

## Privacy expectations

- Enhancement happens only after the user selects **Enhance with AI**.
- Show which AI provider will receive the entry.
- Send only the information required for the enhancement.
- Do not use journal content for unrelated features without user action.
- Allow the enhanced result to be discarded while retaining the original entry.

## Acceptance criteria

- A user with no imported trades can create and revisit a journal entry.
- The entry can be saved with only a date and freeform text.
- **Enhance with AI** extracts `SLV` and `51.5` from the example sentence.
- Extracted details are shown to the user and remain editable.
- The original text remains unchanged after enhancement.
- The AI-generated reflection is editable and can be discarded.
- When chart data is available, the SLV chart displays a line at `$51.50`.
- Missing quantity, direction, or exact time does not prevent saving or enhancement.
- AI or chart-provider failure does not cause loss of the user's draft.
- Manual entries appear in the journal independently of imported trade-day groups.

## Suggested implementation sequence

1. Introduce the independent journal-entry data model and local persistence.
2. Add **New Journal Entry** and manual save/edit flows.
3. Add structured AI extraction and enhancement.
4. Embed the existing chart with symbol, date, and stated-price annotations.
5. Add calculated market context and optional reflection prompts.
6. Add production telemetry, retry behavior, rate limiting, and privacy controls.

## Open product decisions

- Whether a journal entry may contain multiple symbols or should create one trade card per symbol.
- Whether the default enhancement should be concise, analytical, or selectable by the user.
- Which benchmark should be used when a trader says “the market.”
- Which market-data subscription and venues are required for overnight coverage.
- Whether generated reflection questions appear inline or in a separate coaching section.
