# Automated Chart Pattern Recognition & Visual Overlays

## Status: Draft Specification

This document details the architectural specification and UI/UX design for **Automated Chart Pattern Detection & Visual Overlays** in TradingDiary (inspired by TradingView Auto-Patterns and TrendSpider).

---

## 1. Overview & Objectives

1. **100% Algorithmic & Deterministic**: Calculated using mathematical extrema (pivot highs/lows) and slope geometry without AI dependencies or external API fees.
2. **Instant Browser & Server Execution**: Calculates in sub-5ms on any OHLCV candle series.
3. **TradingView/TrendSpider Style UI**: Draws clean, high-DPI pattern outlines, necklines, support/resistance zones, and breakout target projections directly over Lightweight Charts canvas.
4. **Seamless Scanner Integration**: Clicking a notification or alert log automatically highlights the matching pattern on the chart.

---

## 2. Pattern Detection Math (No AI Required)

### Step A: Pivot Point (Swing Extrema) Finder
For a candle series at index $i$, a candle is a **Swing High** if its High price is greater than all $N$ preceding and succeeding candles ($N=3$ to $5$).

$$\text{Swing High}_i \iff H_i = \max(H_{i-N}, \dots, H_{i+N})$$
$$\text{Swing Low}_i \iff L_i = \min(L_{i-N}, \dots, L_{i+N})$$

```
          Swing High (Peak)
               ▲
              / \
             /   \
  __________/     \__________
```

---

### Step B: Supported Patterns & Geometry Rules

#### 1. ☕ **Cup & Handle**
- **Left Lip ($P_1$)**: Prominent swing high at index $i_1$.
- **Cup Bottom ($B$)**: Curved U-shape of lows dropping $15\%\text{--}45\%$ below $P_1$.
- **Right Lip ($P_2$)**: Swing high returning within $\pm 3\%$ of $P_1$ price level.
- **Handle ($H$)**: Minor downward consolidation (pullback $< 15\%$) after $P_2$.
- **Breakout Level**: Horizontal or slightly sloped line connecting $P_1$ and $P_2$.
- **Target Projection**: $\text{Target Price} = \text{Breakout Price} + (P_1 - B)$.

#### 2. 👤 **Head & Shoulders / Inverse Head & Shoulders**
- **Left Shoulder ($H_1$)**: Peak at price $y_1$.
- **Head ($H_2$)**: Higher peak $y_2 > y_1 \times 1.03$.
- **Right Shoulder ($H_3$)**: Peak $y_3 \approx y_1$ (within $\pm 4\%$).
- **Neckline**: Linear regression line connecting trough low $L_1$ (between $H_1, H_2$) and trough low $L_2$ (between $H_2, H_3$).

#### 3. 📈 **Double Bottom (W) & Double Top (M)**
- **Double Bottom**: Trough $L_1 \approx L_2$ (within $\pm 2\%$) separated by a central rebound peak $P$. Breakout occurs above $P$.
- **Double Top**: Peak $P_1 \approx P_2$ separated by a trough $L$. Breakdown occurs below $L$.

#### 4. 📐 **Support / Resistance & Trendline Channels**
- Fits slope lines across 3+ aligned swing highs (Resistance Line) or 3+ aligned swing lows (Support Line).
- Detects **Ascending/Descending Triangles** and **Bull/Bear Flags**.

---

## 3. UI / UX Design Specification

### A. Chart Action Bar Control
Add a **`✨ Auto Patterns`** button to the chart's top toolbar next to timeframe selectors (`1D`, `1H`, `15M`):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ NVDA · 1D   [ 1D ] [ 1H ] [ 15M ]   [ ✨ Auto Patterns ▼ ]  [ 🔔 Add Alert ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Dropdown Menu Toggles:
- ☑️ **Chart Patterns** *(Cup & Handle, Head & Shoulders, Double Top/Bottom)*
- ☑️ **Support & Resistance Levels** *(Automated Pivot Lines & Channels)*
- ☑️ **Breakout Targets & Stop Projections** *(Shaded Target Boxes)*

---

### B. Visual Canvas Overlays (Lightweight Charts Primitives)

When **Auto Patterns** is active for a chart:

```
           $140 ─── Resistance Line ───────────────────────────── (Dotted Gold)
                 \   Cup Rim (P1)                Right Lip (P2)
                  \    . - - .                    . - - .
                   \ /         \                /        \  <- Handle Box
                    │   CUP     │  ...  ...  ...│ HANDLE │
                    \           /               \        /
                     ` - - - - `                 ` - - - `
```

1. **Pattern Outline (Line / Area Series)**: Smooth semi-transparent curved accent line (`#3B82F6`) tracing the Cup or Shoulder geometry.
2. **Breakout / Neckline Price Line**: Solid or dotted gold line marking the exact entry level.
3. **Floating Canvas Badge**: Floating pill in top-left corner of chart:
   > ☕ **Cup & Handle** · Breakout: **$135.50** · Target: **$152.00** `[Hide]`

---

## 4. Proposed Code Directory Structure

```
lib/chart/patterns/
├── pivots.ts             # Swing high / swing low pivot finder
├── cupAndHandle.ts       # Cup & Handle geometric validator & target projection
├── headAndShoulders.ts   # Head & Shoulders + Inverse H&S detector
├── doubleTopBottom.ts    # W and M pattern detector
├── trendlines.ts         # Linear regression support/resistance finder
└── index.ts              # Unified pattern engine entry point

components/chart/
├── ChartToolbar.tsx      # Includes Auto Patterns toggle dropdown
└── PatternOverlay.tsx    # Lightweight Charts plugin drawing lines & target boxes
```

---

## 5. Implementation Sequence

1. **Phase 1**: Build `lib/chart/patterns/pivots.ts` and `cupAndHandle.ts` detector with Vitest unit tests.
2. **Phase 2**: Create `PatternOverlay.tsx` canvas renderer for Lightweight Charts.
3. **Phase 3**: Add `✨ Auto Patterns` toolbar button in `components/chart/` with localStorage state persistence.
4. **Phase 4**: Connect scanner alert logs so clicking any scanner notification auto-opens the chart with the pattern pre-highlighted!
