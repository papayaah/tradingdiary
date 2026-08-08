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

All import paths funnel into one intermediate format (`NormalizedTransaction[]`), which then gets mapped to the existing `TransactionRecord` and stored in IndexedDB.

### Input Methods (all first-class)

Users can get data into the app via **any** of these methods:

| Method | What it handles |
|--------|----------------|
| **File drop / browse** | `.tlg`, `.csv`, `.tsv`, `.txt`, `.png`, `.jpg`, `.jpeg`, `.webp` |
| **Clipboard paste (text)** | Tab-separated or comma-separated text copied from a spreadsheet, web table, or plain text |
| **Clipboard paste (image)** | Screenshot pasted via Ctrl+V / Cmd+V — e.g. snip of a brokerage trade history |

All three methods are supported from day one — clipboard paste is **not** a secondary feature.

### Pipeline

```
 CLIENT (browser)                              SERVER (Next.js API routes)
 ────────────────                              ────────────────────────────

 Input
 ├─ File/.csv/.tsv/.txt  ─┐
 ├─ Clipboard paste (text) ┤──▶ CSV Extractor (papaparse)
 │                         │         │
 │                         │    { headers, sampleRows }
 │                         │         │
 │                         │         ├──▶ POST /api/ai/map-columns ──▶ LLM (OpenRouter)
 │                         │         │         │
 │                         │         │    { mapping, sideValues }
 │                         │         │
 │                         │         └──▶ Alias Mapper (offline fallback)
 │                         │
 ├─ File/.png/.jpg/.webp  ─┤
 ├─ Clipboard paste (image)┤──▶ POST /api/ai/extract-image ──▶ Vision LLM (OpenRouter)
 │                         │         │
 │                         │    { headers, rows }
 │                         │
 └─ File/.tlg             ─────▶ TLG Extractor (existing parser, client-only)
                           │
                           ▼
                    { headers, rows } + mapping
                           │
                           ▼
                    ┌─────────────┐
                    │  Preview UI  │  (user reviews, corrects mapping)
                    └──────┬──────┘
                           │  confirmed
                           ▼
                    ┌─────────────┐
                    │   Importer   │  (→ TransactionRecord → IndexedDB)
                    └─────────────┘
```

**Key architecture decision:** LLM calls go through Next.js API routes (server-side) so API keys are never exposed in the browser. CSV parsing and TLG parsing happen entirely client-side — no server needed for those.

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
     // OpenRouter uses OpenAI-compatible API — no extra dependency needed
     const { openai } = await import('@ai-sdk/openai');
     return openai(model, {
       apiKey,
       baseURL: baseUrl || 'https://openrouter.ai/api/v1',
     });
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
5. **No new dependency needed** — uses existing `@ai-sdk/openai` with OpenRouter's base URL (same pattern as Perplexity)

#### Contribution 2: Add vision/image support

Currently `generateText()` only accepts a `prompt: string`. We need image input for screenshot extraction.

Added to `AIService`:

```ts
// New interface
export interface AIVisionCallOptions extends AICallOptions {
  image: string | Uint8Array;  // base64 data URL or raw bytes
  mimeType?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

// New method on AIService
async generateTextWithImage<T = string>(options: AIVisionCallOptions): Promise<AICallResult<T>> {
  // Uses Vercel AI SDK's multimodal message format:
  // messages: [{ role: 'user', content: [
  //   { type: 'image', image: ..., mimeType: ... },
  //   { type: 'text', text: prompt },
  // ]}]
}

// New hook: useAIVisionService
export function useAIVisionService() {
  return { generateTextWithImage, isProcessing, error, config, isConfigured };
}

// Also added to existing useAIService hook
```

Uses the Vercel AI SDK's built-in multimodal support — no new dependencies needed.

### How the trading diary app uses ai-connect

ai-connect is used **server-side** in Next.js API routes, not directly in the browser. This keeps API keys secure.

```ts
// app/api/ai/map-columns/route.ts (server-side)
import { createVercelAIModel } from '@/packages/ai-connect';
import { generateText } from 'ai';

const model = await createVercelAIModel({
  provider: 'openrouter',
  model: 'google/gemini-2.0-flash-exp:free',
  apiKey,  // from x-api-key header or env var
});

const result = await generateText({ model, prompt: '...', temperature: 0 });
```

```ts
// Client-side — thin fetch wrappers, no direct LLM calls
import { mapColumnsWithLLM } from '@/lib/import/utils/llm-mapper';
import { extractFromImage } from '@/lib/import/utils/image-extractor';

// CSV column mapping:
const { mapping, sideValues } = await mapColumnsWithLLM(headers, sampleRows, userApiKey);

// Image extraction:
const { headers, rows } = await extractFromImage(base64Screenshot, userApiKey);
```

### Default provider: OpenRouter (free)

OpenRouter is the only supported provider for now (simplicity). Users bring their own API key — free tier is available at https://openrouter.ai/keys.

Optionally, a server-side default key can be set in `.env.local`:
```
OPENROUTER_API_KEY=sk-or-v1-...
```

If present, users don't need to enter their own key. But most deployments should have users provide their own key in the Settings page.

---

## 3. Extractors

Broker-specific adapters run before the generic mapper. The registry detects formats from
their contents and currently recognizes IBKR TLG/Flex XML/Flex CSV, Schwab transaction CSV,
Fidelity account-history CSV, Robinhood account-activity CSV, Webull order-history CSV, and
eSignal trade logs. Unknown delimited files continue through the generic mapping workflow.

### 3a. CSV / Text Extractor

**Input:** Raw text — from file upload (.csv/.tsv/.txt) OR clipboard paste (Ctrl+V)
**Output:** `{ headers: string[], rows: Record<string, string>[] }`

Sources:
- **File drop/browse**: User drops or selects a `.csv`, `.tsv`, or `.txt` file
- **Clipboard paste**: User copies a table from a spreadsheet (Excel, Google Sheets), web page, or plain text and presses Ctrl+V / Cmd+V in the import area

Both sources produce raw text. The extractor doesn't care where the text came from.

Implementation:
- Use a lightweight CSV parser (e.g. `papaparse` — already well-known, handles edge cases like quoted fields, different delimiters)
- Detect delimiter automatically (comma, semicolon, tab, pipe)
- For clipboard text: spreadsheets typically copy as tab-separated; web tables may copy as tab or space-separated

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

**Input:** Image data — from file upload (.png/.jpg/.webp) OR clipboard paste (Ctrl+V / Cmd+V of a screenshot)
**Output:** Same `{ headers, rows }` format as CSV extractor

Sources:
- **File drop/browse**: User drops or selects an image file
- **Clipboard paste (image)**: User takes a screenshot (e.g. Cmd+Shift+4 on Mac, Win+Shift+S on Windows) and pastes directly into the import area. The browser's `paste` event provides the image as a `Blob` in `clipboardData.items`.

Both sources produce image data (File/Blob). The extractor doesn't care where it came from.

Implementation via ai-connect's vision support:
- Convert image to base64 data URL
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

### 3d. Broker adapters and TLG extraction

Each adapter owns detection, broker-specific filtering, field semantics, and normalization.
The IBKR adapter wraps `parseTLGFile()` for supported stock and futures TLG records and also
handles Flex Query XML and CSV trades. Unsupported or incomplete rows are skipped with a
warning rather than silently coerced into trades.

### 3e. Clipboard Detection Logic

When the user presses Ctrl+V / Cmd+V in the import area, the DropZone inspects `clipboardData`:

```ts
function handlePaste(e: ClipboardEvent) {
  // Check for image first (higher priority)
  const imageItem = Array.from(e.clipboardData.items)
    .find(item => item.type.startsWith('image/'));

  if (imageItem) {
    const blob = imageItem.getAsFile();
    // → Route to Image Extractor (3c)
    return;
  }

  // Check for text (CSV/TSV/tab-separated)
  const text = e.clipboardData.getData('text/plain');
  if (text?.trim()) {
    // → Route to CSV/Text Extractor (3a)
    return;
  }
}
```

Priority: image > text (if both are on the clipboard, prefer the image since it's more likely the user's intent when pasting a screenshot).

---

## 4. API Routes (server-side LLM proxy)

LLM calls are proxied through Next.js API routes so that API keys stay server-side. The client never calls OpenRouter directly.

### API Key Flow

```
 ┌─────────────────────────────────┐
 │ Server env: OPENROUTER_API_KEY  │  ← default key (server-only, no NEXT_PUBLIC_ prefix)
 └────────────┬────────────────────┘
              │ fallback
              ▼
 ┌─────────────────────────────────┐
 │ User's key from Settings page   │  ← stored in localStorage, sent via x-api-key header
 └────────────┬────────────────────┘
              │ takes priority if present
              ▼
         API route uses whichever key is available
```

- **`OPENROUTER_API_KEY`** (no `NEXT_PUBLIC_` prefix) — server-only env var, never sent to the browser
- User can enter their own key in the Settings page → stored in localStorage → sent to API routes via `x-api-key` request header
- API route: if `x-api-key` header is present, use it; otherwise fall back to env var
- If neither exists, return 401 with a message to configure an API key in Settings

### `POST /api/ai/map-columns`

Maps CSV column headers to `NormalizedTransaction` fields using an LLM. Supports any language.

```ts
// Request
{
  headers: string[];              // e.g. ["日期", "股票名称", "买卖方向", ...]
  sampleRows: Record<string, string>[]; // 2-3 rows for context
}

// Response
{
  mapping: Record<string, string>;    // { "日期": "date", "股票名称": "symbol", ... }
  sideValues: Record<string, string>; // { "买入": "BUY", "卖出": "SELL" }
}
```

Implementation:
```ts
// app/api/ai/map-columns/route.ts
import { createVercelAIModel } from '@/packages/ai-connect';
import { generateText } from 'ai';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key') || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 401 });
  }

  const { headers, sampleRows } = await request.json();

  const model = await createVercelAIModel({
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
    apiKey,
  });

  const result = await generateText({
    model,
    system: 'You map CSV columns to a trading journal schema. Return JSON only.',
    prompt: `Map these CSV columns to our schema fields.

Schema fields (required): symbol, side, date, quantity, price
Schema fields (optional): time, orderId, companyName, currency, orderType, commission, totalValue, stockCode

CSV headers: ${JSON.stringify(headers)}
Sample row: ${JSON.stringify(sampleRows[0])}

Return: { "mapping": { "<header>": "<field>", ... }, "sideValues": { "<value>": "BUY"|"SELL", ... } }`,
    temperature: 0,
  });

  const parsed = JSON.parse(result.text);
  return NextResponse.json(parsed);
}
```

### `POST /api/ai/extract-image`

Extracts tabular trade data from a screenshot using Vision LLM.

```ts
// Request
{
  image: string;  // base64 data URL ("data:image/png;base64,...")
}

// Response
{
  headers: string[];
  rows: Record<string, string>[];
}
```

Implementation:
```ts
// app/api/ai/extract-image/route.ts
import { createVercelAIModel } from '@/packages/ai-connect';
import { generateText } from 'ai';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key') || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 401 });
  }

  const { image } = await request.json();

  const model = await createVercelAIModel({
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
    apiKey,
  });

  const result = await generateText({
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', image },
        { type: 'text', text: `Extract trade data from this screenshot.
Only include fully executed orders (skip cancelled/rejected).
Return JSON: { "headers": [...], "rows": [{ "<header>": "<value>", ... }, ...] }
Return JSON only, no markdown fences.` },
      ],
    }],
    temperature: 0,
  });

  const parsed = JSON.parse(result.text);
  return NextResponse.json(parsed);
}
```

### Client-side helpers

Thin wrappers that call the API routes:

```ts
// lib/import/utils/llm-mapper.ts
export async function mapColumnsWithLLM(
  headers: string[],
  sampleRows: Record<string, string>[],
  apiKey?: string
): Promise<{ mapping: Record<string, string>; sideValues: Record<string, string> }> {
  const res = await fetch('/api/ai/map-columns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify({ headers, sampleRows }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// lib/import/utils/image-extractor.ts
export async function extractFromImage(
  imageBase64: string,
  apiKey?: string
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const res = await fetch('/api/ai/extract-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
```

---

## 5. Settings Page (API Key Configuration)

### UI

The Settings page lives at `/settings` and lets users configure their OpenRouter API key.

```
┌──────────────────────────────────────────────────────┐
│  AI Settings                                          │
│                                                       │
│  Provider: OpenRouter (free models available)         │
│                                                       │
│  API Key:  [sk-or-v1-••••••••••••••••••••]  [Save]   │
│                                                       │
│  ✓ Key saved. Using free model: Gemini 2.0 Flash      │
│                                                       │
│  Get a free API key at: https://openrouter.ai/keys    │
│                                                       │
│  ─────────────────────────────────────────            │
│  Status:                                              │
│  • Server default key: ✓ configured                   │
│  • Your personal key:  ✓ saved (takes priority)       │
│                                                       │
│  Tip: Without an API key, CSV import falls back to    │
│  English-only column matching. Image import requires  │
│  an API key.                                          │
└──────────────────────────────────────────────────────┘
```

### Key Storage

- User's key stored in **localStorage** under `tradingdiary:openrouter-api-key`
- Never stored in IndexedDB (keep it separate from trade data)
- Key is sent to API routes via `x-api-key` header (same-origin only)
- A `GET /api/ai/status` endpoint tells the client whether a server default key exists (without revealing it)

### Status endpoint

```ts
// app/api/ai/status/route.ts
export async function GET() {
  return NextResponse.json({
    hasServerKey: !!process.env.OPENROUTER_API_KEY,
    provider: 'openrouter',
    model: 'google/gemini-2.0-flash-exp:free',
  });
}
```

This lets the UI show whether the user needs to provide their own key or if the server default is available.

---

## 6. Column Mapper (alias fallback + manual override)

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

### Input Support

The DropZone accepts three types of input:

| Input Method | Triggers | Routes To |
|-------------|----------|-----------|
| **File drop/browse** (.tlg) | `onDrop` / `<input>` | TLG Extractor (existing) |
| **File drop/browse** (.csv/.tsv/.txt) | `onDrop` / `<input>` | CSV/Text Extractor → Mapper |
| **File drop/browse** (.png/.jpg/.webp) | `onDrop` / `<input>` | Image Extractor (Vision LLM) → Mapper |
| **Clipboard paste (text)** | `onPaste` → `getData('text/plain')` | CSV/Text Extractor → Mapper |
| **Clipboard paste (image)** | `onPaste` → `items[type='image/*']` | Image Extractor (Vision LLM) → Mapper |

The file input `accept` attribute: `.tlg,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp`

The DropZone UI should clearly communicate all three methods:
```
┌─────────────────────────────────────────────────┐
│                                                   │
│      Drop files here, browse, or paste            │
│                                                   │
│   📄 CSV / TSV / TXT    🖼️ Screenshots (PNG/JPG)  │
│   📋 Paste from clipboard (Ctrl+V / Cmd+V)       │
│   📁 TLG (existing format)                        │
│                                                   │
│              [ Browse Files ]                     │
│                                                   │
└─────────────────────────────────────────────────┘
```

### Import Flow

```
1. User drops file, browses for file, or pastes from clipboard
2. Detect type:
   - File: by extension (.tlg / .csv / .png etc.)
   - Paste: by clipboardData content (image items vs text)
3. Route to appropriate extractor:
   - .tlg → TLG parser (existing, import directly as before)
   - .csv/.tsv/.txt or pasted text → CSV/Text Extractor → Column Mapper UI
   - .png/.jpg/.webp or pasted image → Vision LLM → Column Mapper UI
4. Show column mapping screen (skip for .tlg)
5. Show preview & validation
6. User confirms → import to IndexedDB
7. Success screen with count + link to journal
```

### AI Provider Setup

LLM calls go through server-side API routes (see Section 4). The API key flow:

**User enters their API key in Settings page (`/settings`):**
- Key is stored in localStorage and sent to API routes via header
- Works for both CSV column mapping and image extraction
- OpenRouter recommended — free models like Gemini 2.0 Flash cost nothing

**If no API key configured:**
- CSV import falls back to alias matching (English only) + manual column mapping
- Image import shows a prompt: "To import from screenshots, add your OpenRouter API key in Settings. It's free!"
- A banner on the import page links to Settings if no key is detected

---

## 7. File Structure

```
packages/ai-connect/                    # Git submodule — contributions done (Phase 0 ✅)
  src/
    types.ts                            # ✅ 'openrouter' added to LLMProvider
    providers/index.ts                  # ✅ OpenRouter models + provider entry
    services/aiService.ts               # ✅ OpenRouter case + generateTextWithImage()
    hooks/useAIVisionService.ts         # ✅ Hook for vision/image calls
    hooks/useAIService.ts               # ✅ Added generateTextWithImage wrapper

app/api/ai/                             # Server-side LLM proxy routes
  map-columns/route.ts                  # POST: CSV header → NormalizedTransaction field mapping
  extract-image/route.ts                # POST: screenshot → { headers, rows } via Vision LLM
  status/route.ts                       # GET: check if server default key exists

lib/
  import/
    registry.ts                   # Content-based broker adapter selection
    brokers/
      ibkr/                       # TLG and Flex Query CSV/XML
      schwab/                     # Transaction-history CSV
      fidelity/                   # Account-history CSV
      robinhood/                  # Account-activity CSV
      webull/                     # Order-history CSV
      esignal/                    # Semicolon-delimited trade log
    core/values.ts                # Shared header/value/date normalization
    config/column-aliases.ts      # Generic offline mapping aliases
    utils/csv-extractor.ts        # Generic CSV/TSV/pasted text parser
    utils/llm-mapper.ts           # Client helper for AI mapping
    utils/image-extractor.ts      # Client helper for image extraction
    types.ts                      # Shared import domain types
    alias-mapper.ts               # Generic offline column mapping
    converter.ts                  # NormalizedTransaction → TransactionRecord

components/
  import/
    DropZone.tsx          # Updated: file drop + browse + clipboard paste (text & image)
    ColumnMapper.tsx      # Mapping UI with dropdowns + preview
    ImportPreview.tsx     # Validation, row toggle, confirm
  settings/
    APIKeyInput.tsx       # API key input with save/validate/status

app/(journal)/
  import/page.tsx         # Updated: multi-step import flow
  settings/page.tsx       # NEW: API key settings + status display
```

---

## 8. Dependencies

### Trading diary app
- **papaparse** — robust CSV parsing with auto-delimiter detection (~7KB gzipped)
- **packages/ai-connect** — git submodule, used server-side in API routes via `createVercelAIModel`
- **ai** (Vercel AI SDK) — already a dependency of ai-connect, used in API routes for `generateText`

### ai-connect (no new dependencies needed)
- OpenRouter uses existing `@ai-sdk/openai` with a custom base URL
- Vision support uses Vercel AI SDK's built-in multimodal message format

### Environment variables
- **`OPENROUTER_API_KEY`** — server-only env var (no `NEXT_PUBLIC_` prefix), optional default key in `.env.local`

---

## 9. Scope & Phases

### Phase 0 — ai-connect contributions ✅ DONE
- ✅ Added OpenRouter provider (types, models, factory via `@ai-sdk/openai` + base URL)
- ✅ Added vision/image support (`generateTextWithImage`, `useAIVisionService`)
- ✅ No new dependencies needed (reuses `@ai-sdk/openai`)
- ✅ OpenRouter API key stored in `.env.local`
- ✅ Updated Storybook stories for OpenRouter
- ✅ ai-connect set up as git submodule

### Phase 1 — CSV + Text Import (file & clipboard paste)
- **Settings page** (`/settings`) — API key input, save to localStorage, status display
- **`GET /api/ai/status`** — check if server default key exists
- **`POST /api/ai/map-columns`** — server-side LLM proxy for column mapping
- CSV/Text extractor (papaparse, auto-delimiter)
- DropZone: accept file drop, file browse, AND clipboard paste (text)
- Clipboard paste detection (`onPaste` → `getData('text/plain')`)
- LLM-powered column mapping (any language, via API route → OpenRouter)
- Alias-based fallback (English, offline — no API key needed)
- Column mapping review UI
- Preview with validation
- Import to IndexedDB
- Side inference (BUY/SELL → open/close)

### Phase 2 — Image Import (file & clipboard paste)
- **`POST /api/ai/extract-image`** — server-side Vision LLM proxy
- DropZone: accept image file drop AND clipboard paste (image/screenshot)
- Clipboard paste detection (`onPaste` → `clipboardData.items` with `type='image/*'`)
- Image → structured data → column mapper (same UI as CSV)
- Support for multi-page screenshots (process each image)

### Phase 3 — Polish
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
