# Pattern Detection Catalog and Expansion

## Status

Draft — implementation started. The five baseline detectors exist. Typed,
server-owned detector settings have started with Range Breakout; broader
catalog-expansion work remains planned.

## Summary

The scanner currently detects five short-window price/volume patterns that
feed watchlist alerts. This spec proposes (1) a **category taxonomy** for
labelling patterns, (2) a prioritized **catalog of additional patterns** worth
adding, and (3) the **framework changes** required to support pattern families
the current engine cannot express (rolling indicators and multi-swing
geometric shapes).

This is a catalog and roadmap. It does not commit to building every pattern
listed; it defines the shared vocabulary and the infrastructure that later,
per-pattern work would build on.

Related specs: [Server-Side Market Scanner](./server-side-market-scanner.md)
(the engine and alert pipeline these patterns feed) and
[Scanner Configuration: Server as the Source of Truth](./scanner-config-server-authority.md)
(how the selected pattern is stored and hydrated).

## Background — current state

Pattern detectors live in `lib/scanner/patterns/` (one file per detector, plus
`registry.ts`, `types.ts`, `index.ts`). Each detector implements the
`PatternDefinition` contract in `lib/scanner/patterns/types.ts`:

```ts
interface PatternDefinition<Id> {
  id; name; shortDescription;
  minimumCandles: (context) => number;
  evaluateAt: (candles, index, context) => PatternMatch<Id> | null;
}
```

The engine (`index.ts`) slides `index` across the candle array and calls
`evaluateAt` at each position. Context currently includes
`{ minMovePercent, requiredCount, maxBodyOverlapPercent, settings }`. The typed
`settings` object currently owns Range Breakout lookback, close buffer, and
optional relative-volume confirmation, plus Volume Expansion lookback,
relative-volume multiplier, and minimum baseline coverage. Matches are
**single-candle-anchored** — a `PatternMatch`
carries one `time`, a `bullish | bearish` type, a `change`, and a `message`.

The five current detectors:

| Detector | id | Structure |
| --- | --- | --- |
| Consecutive Move | `consecutive` | N same-colour candles, every body ≥ threshold, monotonic closes, and optional adjacent-body overlap limit |
| Momentum Burst | `momentum-burst` | One candle whose body ≫ recent 10-bar average |
| Range Breakout | `range-breakout` | Close breaks the prior 10-bar high/low |
| Volume Expansion | `volume-expansion` | Volume ≫ configurable recent-bar average |
| Engulfing Reversal | `engulfing-reversal` | Classic bullish/bearish engulfing candle |

### Current settings audit (August 2026)

The settings panel has one common adjustable price filter, two Consecutive
Move-only controls, and typed detector-specific controls for Range Breakout and
Volume Expansion. The UI distinguishes adjustable values from fixed rules so a
preview does not imply that it reproduces the complete detector.

| Detector | Adjustable now | Fixed rules now | Recommended additions |
| --- | --- | --- | --- |
| Consecutive Move | Minimum body on every candle; streak count; maximum adjacent-body overlap | Same-colour candles; progressively higher/lower closes | Minimum total streak move; maximum opposite-wick ratio |
| Momentum Burst | Minimum signal-candle body | 10-bar body baseline; signal body ≥ 1.8× average | Configurable lookback and body multiplier; optional ATR-normalized floor |
| Range Breakout | Minimum breakout-candle body; range lookback; minimum close buffer; optional relative-volume confirmation | Close confirmation beyond prior high/low | One completion per range; optional ATR-normalized buffer |
| Volume Expansion | Minimum signal-candle body; volume lookback; relative-volume multiplier; positive-volume coverage | Average of populated baseline bars | Same-time-of-session baseline; explicit feed capability |
| Engulfing Reversal | Minimum reversing-candle body | Two opposite-colour candles; second body fully contains first | Prior-body floor; engulfing ratio; wick/context filters |

`Bullish` and `Bearish` in the visual guide are preview directions, not live
direction filters. A future real direction filter must be persisted through the
same server-authoritative configuration path as every other scan setting.

Tiingo historical intraday requests must explicitly include
`columns=open,high,low,close,volume`; otherwise Tiingo omits volume and the
normalizer turns it into zero. Zero-volume force-filled/no-trade bars remain
valid price bars but cannot establish a Volume Expansion baseline.

Detection is entirely **threshold-based over fixed lookback windows** using
`Math.max`/`Math.min` over slices. There is **no** swing-high/low, pivot,
local-extrema, or line/curve-fitting helper anywhere in the codebase.

Detected patterns feed the server-side watchlist scanner
(`lib/scanner/worker.ts` → alerts). The Watch page draws generic directional
markers for matches and `PatternSelector` contains illustrative mini-previews,
but there is no detector-specific overlay contract. The journal and replay
charts (`components/journal/TradeChart.tsx`,
`components/replay/ReplayChart.tsx`) still render trade buy/sell markers only.
Geometry such as necklines, opening ranges, pivots, channels, and fitted curves
cannot currently be returned by a detector or drawn consistently.

### Current engine constraints

- One global `patternId` is selected for the watchlist. The normalized schema
  stores it on each watch, but the product does not yet support selecting
  multiple detectors or different detectors per symbol.
- `PatternContext` exposes `minMovePercent`, `requiredCount`, and the
  Consecutive Move `maxBodyOverlapPercent` staircase constraint. It does not
  expose interval, asset class, session boundaries, timezone, volume type,
  candle-finality, or a general typed parameter registry.
- Consecutive Move's global 3/4/5-candle choice is persisted in
  `user_watchlists` and materialized onto each `server_watch`, keeping browser
  and server evaluation aligned.
- Matches identify one completion candle. There is no formation range,
  confidence/quality metric, supporting measurements, or drawing anchors.
- The engine can technically calculate indicators inside `evaluateAt`, but
  doing so repeatedly for every index would duplicate rolling work. Indicator
  precomputation is a performance requirement, not a strict expressibility
  requirement.
- Session-relative patterns cannot rely on a candle array alone unless that
  array includes a well-defined session boundary and the preceding session
  data they need.

## Goals

- Establish a stable **category** label for every pattern, usable in the
  registry, the `PatternSelector` UI, and as a filter.
- Provide a prioritized catalog of additional patterns with a described
  detection approach for each.
- Identify the minimal **framework changes** each new pattern family requires
  so families are built once, not per-pattern.
- Keep new detectors server-safe and unit-testable (Vitest), consistent with
  the existing five.
- Define which detectors are valid for equities, futures, crypto, and forex,
  including what “volume” means for each feed.
- Give every detector typed, validated parameters and deterministic completion
  semantics rather than overloading `minMovePercent`.
- Prevent look-ahead bias and keep live alerts consistent with historical
  replay/backtests.

## Non-goals

- Implementing any specific detector in this spec (each is its own task).
- Drawing patterns on charts. Chart overlays are a separate, currently
  non-existent rendering path; see "Rendering (out of scope)" below.
- Predictive/ML pattern recognition. All patterns here are deterministic,
  rule-based detectors.
- Treating a heuristic geometric match as objective market truth. These
  detectors produce a rule-defined candidate with a measurable quality score.
- Redesigning alert delivery. Deduplication keys may still need to include a
  detector id and completion anchor when multi-pattern selection is added.

## Category taxonomy

Patterns are labelled along a single **category** axis describing *what kind of
pattern it is* (its detection method / structure). This is distinct from the
implementation **complexity tier** (see roadmap), which is a build-order
concept only and is deliberately **not** stored in the data model.

| Category (`category` value) | Defined by | Current members | Proposed additions |
| --- | --- | --- | --- |
| **Candlestick** (`candlestick`) | Shape of 1–3 individual candles (body/wick geometry) | engulfing-reversal | pin bar, doji, inside/outside bar, morning/evening star |
| **Momentum** (`momentum`) | A short run of candles / a burst in movement | consecutive, momentum-burst | acceleration burst, three soldiers/crows |
| **Volume** (`volume`) | Participation or activity relative to a volume baseline | volume-expansion | relative-volume burst, volume climax, price-volume confirmation |
| **Indicator** (`indicator`) | A rolling derived series such as VWAP, EMA, or RSI | — | VWAP reclaim/rejection, MA cross, pullback-to-MA, RSI extreme |
| **Breakout / Level** (`breakout`) | Price crossing a reference level or range | range-breakout | opening-range breakout (ORB), high/low-of-day break, gap up/down |
| **Volatility** (`volatility`) | Compression or expansion in range/dispersion | — | ATR expansion, Bollinger/Keltner squeeze release |
| **Trend Structure** (`trend-structure`) | Continuation or failure around an established trend | — | flag/pennant, pullback continuation, failed breakout |
| **Chart / Geometric** (`chart-geometric`) | Multi-swing shapes needing pivots or curve-fitting | — | double top/bottom, head & shoulders, triangles/wedges, cup & handle, **rounding bottom** |

Proposed type addition in `types.ts`:

```ts
type PatternCategory =
  | 'candlestick'
  | 'momentum'
  | 'volume'
  | 'indicator'
  | 'breakout'
  | 'volatility'
  | 'trend-structure'
  | 'chart-geometric';
```

Add a required `category: PatternCategory` field to `PatternDefinition` and
backfill the five existing detectors. `PatternSelector` may filter or group
presets by category, but it should keep the compact, expandable control rather
than rendering every category card at once.

## Proposed pattern catalog

Each entry: category, detection approach, and any framework prerequisite.

### Candlestick

- **Hammer / Shooting Star** — single candle; long lower (hammer) or upper
  (shooting star) wick relative to a small body. Implement as one configurable
  **Pin Bar** definition with bullish/bearish direction. Reuses
  `candleBodyChange`; add wick-ratio and minimum-range math. Fits
  `evaluateAt` as-is.
- **Doji** — single candle; body is small relative to the full high-low range.
  Require a minimum absolute/ATR-normalized range so a motionless candle is not
  classified as meaningful. Fits as-is.
- **Inside bar** — current bar's high/low inside the prior bar's range. Fits
  as-is (window of 2). The inside bar itself is a setup; a separate
  **Inside-Bar Breakout** should alert only when a later candle breaks the
  mother bar.
- **Outside bar** — current bar's range engulfs the prior bar's range. Fits
  as-is.
- **Morning Star / Evening Star** — three-candle reversal with a strong first
  candle, small indecision candle, and opposite recovery candle. Fits the
  current window engine with body/range tolerances.

### Momentum

- **Acceleration Burst** — consecutive directional candles whose bodies or
  rate of change increase. Fits a fixed lookback and complements the existing
  single-candle Momentum Burst.
- **Three White Soldiers / Three Black Crows** — a stricter named preset over
  the Consecutive Move family, with body-size and wick constraints. Prefer a
  configuration preset over duplicated detector code.

### Volume

- **Relative-Volume Burst** — current volume compared with the same
  time-of-session baseline when historical intraday data is available. This is
  more meaningful than comparing only with the immediately preceding ten bars.
- **Price-Volume Confirmation** — breakout or momentum completion accompanied
  by a configurable multiple of rolling volume.
- **Volume Climax / Exhaustion** — extreme relative activity plus a long wick
  or failed continuation. Requires both volume and candle geometry.

For spot forex, broker-supplied “volume” is commonly tick activity rather than
centralized traded volume. Forex-facing UI should label these as
**Activity Expansion** unless the provider contract explicitly supplies real
volume. Crypto volume is exchange/feed-specific and must not silently combine
baselines from different venues.

### Indicator

These benefit from a **rolling indicator** precomputed once across the candle
window. They can be coded inside the present interface, but doing so at every
index repeats work and makes shared multi-pattern analysis inefficient.

- **VWAP reclaim / rejection** — price crossing back above/below session VWAP.
- **Moving-average cross** — e.g. 9/20 EMA cross.
- **Pullback-to-MA** — price returns to a rising/falling MA and resumes.
- **RSI overbought / oversold** — rolling RSI crosses a threshold.
- **MACD cross / momentum confirmation** — common but lower priority because
  it overlaps EMA/momentum signals and adds more configurable periods.

### Breakout / Level

- **Opening-Range Breakout (ORB)** — break of the first N-minutes' high/low.
  Needs session-relative context (which candles are the opening range), an
  exchange calendar, and a selected opening range such as 5, 15, or 30 minutes.
- **High/Low-of-Day break** — extend `range-breakout` to the full session
  rather than a fixed 10-bar window.
- **Gap up / down** — session open vs. the prior regular-session close beyond a
  threshold. The formula is simple, but it does **not** fit reliably unless the
  input includes the previous session close and a known session boundary.
- **Inside-Bar Breakout** — completion event after price crosses the mother
  bar's high/low; distinct from merely detecting an inside bar.
- **Failed Breakout / Liquidity Sweep** — high/low trades through a reference
  level but closes back inside. High value for reversal alerts and expressible
  once reusable level/session context exists.

### Volatility

- **ATR Expansion** — true range exceeds a multiple of rolling ATR while the
  body meets a directional threshold.
- **Bollinger/Keltner Squeeze Release** — volatility compression followed by a
  close outside the compressed range. Requires rolling-indicator support.

### Trend Structure

- **Pullback Continuation** — established directional slope, controlled
  counter-trend retracement, then resumption through the pullback pivot.
- **Flag / Pennant** — sharp pole, bounded shallow consolidation, then
  continuation. A rough fixed-window detector is possible, but a production
  detector should use range anchors or pivots; classifying it as “no pivots
  required” would create too many ambiguous matches.
- **Support/Resistance Rejection** — touch or small penetration of a confirmed
  level followed by a directional close away from it. Requires a shared level
  model rather than detector-specific duplicated logic.

### Composed signals and named bundles

Some commonly requested “patterns” are better represented as a primary
detector plus confirmation filters instead of another bespoke detector:

- Range breakout **with** relative-volume confirmation.
- Momentum burst **above/below** VWAP.
- Pullback continuation **aligned with** a higher-timeframe trend.
- Engulfing reversal **at** support/resistance.
- ORB **with** minimum ATR expansion.

The engine should eventually support typed `allOf` confirmation composition
and named bundles such as **Breakouts**, **Momentum**, or **Reversals**.
Composition must operate on already-fetched candles/indicators and must not
create additional provider requests. Avoid unrestricted user-authored boolean
expressions in the first release; ship validated presets first.

### Chart / Geometric

All require a shared **pivot / swing-high-low detector** (new infrastructure)
and a **range anchor** (a match spanning many candles, not one).

- **Double top / Double bottom** — two comparable peaks/troughs + neckline
  break. Simplest of this family once pivots exist.
- **Head & Shoulders (+ inverse)** — three swings with the middle most
  extreme + neckline.
- **Triangles / Wedges / Channels** — trendline fitting over swing points.
- **Rounding bottom / Cup & handle** — curvature fitting; fit a parabola /
  quadratic to normalized lows and check for a positive coefficient with
  acceptable fit (e.g. R²), depth, duration, rim symmetry, and breakout
  confirmation over a wide lookback. A positive coefficient alone is not
  sufficient and would produce many false positives. This is the pattern that
  prompted the spec.

## Cross-asset applicability

The price-only algorithms are portable because they operate on normalized
OHLC candles. Portability does not mean that one threshold works equally well
for every asset, interval, venue, or session.

| Pattern family | Equities | Futures | Crypto | Forex | Qualification |
| --- | --- | --- | --- | --- | --- |
| Candlestick | Yes | Yes | Yes | Yes | Use ATR/range-relative tolerances where possible |
| Momentum | Yes | Yes | Yes | Yes | Defaults must be calibrated by interval and volatility |
| Breakout / level | Yes | Yes | Yes | Yes | Requires the correct session and prior-session boundary |
| Volume | Yes | Yes | Venue-specific | Activity proxy | Never merge incompatible volume feeds |
| Indicator | Yes | Yes | Yes | Yes | VWAP meaning depends on the supplied volume |
| Volatility | Yes | Yes | Yes | Yes | ATR/squeeze calculations are naturally cross-asset |
| Trend/geometric | Yes | Yes | Yes | Yes | Wide-window patterns need continuous, gap-aware data |

Additional rules:

- **Equities:** distinguish regular-session, pre-market, and after-hours
  candles. Corporate-action adjustment mode must remain consistent within a
  detection window.
- **Futures:** continuous contracts can contain rollover discontinuities.
  Detectors must either use a back-adjusted series or avoid treating a roll gap
  as a market pattern.
- **Crypto:** runs continuously, but venue-specific OHLCV and volume baselines
  remain part of the feed identity.
- **Forex:** generally runs 24/5. Use bid, ask, or midpoint candles
  consistently, and label tick volume as activity rather than centralized
  traded volume.

## Shared market data, storage, and bandwidth

Pattern expansion must not multiply provider requests by user count or enabled
detector count. Subject to provider entitlements and redistribution terms, two
users watching the same feed, symbol, interval, adjustment mode, and candle
window should share one normalized candle response.

Recommended data flow:

1. Coalesce concurrent requests by a market-data key such as
   `(provider, entitlement group, venue/feed, symbol, base interval,
   adjustment mode, candle window)`.
2. Keep a bounded hot candle window in Redis, typically 240–500 candles with a
   24–48-hour TTL refreshed while actively watched.
3. Compute reusable aggregates and indicators once, then fan out evaluation to
   user-specific sessions, pattern parameters, and thresholds.
4. Persist watch configuration, latest state, and alerts in PostgreSQL. Do not
   permanently duplicate an identical recent-candle array for every user.
5. Refetch recoverable market data after cache loss. Add long-term compressed
   candle storage only if backtesting becomes a product requirement.

The current `server_watch_state.recentCandles` field is bounded, which prevents
unlimited growth, but it still duplicates shared candles per watch. Before
large multi-user rollout, move chart-window ownership toward the shared
market-data cache or store a shared reference. Redis keys must expire
automatically; durable alert/event rows need a separate retention policy.

When the provider and license permit it, fetching a base 1-minute series and
deriving 5/10/15-minute bars internally can reduce upstream requests further.
Derived candles must use deterministic, timezone-aware bucket boundaries.

## Detector configuration contract

`minMovePercent` and `requiredCount` are not enough for the expanded catalog.
Avoid adding unrelated optional fields directly to `PatternContext`. Each
definition should own a typed, validated parameter schema with defaults:

```ts
interface PatternDefinition<Id, Params> {
  id: Id;
  version: number;
  name: string;
  shortDescription: string;
  category: PatternCategory;
  supportedAssets: AssetClass[];
  requiredData: {
    volume: 'not-required' | 'activity-ok' | 'real-required';
    sessionBoundary?: boolean;
    priorSession?: boolean;
    minimumHistory: (params: Params) => number;
  };
  defaultParams: Params;
  validateParams: (input: unknown) => Params;
  evaluateAt: (
    candles: Candle[],
    index: number,
    context: PatternEvaluationContext,
    params: Params,
  ) => PatternMatch<Id> | null;
}
```

Supporting forex requires extending the current `AssetClass` union with
`'forex'`; adding detectors alone does not add forex ingestion, symbol
normalization, or session scheduling.

Examples of detector-owned parameters:

- Pin bar: minimum wick/body ratio, maximum opposite wick, minimum range.
- Momentum burst: baseline lookback and body multiplier.
- Range breakout: lookback, close-confirmation requirement, buffer.
- Volume expansion: lookback and volume/activity multiplier.
- ORB: opening-range minutes, breakout buffer, session.
- EMA cross: fast and slow periods.
- RSI: period, upper/lower thresholds, cross vs. state behavior.
- Geometric patterns: pivot sensitivity, price tolerance, minimum separation,
  maximum duration, confirmation rule, and minimum quality score.

Store the validated parameter object with the watch configuration. A detector
definition change that alters match behavior must bump its algorithm version.
Prefer a **per-detector version** over one global `PATTERN_VERSION` once
detectors evolve independently.

## Detection semantics

Every detector must declare exactly when it alerts:

- **Formation:** the setup exists but has not confirmed.
- **Completion:** the setup crosses its confirmation rule.
- **Invalidation:** the setup is no longer valid.

The initial alert catalog should use **completion alerts**. Formation state may
later appear as a non-notifying watch status.

Live evaluation also needs an explicit candle-finality policy:

- Default: alert on a closed candle for reproducible signals.
- Optional intrabar mode: permit a forming candle to qualify, deduplicate by
  candle plus detector, and clearly label that the signal may disappear before
  close.
- Historical scanning and tests must never read candles after the candidate
  completion index. This is the no-look-ahead rule.

Percentage thresholds should remain available, but ATR-normalized thresholds
are recommended for cross-asset defaults. A fixed `0.25%` has very different
meaning for a quiet forex pair, a small-cap equity, and a volatile crypto pair.

## Framework changes

Ordered by which pattern families unlock them.

1. **Metadata and category fields** (unlocks: cataloguing and UI filtering).
   Add `PatternCategory`, `category`, `supportedAssets`, and `requiredData` to
   `PatternDefinition`; backfill the five current detectors. Small, no
   behavioral change.

2. **Typed detector parameters and server authority** (unlocks: meaningful
   presets). **In progress:** Range Breakout settings now use a validated JSON
   object persisted with both the account configuration and each normalized
   watch. Continue by moving Consecutive Move's existing fields, then Momentum,
   Volume Expansion, and Engulfing settings into the same contract.

3. **Evaluation context** (unlocks: session and cross-asset patterns). Provide
   interval, asset class, session id/boundaries, timezone/exchange calendar,
   feed/venue identity, volume semantics, candle finality, and prior-session
   values. Do not infer these independently inside each detector.

4. **Rolling-indicator support** (unlocks: Indicator and Volatility). Compute
   VWAP/EMA/RSI/ATR/band series once per fetched candle set and reuse them
   across every applicable watch. A detector may declare which series it
   needs. Avoid recomputing a full rolling window at every `evaluateAt` index.

5. **Range-anchored matches + pivot/level helpers** (unlocks: Trend Structure
   and Chart / Geometric). These are coupled changes:
   - `PatternMatch` currently anchors to a single candle `time`. Geometric
     patterns span a range; extend the match to carry a completion time,
     optional `[startTime, endTime]`, key anchors, measurements, and a bounded
     quality score without breaking the single-time consumers.
   - Introduce a shared `lib/scanner/patterns/pivots.ts` helper for
     swing-high/low detection, reused by double top/bottom, head & shoulders,
     triangles, and rounding bottom.
   - Add a reusable session-level model for opening range, prior close,
     high/low of day, and confirmed support/resistance.

6. **Multi-pattern selection and deduplication** (unlocks: useful catalogs).
   A growing catalog is awkward if a user may choose only one detector for the
   entire watchlist. Support `patternSelections[]` per watch or a named preset
   bundle. Deduplicate alerts by watch, detector id, detector version,
   direction, and completion anchor. Two different detectors qualifying on the
   same candle must not suppress each other.

7. **Confirmation composition** (unlocks: high-value named presets). Allow a
   primary detector to consume validated confirmation filters through `allOf`
   semantics. Preserve each component's measurements so the alert explains
   why the composed signal qualified.

8. **Shared-fetch fan-out** (unlocks: scalable multi-pattern analysis). Fetch
   a candle set once per permitted provider/feed/symbol/interval/window, compute
   reusable indicators once, then evaluate every user watch and selected
   detector separately. User thresholds and sessions belong to analysis, not
   the shared market-data cache key unless they change which data must be
   fetched.

## Rendering (out of scope)

The Watch page can show a generic match marker, but drawing a detected shape
(neckline, opening range, saucer curve, trendlines) on all chart surfaces is a
**separate rendering path that does not exist today**. If pattern
visualization is wanted, create its own spec and consume detector-provided
anchors; chart components must not independently rediscover the pattern.

## Feasibility review

All catalog entries are implementable as deterministic heuristics, but they do
not have equal certainty or cost:

| Level | Patterns | Feasibility |
| --- | --- | --- |
| **Straightforward** | pin bar, doji, inside/outside bar, morning/evening star, acceleration, gap calculation | Small fixed windows; low implementation risk once inputs are defined |
| **Moderate** | ORB, HOD/LOD, failed breakout, ATR expansion, VWAP, EMA, RSI, squeeze release | Fully doable; requires session context and/or rolling-series infrastructure |
| **Advanced** | pullback continuation, flag/pennant, double top/bottom, head & shoulders | Doable with pivots and explicit tolerances; requires substantial negative-case testing |
| **Experimental** | triangles/wedges, rounding bottom, cup & handle | Doable as candidate detection, but subjective boundaries and false positives require scoring and backtesting |

“Doable” does not mean “reliable with one formula.” The advanced and
experimental families should launch behind an experimental label until replay
evaluation establishes acceptable precision. They must expose why they matched
(anchors and measurements), not only a bullish/bearish label.

## Testing and acceptance

Every detector ships with:

1. Synthetic bullish and bearish fixtures.
2. Boundary tests immediately below, at, and above every threshold.
3. Negative fixtures that resemble the setup but violate one defining rule.
4. Qualify-later behavior for a forming candle when intrabar mode is supported.
5. Staleness and no-look-ahead tests.
6. NaN, zero-price, zero-volume, missing-volume, duplicate-time, and
   insufficient-history guards.
7. Cross-asset fixtures where the detector claims cross-asset support.
8. A performance benchmark over at least 500 symbols × 500 candles and all
   enabled detectors, using shared indicator precomputation.
9. Replay evaluation against a labeled sample of real historical examples.

Before general release, record per detector and asset class:

- Candidate count and alert frequency.
- Precision on the labeled sample.
- Duplicate/overlap rate with other detectors.
- Provider-data requirements and missing-data rate.
- Evaluation time and memory use.

Tests must compare browser/manual-tester output with worker output for identical
inputs and persisted configuration. A detector is not complete if only its
standalone unit test passes while the server worker uses different parameters.

## Suggested implementation sequence

1. **Correctness prerequisite** — persist Consecutive Move’s required count
   and body-overlap limit, unify client/server session semantics, and test
   worker/manual parity.
2. **Metadata + typed parameters** — category, supported assets, required
   inputs, defaults, validation, and per-detector versions.
3. **Candlestick batch** — pin bar, doji, inside/outside bar, morning/evening
   star. Cheap, popular, and compatible with the current window engine.
4. **Evaluation context + breakout batch** — prior session, ORB, HOD/LOD,
   gap, inside-bar breakout, and failed breakout.
5. **Indicator precomputation + indicator/volatility batch** — VWAP, EMA,
   RSI, ATR expansion, and squeeze release.
6. **Multi-pattern selections, named bundles, and shared analysis fan-out** —
   make the larger catalog useful without multiplying provider requests.
7. **Confirmation composition** — volume-confirmed breakouts, VWAP-filtered
   momentum, and higher-timeframe alignment using validated presets.
8. **Pivot/level helpers + range matches** — shared infrastructure for trend
   and geometric families.
9. **Advanced candidates** — pullback, flag/pennant, double top/bottom, then
   head & shoulders.
10. **Experimental candidates** — triangles/wedges, rounding bottom, and cup &
   handle after labeled replay evaluation.

## Open questions

- What API should detectors use to request precomputed indicator series without
  coupling the engine to a specific indicator library?
- Which formations should expose a non-notifying “forming” state in addition
  to the default completion alert?
- Should `category` be user-facing as a filter in `PatternSelector`, or only
  an internal grouping label?
- Should users select individual detectors, named bundles such as
  “Momentum”/“Breakouts,” or both?
- Are forming-candle alerts allowed globally, per detector, or per watch?
- What historical labeled dataset and precision target are required before an
  advanced detector loses its experimental label?
- Should forex tick volume be exposed to volume detectors under the explicit
  name “activity,” or should those detectors be disabled for forex by default?
