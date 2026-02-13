# Universal Import Spec

## Problem

The app currently only imports `.tlg` files (a proprietary pipe-delimited format from one broker). Users should be able to import trades from **any source** — CSV exports from different brokers, or even screenshots of trade history.

## Example Inputs

### CSV (xiaomi.csv / haidilao.csv)
```
Date,Order ID,Stock Code,Stock Name,Currency,Action,Order Price,Quantity,Executed Price,Order Type
2023-01-04 00:00:00,10518036,HK 01810,XIAOMI-W,HKD,Buy,11.380,1000,11.380,Enhanced Limit Order
```

### Screenshot
Brokerage web UI showing a table with columns: Order ID, Stock Code, Stock Name, CCY, B/S, Order Price, Order Quantity, Confirmed Quantity, OS Qty, Avg Price, Status, Order Type, Stop Price, Create Date & Time.

The columns, naming, and ordering differ across brokers — the system must handle any layout.

---

## Core Idea

All import paths funnel into one intermediate format (`NormalizedTransaction[]`), which then gets mapped to the existing `TransactionRecord` and stored in IndexedDB. The pipeline:

```
 Input (CSV / Image / TLG / paste)
          │
          ▼
   ┌─────────────┐
   │   Extractor  │  (per-format: CSV parser, Vision LLM, TLG parser)
   └──────┬──────┘
          │  raw rows / text
          ▼
   ┌─────────────┐
   │   Mapper     │  (auto-detect columns → NormalizedTransaction)
   └──────┬──────┘
          │
          ▼
   ┌─────────────┐
   │  Preview UI  │  (user reviews, corrects mapping, filters rows)
   └──────┬──────┘
          │  confirmed
          ▼
   ┌─────────────┐
   │   Importer   │  (NormalizedTransaction → TransactionRecord → IndexedDB)
   └─────────────┘
```

---

## 1. NormalizedTransaction (intermediate format)

The minimum fields needed to produce a `TransactionRecord`:

```ts
interface NormalizedTransaction {
  // Required — import fails without these
  symbol: string;         // e.g. "XIAOMI-W", "AAPL"
  side: 'BUY' | 'SELL';  // simplified from BUYTOOPEN etc.
  date: string;           // ISO-ish, any parseable format
  quantity: number;       // shares/lots
  price: number;          // executed/avg price

  // Optional — will be defaulted if missing
  time?: string;          // HH:MM:SS, defaults to "00:00:00"
  orderId?: string;       // becomes tradeId, auto-generated if missing
  companyName?: string;   // defaults to symbol
  currency?: string;      // defaults to "USD"
  exchanges?: string;     // defaults to ""
  orderType?: string;     // defaults to "MARKET"
  totalValue?: number;    // defaults to qty * price (computed)
  commission?: number;    // defaults to 0
  stockCode?: string;     // broker-specific code, e.g. "HK 01810"
}
```

### Side Mapping

The existing schema uses `BUYTOOPEN | SELLTOOPEN | BUYTOCLOSE | SELLTOCLOSE`. Since external sources only give us Buy/Sell, we need a strategy:

**Option A (recommended): Infer from position tracking**
- First Buy for a symbol → `BUYTOOPEN`
- Subsequent Buys while position is open → `BUYTOOPEN` (adding to position)
- Sell while long → `SELLTOCLOSE`
- First Sell (no existing position) → `SELLTOOPEN` (short)
- Buy while short → `BUYTOCLOSE`

This requires processing transactions chronologically per symbol.

**Option B: Simplify the schema**
- Add `BUY` / `SELL` as valid side values alongside the existing four
- Aggregator treats `BUY` same as `BUYTOOPEN`, `SELL` same as `SELLTOCLOSE`
- Simpler but loses short-selling semantics

**Recommendation:** Go with Option A. The inference logic lives in the mapper, keeping the existing schema intact.

---

## 2. AI Layer — `packages/ai-connect`

All LLM calls (CSV header detection, image extraction) go through the existing `packages/ai-connect` package. This keeps AI logic centralized and reusable.

### What ai-connect already provides

- **Multi-provider support** — OpenAI, Anthropic, Google, Mistral, Cohere, xAI, Perplexity via Vercel AI SDK
- **`AIProviderSelector` component** — full UI for provider/model/API key selection
- **`useAIService` hook** — `generateText()` with automatic cost tracking
- **`AIManagementProvider` context** — global config persisted in localStorage
- **Cost tracking** — per-call token usage and cost estimates
- **Presets** — Tailwind preset available for styling

### Contributions needed to ai-connect

#### Contribution 1: Add OpenRouter provider

OpenRouter gives access to **free models** (Gemini 2.0 Flash, Llama 3.3 70B, etc.) — users can import trades without paying for API calls.

Changes to `packages/ai-connect`:

1. **Add `'openrouter'` to `LLMProvider` type** in `types.ts`
2. **Add OpenRouter models** in `providers/index.ts`:
   ```ts
   const openrouterModels: ModelInfo[] = [
     {
       id: 'google/gemini-2.0-flash-exp:free',
       name: 'Gemini 2.0 Flash (Free)',
       description: 'Free, 1M context, vision support',
       pricing: createPricing(0, 0),
       contextLength: 1000000,
       costTier: 'budget',
       recommended: true,
     },
     {
       id: 'meta-llama/llama-3.3-70b-instruct:free',
       name: 'Llama 3.3 70B (Free)',
       description: 'Free, GPT-4 level performance',
       pricing: createPricing(0, 0),
       contextLength: 131072,
       costTier: 'budget',
     },
     // ... more free + paid models
   ];
   ```
3. **Add OpenRouter case** in `createVercelAIModel()` in `services/aiService.ts`:
   ```ts
   case 'openrouter': {
     const { createOpenRouter } = await import('@openrouter/ai-sdk-provider');
     const openrouter = createOpenRouter({ apiKey });
     return openrouter(model);
   }
   ```
4. **Add provider entry** in `providers/index.ts`:
   ```ts
   openrouter: {
     id: 'openrouter',
     name: 'OpenRouter',
     description: 'Access 300+ models including free ones',
     models: openrouterModels,
     defaultModel: 'google/gemini-2.0-flash-exp:free',
     apiKeyPattern: /^sk-or-v1-[a-f0-9]{64}$/,
     apiKeyPlaceholder: 'sk-or-v1-...',
     docsUrl: 'https://openrouter.ai/keys',
   },
   ```
5. **Install** `@openrouter/ai-sdk-provider` as a peer/dev dependency

#### Contribution 2: Add vision/image support

Currently `generateText()` only accepts a `prompt: string`. We need image input for screenshot extraction.

Add a new method to `AIService` and a new hook:

```ts
// New method on AIService
async generateTextWithImage(options: AICallOptions & {
  image: string | ArrayBuffer;  // base64 data URL or raw bytes
  imageMediaType?: 'image/png' | 'image/jpeg' | 'image/webp';
}): Promise<AICallResult> {
  // Uses Vercel AI SDK's message content array:
  // [{ type: 'image', image: ... }, { type: 'text', text: prompt }]
}

// New hook
export function useAIVisionService() {
  // Wraps generateTextWithImage with loading/error states
  return { extractFromImage, isProcessing, error };
}
```

This uses the Vercel AI SDK's built-in multimodal support — no new dependencies needed.

### How the trading diary app uses ai-connect

```tsx
// app/(journal)/layout.tsx or a wrapper
import { AIManagementProvider } from '@/packages/ai-connect';

<AIManagementProvider>
  {children}
</AIManagementProvider>

// In the import flow:
import { useAIService } from '@/packages/ai-connect';

const { generateText } = useAIService();

// For CSV header mapping:
const result = await generateText({
  prompt: `Given these CSV headers and 3 sample rows, return a JSON mapping...`,
  systemPrompt: 'You are a data mapping assistant...',
  temperature: 0,
});

// For image extraction (after contribution 2):
const result = await generateTextWithImage({
  prompt: 'Extract trade data from this screenshot...',
  image: base64Screenshot,
  temperature: 0,
});
```

### Default provider: OpenRouter (free)

The app ships with OpenRouter as the default/recommended provider. The `.env.local` stores the default API key:

```
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1-...
```

If the env var is present, the app auto-configures OpenRouter with a free model — zero setup for the user. They can override with their own key or switch providers via the AI settings UI.

---

## 3. Extractors

### 3a. CSV Extractor

**Input:** Raw CSV text (from file upload or paste)
**Output:** `{ headers: string[], rows: Record<string, string>[] }`

Implementation:
- Use a lightweight CSV parser (e.g. `papaparse` — already well-known, handles edge cases like quoted fields, different delimiters)
- Detect delimiter automatically (comma, semicolon, tab, pipe)

### 3b. CSV Column Mapper (LLM-powered)

After parsing the raw CSV, we need to figure out which column maps to which field. Two strategies, tried in order:

**Strategy 1 — LLM (if API key available)**

Send the headers + 2-3 sample rows to the LLM. This is a tiny call (~200 tokens in, ~100 out).

```
System: You map CSV columns to a trading journal schema. Return JSON only.

User: Map these CSV columns to our schema fields.

Schema fields (required): symbol, side, date, quantity, price
Schema fields (optional): time, orderId, companyName, currency, orderType, commission, totalValue, stockCode

CSV headers: ["日期", "订单号", "股票代码", "股票名称", "货币", "买卖方向", "委托价", "数量", "成交价", "订单类型"]
Sample row: ["2023-01-04 00:00:00", "10518036", "HK 01810", "XIAOMI-W", "HKD", "买入", "11.380", "1000", "11.380", "增强限价盘"]

Return: { "mapping": { "日期": "date", "订单号": "orderId", ... }, "sideValues": { "买入": "BUY", "卖出": "SELL" } }
```

This handles **any language** — Chinese, Japanese, German, etc. — because the LLM understands semantics, not just string matching.

**Strategy 2 — Alias matching (offline fallback)**

If no API key is configured, fall back to the English alias table (see Section 4). This covers the common case of English-language CSVs.

**Either way**, the result is shown in the column mapping UI for the user to confirm/override.

### 3c. Image Extractor (Vision LLM)

**Input:** Image file (PNG, JPG, screenshot)
**Output:** Same `{ headers, rows }` format as CSV extractor

Implementation via ai-connect's vision support:
- Convert image to base64
- Call `generateTextWithImage()` with a structured extraction prompt
- Prompt instructs the LLM to:
  - Extract column headers and all data rows
  - Skip cancelled/rejected orders (only include "Fully Executed" or similar)
  - Return JSON in `{ headers, rows }` format
- Parse the JSON response, feed into column mapper (same as CSV)

**Why LLM over Tesseract.js:**
- Table OCR is notoriously unreliable with Tesseract — column alignment breaks, numbers get mangled
- Vision LLMs understand table structure semantically
- Can also filter out noise (cancelled orders, UI chrome)
- Trade-off: requires API key + network, but the accuracy difference is massive

### 3d. TLG Extractor (existing)

The existing `parseTLGFile()` already works. We wrap it to output `NormalizedTransaction[]` directly, bypassing the mapper since TLG fields map 1:1.

### 3e. Paste Extractor (bonus, easy win)

Users can copy-paste a table from a webpage or spreadsheet. Detect tab-separated or whitespace-separated data and parse like CSV with tab delimiter. This is free since it reuses the CSV extractor.

---

## 4. Column Mapper (alias fallback + manual override)

The alias table is the **offline fallback** when no LLM is available. When an LLM is available, Section 3b handles mapping instead. Both paths feed into the same manual override UI.

### Alias Table (English only, offline)

```ts
const COLUMN_ALIASES: Record<keyof NormalizedTransaction, string[]> = {
  symbol:      ['symbol', 'ticker', 'stock', 'stock name', 'instrument', 'name', 'security'],
  side:        ['side', 'action', 'b/s', 'buy/sell', 'type', 'direction', 'trade type'],
  date:        ['date', 'trade date', 'execution date', 'create date', 'create date & time', 'datetime', 'time'],
  quantity:    ['quantity', 'qty', 'shares', 'volume', 'size', 'order quantity', 'confirmed quantity', 'lots'],
  price:       ['price', 'executed price', 'exec price', 'avg price', 'fill price', 'average price', 'trade price'],
  time:        ['time', 'execution time', 'trade time'],
  orderId:     ['order id', 'trade id', 'id', 'ref', 'reference', 'order no'],
  companyName: ['company', 'company name', 'stock name', 'name', 'description'],
  currency:    ['currency', 'ccy', 'cur'],
  orderType:   ['order type', 'type', 'order kind'],
  commission:  ['commission', 'fee', 'fees', 'brokerage'],
  stockCode:   ['stock code', 'code', 'isin', 'sedol'],
  totalValue:  ['total', 'total value', 'amount', 'value', 'net amount', 'consideration'],
};
```

Match by normalizing both header and alias to lowercase, stripping whitespace/punctuation, then checking for inclusion.

### Side Value Normalization

```ts
const BUY_VALUES = ['buy', 'b', 'buytoopen', 'buytoclose', 'long', 'bought'];
const SELL_VALUES = ['sell', 's', 'selltoopen', 'selltoclose', 'short', 'sold'];
```

When using LLM mapping, the LLM also returns `sideValues` (e.g. `{"买入": "BUY", "卖出": "SELL"}`) so we can map non-English values.

### Date Parsing

Use a flexible parser that handles:
- `2023-01-04 00:00:00` (ISO-ish with time)
- `01/04/2023` (US)
- `04/01/2023` (EU — ambiguous, ask user)
- `20230104` (compact, existing TLG format)
- `Jan 4, 2023`

If the date column includes time, extract it into the `time` field too.

Store internally as `YYYYMMDD` (matching existing schema).

### Manual Override UI

Shown after both LLM and alias-based detection. Pre-populated with detected mappings:

```
┌──────────────────────────────────────────────────────┐
│  Column Mapping                                       │
│                                                       │
│  Your Column          →  Maps To                      │
│  ─────────────────────────────────────────            │
│  "Date"               →  [Date        ▼]  ✓ auto     │
│  "Order ID"           →  [Order ID    ▼]  ✓ auto     │
│  "Stock Name"         →  [Symbol      ▼]  ✓ auto     │
│  "Currency"           →  [Currency    ▼]  ✓ auto     │
│  "Action"             →  [Side        ▼]  ✓ auto     │
│  "Order Price"        →  [— skip —    ▼]  (manual)   │
│  "Quantity"           →  [Quantity    ▼]  ✓ auto     │
│  "Executed Price"     →  [Price       ▼]  ✓ auto     │
│  "Order Type"         →  [Order Type  ▼]  ✓ auto     │
│                                                       │
│  [Preview 5 rows ▼]                                   │
│  ┌─────────────────────────────────────────────┐      │
│  │ XIAOMI-W | BUY | 2023-01-04 | 1000 | 11.38 │      │
│  │ XIAOMI-W | BUY | 2023-01-05 | 4800 | 11.68 │      │
│  │ ...                                          │      │
│  └─────────────────────────────────────────────┘      │
│                                                       │
│               [ Cancel ]  [ Import 47 trades ]        │
└──────────────────────────────────────────────────────┘
```

Each dropdown shows: all `NormalizedTransaction` field names + "— skip —" option. Auto-detected mappings are pre-selected with a checkmark. User can override any mapping.

---

## 4. Preview & Validation

Before importing, show the user:

1. **Row count** — "47 trades found"
2. **Date range** — "Jan 4, 2023 → Feb 6, 2026"
3. **Symbols** — "XIAOMI-W" (pill badges)
4. **Sample table** — first 5 rows in final mapped format
5. **Warnings:**
   - Rows missing required fields (highlighted in red, excluded from import)
   - Duplicate detection (same symbol + date + time + qty already in DB)
   - Ambiguous date format detected (ask user: "Is 01/02/2023 Jan 2 or Feb 1?")

User can:
- Toggle individual rows on/off
- Edit the account name/ID for this import batch
- Proceed to import or go back to fix mapping

---

## 5. TransactionRecord Conversion

`NormalizedTransaction` → `TransactionRecord`:

```ts
function toTransactionRecord(
  n: NormalizedTransaction,
  accountId: string,
  index: number
): TransactionRecord {
  const dateStr = parseToYYYYMMDD(n.date);
  const time = n.time || extractTime(n.date) || '00:00:00';

  return {
    tradeId: n.orderId || `${accountId}-${dateStr}-${index}`,
    accountId,
    symbol: n.symbol,
    companyName: n.companyName || n.symbol,
    exchanges: n.exchanges || '',
    side: inferOpenClose(n.side, n.symbol, /* position state */),
    orderType: n.orderType || 'MARKET',
    date: dateStr,
    time,
    currency: n.currency || 'USD',
    quantity: n.side === 'BUY' ? n.quantity : -n.quantity,
    multiplier: 1,
    price: n.price,
    totalValue: n.totalValue ?? (n.side === 'BUY' ? n.quantity * n.price : -(n.quantity * n.price)),
    commission: n.commission || 0,
    feeMultiplier: 1,
  };
}
```

### Account Handling

For non-TLG imports, create a synthetic `AccountRecord`:
- `accountId`: User-provided name or auto-generated from filename (e.g. `"csv-xiaomi-20260212"`)
- `name`: User-provided or filename
- Stored in DB same as TLG accounts

---

## 6. Updated DropZone / Import Page

### File Type Support

Expand the DropZone to accept:
- `.tlg` — existing flow (unchanged)
- `.csv` / `.tsv` / `.txt` — CSV extractor
- `.png` / `.jpg` / `.jpeg` / `.webp` — Image extractor
- Paste from clipboard (Ctrl+V) — paste extractor

The `accept` attribute becomes: `.tlg,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp`

### Import Flow (updated)

```
1. User drops/selects file (or pastes)
2. Detect type by extension or content
3. Route to appropriate extractor
   - .tlg → TLG parser (existing, import directly as before)
   - .csv → CSV extractor → column mapper UI
   - image → check for API key → Vision LLM → column mapper UI
   - paste → CSV extractor (tab delimiter) → column mapper UI
4. Show column mapping screen (skip for .tlg)
5. Show preview & validation
6. User confirms → import to IndexedDB
7. Success screen with count + link to journal
```

### AI Provider Setup

The app uses ai-connect's `AIProviderSelector` component for provider configuration. The recommended flow:

**If `NEXT_PUBLIC_OPENROUTER_API_KEY` env var is set:**
- Auto-configure OpenRouter with `google/gemini-2.0-flash-exp:free` — no user action needed
- Works for both CSV mapping and image extraction
- User can override in Settings page

**If no env var (or user wants to change):**
- Settings page embeds `<AIProviderSelector />` from ai-connect
- User picks provider (OpenRouter recommended — free models), enters API key
- Config persists in localStorage via ai-connect's built-in storage

**If no AI configured at all:**
- CSV import falls back to alias matching (English only) + manual column mapping
- Image import shows a prompt to configure AI in Settings first

---

## 7. File Structure

```
packages/ai-connect/                    # Existing package — contributions here
  src/
    types.ts                            # Add 'openrouter' to LLMProvider
    providers/index.ts                  # Add OpenRouter models + provider entry
    services/aiService.ts               # Add openrouter case + generateTextWithImage()
    hooks/useAIVisionService.ts         # NEW: hook for vision/image calls

lib/
  import/
    types.ts              # NormalizedTransaction, ExtractedData, ColumnMapping
    csv-extractor.ts      # Parse CSV → { headers, rows }
    llm-mapper.ts         # LLM-powered column mapping (any language)
    alias-mapper.ts       # Offline alias-based column mapping (English)
    image-extractor.ts    # Vision LLM → { headers, rows } (uses ai-connect)
    date-parser.ts        # Flexible date parsing → YYYYMMDD
    side-inferrer.ts      # BUY/SELL → BUYTOOPEN/SELLTOCLOSE with position tracking
    normalizer.ts         # Apply mapping: rows → NormalizedTransaction[]
    converter.ts          # NormalizedTransaction → TransactionRecord

components/
  import/
    DropZone.tsx          # Updated: accept more file types
    ColumnMapper.tsx      # Mapping UI with dropdowns + preview
    ImportPreview.tsx     # Validation, row toggle, confirm

app/(journal)/
  import/page.tsx         # Updated: multi-step import flow
  settings/page.tsx       # NEW: AI provider settings (uses AIProviderSelector)
```

---

## 8. Dependencies

### Trading diary app
- **papaparse** — robust CSV parsing with auto-delimiter detection (~7KB gzipped)
- **packages/ai-connect** — already local, just wire it up

### Contributions to ai-connect
- **@openrouter/ai-sdk-provider** — official Vercel AI SDK provider for OpenRouter

---

## 9. Scope & Phases

### Phase 0 — ai-connect contributions (prerequisite)
- Add OpenRouter provider to ai-connect (types, models, factory)
- Add vision/image support (`generateTextWithImage`, `useAIVisionService`)
- Install `@openrouter/ai-sdk-provider`
- Test with free model + the OpenRouter API key in `.env.local`

### Phase 1 — CSV Import with LLM mapping
- CSV extractor (papaparse, auto-delimiter)
- LLM-powered column mapping (any language, via ai-connect)
- Alias-based fallback (English, offline)
- Column mapping review UI
- Preview with validation
- Import to IndexedDB
- Side inference (BUY/SELL → open/close)
- AI settings page (uses `AIProviderSelector` from ai-connect)

### Phase 2 — Image Import
- Vision LLM extraction (uses ai-connect vision support)
- Image → structured data → column mapper (same UI as CSV)
- Support for multi-page screenshots (process each image)

### Phase 3 — Polish
- Clipboard paste support
- Duplicate detection
- Import history (which files were imported when)
- Saved mappings (remember column mapping per broker/format)
- Batch import (multiple files at once)

---

## 10. Open Questions

1. **Quantity sign convention** — Currently TLG gives positive qty for buys, negative for sells. The CSVs give unsigned qty with a separate Action column. The converter handles this, but should we update the schema to always store unsigned qty + side? (Recommendation: no, keep existing convention, handle in converter.)

2. **Stock code vs symbol** — The CSVs have both "Stock Code" (e.g. `HK 01810`) and "Stock Name" (e.g. `XIAOMI-W`). Which should map to `symbol`? (Recommendation: use stock name as symbol since it's more recognizable, store stock code in `exchanges` field.)

3. **Cancelled orders** — Screenshots include cancelled/rejected orders. The CSVs appear pre-filtered to executed only. Should the image extractor filter these out? (Recommendation: yes, prompt the LLM to skip non-executed orders. Also add a "Status" filter in preview UI.)

4. **Commission data** — The example CSVs don't include commission. Default to 0, but surface a note in the preview: "No commission data found — P&L calculations will show gross only."
