import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/meta');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const TEMPLATES_DIR = path.resolve(process.cwd(), 'scripts/templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

// Candlestick SVG generator helper
function generateCandlesSVG(isDark = false) {
  const width = 640;
  const height = 270;
  const topPad = 22;
  const bottomPad = 32;
  const chartHeight = height - topPad - bottomPad;
  const minPrice = 13.15;
  const maxPrice = 13.95;
  const priceToY = (p) => topPad + (1 - (p - minPrice) / (maxPrice - minPrice)) * chartHeight;

  const candles = [
    { time: '09:30', o: 13.58, h: 13.62, l: 13.38, c: 13.44, vol: 140 },
    { time: '09:35', o: 13.44, h: 13.48, l: 13.30, c: 13.34, vol: 180 },
    { time: '09:40', o: 13.34, h: 13.52, l: 13.30, c: 13.50, vol: 240 },
    { time: '09:45', o: 13.50, h: 13.56, l: 13.46, c: 13.54, vol: 110 },
    { time: '09:50', o: 13.54, h: 13.58, l: 13.48, c: 13.52, vol: 90 },
    { time: '09:55', o: 13.52, h: 13.55, l: 13.48, c: 13.53, vol: 70 },
    { time: '10:00', o: 13.53, h: 13.56, l: 13.42, c: 13.47, vol: 120 },
    { time: '10:05', o: 13.47, h: 13.49, l: 13.38, c: 13.42, vol: 130 },
    { time: '10:10', o: 13.42, h: 13.52, l: 13.40, c: 13.50, vol: 150 },
    { time: '10:15', o: 13.50, h: 13.64, l: 13.48, c: 13.62, vol: 220 },
    { time: '10:20', o: 13.62, h: 13.68, l: 13.58, c: 13.65, vol: 310, buy: 13.635 },
    { time: '10:25', o: 13.65, h: 13.72, l: 13.57, c: 13.63, vol: 290, sell: 13.592 },
    { time: '10:30', o: 13.63, h: 13.74, l: 13.61, c: 13.71, vol: 170 },
    { time: '10:35', o: 13.71, h: 13.79, l: 13.69, c: 13.76, vol: 190 },
    { time: '10:40', o: 13.76, h: 13.80, l: 13.74, c: 13.76, vol: 100 },
    { time: '10:45', o: 13.76, h: 13.85, l: 13.75, c: 13.82, vol: 280 },
    { time: '10:50', o: 13.82, h: 13.84, l: 13.70, c: 13.74, vol: 260 },
    { time: '10:55', o: 13.74, h: 13.76, l: 13.64, c: 13.68, vol: 150 },
    { time: '11:00', o: 13.68, h: 13.70, l: 13.60, c: 13.64, vol: 140 },
    { time: '11:05', o: 13.64, h: 13.72, l: 13.62, c: 13.70, vol: 160 },
    { time: '11:10', o: 13.70, h: 13.78, l: 13.68, c: 13.75, vol: 180 },
    { time: '11:15', o: 13.75, h: 13.77, l: 13.71, c: 13.74, vol: 130 },
  ];

  const gridLines = [13.20, 13.30, 13.40, 13.50, 13.60, 13.70, 13.80, 13.90];
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#64748b' : '#94a3b8';
  const bullColor = '#10b981';
  const bearColor = '#ef4444';
  const bullVol = isDark ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.22)';
  const bearVol = isDark ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.22)';

  const candleW = 14;
  const startX = 20;
  const stepX = (width - 70) / candles.length;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;" xmlns="http://www.w3.org/2000/svg">`;

  // Grid lines
  gridLines.forEach(price => {
    const y = priceToY(price);
    svg += `<line x1="0" y1="${y}" x2="${width - 55}" y2="${y}" stroke="${gridColor}" stroke-dasharray="2 2" stroke-width="1"/>`;
    svg += `<text x="${width - 50}" y="${y + 3.5}" fill="${textColor}" font-size="9" font-family="Geist Mono, monospace">${price.toFixed(2)}</text>`;
  });

  // Entry dashed line
  const entryY = priceToY(13.635);
  svg += `<line x1="0" y1="${entryY}" x2="${width - 55}" y2="${entryY}" stroke="#0ea5e9" stroke-dasharray="4 4" stroke-width="1.2" opacity="0.85"/>`;

  // Current price marker
  const curY = priceToY(13.74);
  svg += `<rect x="${width - 54}" y="${curY - 8}" width="50" height="16" rx="2" fill="${bullColor}"/>`;
  svg += `<text x="${width - 49}" y="${curY + 3.5}" fill="#ffffff" font-size="9" font-weight="600" font-family="Geist Mono, monospace">13.74</text>`;

  // Draw Candles & Volume
  candles.forEach((c, i) => {
    const cx = startX + i * stepX;
    const isBull = c.c >= c.o;
    const color = isBull ? bullColor : bearColor;
    const volFill = isBull ? bullVol : bearVol;
    
    // Volume bar
    const volHeight = (c.vol / 350) * 45;
    const volY = height - 12 - volHeight;
    svg += `<rect x="${cx - candleW/2}" y="${volY}" width="${candleW}" height="${volHeight}" fill="${volFill}" rx="1"/>`;

    // Wick
    const hy = priceToY(c.h);
    const ly = priceToY(c.l);
    svg += `<line x1="${cx}" y1="${hy}" x2="${cx}" y2="${ly}" stroke="${color}" stroke-width="1.5"/>`;

    // Body
    const topY = priceToY(Math.max(c.o, c.c));
    const botY = priceToY(Math.min(c.o, c.c));
    const bHeight = Math.max(botY - topY, 2);
    svg += `<rect x="${cx - candleW/2}" y="${topY}" width="${candleW}" height="${bHeight}" fill="${color}" rx="1"/>`;

    // Time label on x-axis
    if (c.time === '09:30' || c.time === '10:00' || c.time === '10:30' || c.time === '11:00' || c.time === '11:15') {
      svg += `<text x="${cx}" y="${height - 2}" fill="${textColor}" font-size="8.5" font-family="Geist Mono, monospace" text-anchor="middle">${c.time}</text>`;
    }

    // Trade Entry / Exit markers
    if (c.buy) {
      const buyY = priceToY(c.l) + 16;
      svg += `<polygon points="${cx},${buyY - 8} ${cx - 6},${buyY + 4} ${cx + 6},${buyY + 4}" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>`;
    }
    if (c.sell) {
      const sellY = priceToY(c.h) - 16;
      svg += `<polygon points="${cx},${sellY + 8} ${cx - 6},${sellY - 4} ${cx + 6},${sellY - 4}" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>`;
    }
  });

  // TradingView logo bottom left
  svg += `<text x="8" y="${height - 18}" fill="${textColor}" font-size="11" font-weight="800" opacity="0.35" font-family="sans-serif">17</text>`;

  svg += `</svg>`;
  return svg;
}

// Icons
const ICONS = {
  sparkles: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>`,
  sparklesSm: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  save: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  dismiss: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  camera: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  tag: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>`,
  book: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 2v20"/></svg>`,
  target: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  note: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  help: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
  play: `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  owl: `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(0 40)">
      <path fill="#6366f1" d="M38 62C80 79 123 84 166 77C203 71 234 81 256 106C278 81 309 71 346 77C389 84 432 79 474 62C479 60 483 64 482 70C479 109 466 140 441 165C455 189 462 216 462 244C462 306 382 350 256 350C130 350 50 306 50 244C50 216 57 189 71 165C46 140 33 109 30 70C29 64 33 60 38 62Z"/>
      <path fill="#FFFFFF" d="M214 218H298L256 294L214 218Z"/>
      <circle cx="173" cy="207" r="82" fill="#FFFFFF"/>
      <circle cx="339" cy="207" r="82" fill="#FFFFFF"/>
      <g fill="#10B981">
        <rect x="168" y="157" width="10" height="100" rx="5"/>
        <rect x="147" y="175" width="52" height="64" rx="5"/>
      </g>
      <g fill="#EF4444">
        <rect x="334" y="157" width="10" height="100" rx="5"/>
        <rect x="313" y="175" width="52" height="64" rx="5"/>
      </g>
    </g>
  </svg>`
};

// 1. OG Hero Card - Dark Theme (1200 x 630)
function renderOgHeroDarkHtml() {
  const chartSvg = generateCandlesSVG(true);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: #080b12;
    background-image: 
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.24), transparent),
      radial-gradient(ellipse 60% 40% at 85% 85%, rgba(16, 185, 129, 0.12), transparent);
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e2e8f0;
    display: flex;
    flex-direction: column;
    padding: 22px 30px 18px 30px;
    overflow: hidden;
    position: relative;
  }
  
  .brand-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .brand-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-title {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-tag {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(99, 102, 241, 0.18);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.35);
    padding: 2px 8px;
    border-radius: 9999px;
  }
  .brand-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ai-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25));
    border: 1px solid rgba(168, 85, 247, 0.45);
    color: #c084fc;
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 9999px;
    box-shadow: 0 0 15px rgba(168, 85, 247, 0.2);
  }

  .main-grid {
    display: grid;
    grid-template-columns: 520px 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  .left-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .trade-card {
    background: rgba(17, 24, 39, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
  }

  .trade-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }
  .symbol-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .symbol-name {
    font-size: 16px;
    font-weight: 800;
    color: #ffffff;
    font-family: 'Geist Mono', monospace;
  }
  .symbol-desc {
    font-size: 10.5px;
    color: #94a3b8;
    max-width: 170px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge-long {
    font-size: 10px;
    font-weight: 700;
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 2px 7px;
    border-radius: 3px;
  }
  .trade-pnl {
    font-size: 16px;
    font-weight: 700;
    color: #f87171;
    font-family: 'Geist Mono', monospace;
  }

  .trade-meta-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
  }
  .meta-label {
    font-size: 8.5px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .meta-val {
    font-size: 11.5px;
    font-weight: 600;
    color: #cbd5e1;
    font-family: 'Geist Mono', monospace;
    margin-top: 1px;
  }

  .chart-box {
    background: rgba(10, 15, 29, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 8px 10px;
    position: relative;
    height: 230px;
  }
  .chart-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .chart-pills {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .chart-pill {
    font-size: 9.5px;
    color: #94a3b8;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    padding: 2px 6px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .chart-pill.active {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    border-color: rgba(99, 102, 241, 0.4);
  }
  .chart-pill.replay {
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
    font-weight: 600;
  }

  .right-col {
    display: flex;
    flex-direction: column;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(99, 102, 241, 0.35);
    box-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6), 0 0 20px -2px rgba(99, 102, 241, 0.15);
    border-radius: 8px;
    padding: 14px 16px;
    position: relative;
  }

  .stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .stats-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 8px;
    background: rgba(10, 15, 26, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 7px 9px;
    margin-bottom: 8px;
  }
  .stat-block {
    display: flex;
    flex-direction: column;
  }
  .stat-lbl {
    font-size: 8px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .stat-num {
    font-size: 11px;
    font-weight: 700;
    color: #f1f5f9;
    font-family: 'Geist Mono', monospace;
    margin-top: 1px;
  }

  .ask-ai-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .ask-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    color: #c7d2fe;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
  }

  .ai-review-content {
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1;
  }
  .ai-review-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .conf-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: rgba(99, 102, 241, 0.15);
    color: #c7d2fe;
    border: 1px solid rgba(99, 102, 241, 0.3);
    padding: 2px 6px;
    border-radius: 3px;
  }
  .ai-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    color: #94a3b8;
  }
  .ai-action-btn {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .ai-summary {
    font-size: 11.5px;
    line-height: 1.4;
    color: #e2e8f0;
    font-weight: 400;
  }

  .insight-box {
    background: rgba(10, 15, 26, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 5px;
    padding: 6px 9px;
  }
  .insight-box-title {
    font-size: 10px;
    font-weight: 700;
    color: #f8fafc;
    margin-bottom: 2px;
  }
  .insight-box-desc {
    font-size: 10.5px;
    line-height: 1.35;
    color: #94a3b8;
  }
  .insight-tags {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .insight-tag {
    font-size: 8.5px;
    font-family: 'Geist Mono', monospace;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .insight-tag span {
    color: #818cf8;
    margin-right: 3px;
  }

  .takeaway-box {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(168, 85, 247, 0.12));
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 5px;
    padding: 7px 9px;
  }
  .takeaway-lbl {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #c7d2fe;
    margin-bottom: 2px;
  }
  .takeaway-text {
    font-size: 11px;
    line-height: 1.35;
    color: #f1f5f9;
    font-weight: 500;
  }

  .ai-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
    font-size: 9px;
    color: #64748b;
  }
</style>
</head>
<body>

  <div class="brand-bar">
    <div class="brand-left">
      ${ICONS.owl}
      <div class="brand-title">
        Trading Diary
        <span class="brand-tag">AI Co-Pilot</span>
      </div>
    </div>
    <div class="brand-right">
      <div class="ai-badge">
        ${ICONS.sparklesSm}
        AI Assistant in Your Corner
      </div>
    </div>
  </div>

  <div class="main-grid">
    <div class="left-col">
      <div class="trade-card">
        <div class="trade-header">
          <div class="symbol-group">
            <span class="symbol-name">TTD</span>
            <span class="symbol-desc">TRADE DESK INC</span>
            <span class="badge-long">LONG</span>
          </div>
          <div class="trade-pnl">-$101.77</div>
        </div>

        <div class="trade-meta-row">
          <div class="meta-item">
            <span class="meta-label">Entry → Exit</span>
            <span class="meta-val">$13.63 → $13.59</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Time</span>
            <span class="meta-val">10:21 → 10:27</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Duration</span>
            <span class="meta-val">5m 29s</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Quantity</span>
            <span class="meta-val">4,000 shs</span>
          </div>
        </div>

        <div class="chart-box">
          <div class="chart-toolbar">
            <div class="chart-pills">
              <div class="chart-pill">${ICONS.sparklesSm} Patterns</div>
              <div class="chart-pill">Levels</div>
              <div class="chart-pill">Trendlines</div>
              <div class="chart-pill replay">${ICONS.play} REPLAY</div>
            </div>
            <div class="chart-pills">
              <div class="chart-pill">1M</div>
              <div class="chart-pill active">5M</div>
              <div class="chart-pill">15M</div>
            </div>
          </div>
          ${chartSvg}
        </div>
      </div>
    </div>

    <div class="right-col">
      <div class="stats-header">
        <span class="stats-title">Trade Stats</span>
        <span style="font-size: 8.5px; color: #64748b;">Raw Numbers</span>
      </div>
      <div class="stats-grid">
        <div class="stat-block">
          <span class="stat-lbl">Holding ${ICONS.help}</span>
          <span class="stat-num">5m 29s</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Fills ${ICONS.help}</span>
          <span class="stat-num">2</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Net P&L ${ICONS.help}</span>
          <span class="stat-num" style="color: #f87171;">-$101.77</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Max Size ${ICONS.help}</span>
          <span class="stat-num">2,000</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Peak Profit ${ICONS.help}</span>
          <span class="stat-num" style="color: #34d399;">+$40.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Max Drawdown ${ICONS.help}</span>
          <span class="stat-num" style="color: #f87171;">-$120.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Giveback ${ICONS.help}</span>
          <span class="stat-num">$126.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Time to Peak ${ICONS.help}</span>
          <span class="stat-num">3m 3s</span>
        </div>
      </div>

      <div class="ask-ai-row">
        <div class="ask-ai-btn">${ICONS.sparkles} Ask AI Assistant</div>
        <span style="font-size: 9.5px; color: #a5b4fc; font-weight: 500;">AI Review on this trade</span>
      </div>

      <div class="ai-review-content">
        <div class="ai-review-top">
          <span class="conf-badge">AI Assistant Breakdown</span>
          <div class="ai-actions">
            <span class="ai-action-btn">${ICONS.save} Save</span>
            <span class="ai-action-btn">${ICONS.copy} Copy</span>
          </div>
        </div>

        <p class="ai-summary">
          Long on <strong>TTD</strong> at <strong>$13.635</strong> on an intraday pop. Exited at <strong>$13.592</strong> for a <strong>-$101.77</strong> loss.
        </p>

        <div class="insight-box">
          <div class="insight-box-title">Profit Giveback & Excursion</div>
          <div class="insight-box-desc">
            You were green by +$40.00 within 3m 3s, but held through the stall at $13.72 resistance. Price pulled back and gave back $126.00 into -$120.00 max adverse move.
          </div>
          <div class="insight-tags">
            <span class="insight-tag"><span>Peak</span> +$40.00</span>
            <span class="insight-tag"><span>Gave Back</span> $126.00 (315%)</span>
            <span class="insight-tag"><span>Drawdown</span> -$120.00</span>
          </div>
        </div>

        <div class="takeaway-box">
          <div class="takeaway-lbl">Assistant Takeaway</div>
          <div class="takeaway-text">
            Don't let green trades turn red. When momentum stalls into resistance, take some off and trail your stop to breakeven.
          </div>
        </div>

        <div class="ai-footer">
          <span>Gemini 2.5 · AI Assistant</span>
          <span>Trading Diary</span>
        </div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

// 2. OG Hero Card - Light Theme (1200 x 630)
function renderOgHeroLightHtml() {
  const chartSvg = generateCandlesSVG(false);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: #f8fafc;
    background-image: 
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 102, 241, 0.12), transparent),
      radial-gradient(ellipse 60% 40% at 85% 85%, rgba(16, 185, 129, 0.08), transparent);
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1e293b;
    display: flex;
    flex-direction: column;
    padding: 22px 30px 18px 30px;
    overflow: hidden;
    position: relative;
  }
  
  .brand-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }
  .brand-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand-title {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .brand-tag {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #e0e7ff;
    color: #4338ca;
    border: 1px solid #c7d2fe;
    padding: 2px 8px;
    border-radius: 9999px;
  }
  .brand-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ai-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #f5f3ff;
    border: 1px solid #ddd6fe;
    color: #6d28d9;
    font-size: 11.5px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 9999px;
  }

  .main-grid {
    display: grid;
    grid-template-columns: 520px 1fr;
    gap: 16px;
    flex: 1;
    min-height: 0;
  }

  .left-col {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  
  .trade-card {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    box-shadow: 0 4px 20px -2px rgba(0,0,0,0.06);
  }

  .trade-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #f1f5f9;
  }
  .symbol-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .symbol-name {
    font-size: 16px;
    font-weight: 800;
    color: #0f172a;
    font-family: 'Geist Mono', monospace;
  }
  .symbol-desc {
    font-size: 10.5px;
    color: #64748b;
    max-width: 170px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge-long {
    font-size: 10px;
    font-weight: 700;
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
    padding: 2px 7px;
    border-radius: 3px;
  }
  .trade-pnl {
    font-size: 16px;
    font-weight: 700;
    color: #dc2626;
    font-family: 'Geist Mono', monospace;
  }

  .trade-meta-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }
  .meta-item {
    display: flex;
    flex-direction: column;
  }
  .meta-label {
    font-size: 8.5px;
    text-transform: uppercase;
    color: #94a3b8;
    font-weight: 600;
    letter-spacing: 0.05em;
  }
  .meta-val {
    font-size: 11.5px;
    font-weight: 600;
    color: #1e293b;
    font-family: 'Geist Mono', monospace;
    margin-top: 1px;
  }

  .chart-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px 10px;
    position: relative;
    height: 230px;
  }
  .chart-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .chart-pills {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .chart-pill {
    font-size: 9.5px;
    color: #64748b;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 2px 6px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .chart-pill.active {
    background: #eef2ff;
    color: #4f46e5;
    border-color: #c7d2fe;
    font-weight: 600;
  }
  .chart-pill.replay {
    background: #f5f3ff;
    color: #6d28d9;
    font-weight: 600;
  }

  .right-col {
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 25px -4px rgba(0, 0, 0, 0.08), 0 0 15px -2px rgba(99, 102, 241, 0.1);
    border-radius: 8px;
    padding: 14px 16px;
    position: relative;
  }

  .stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .stats-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 8px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 7px 9px;
    margin-bottom: 8px;
  }
  .stat-block {
    display: flex;
    flex-direction: column;
  }
  .stat-lbl {
    font-size: 8px;
    text-transform: uppercase;
    color: #64748b;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .stat-num {
    font-size: 11px;
    font-weight: 700;
    color: #0f172a;
    font-family: 'Geist Mono', monospace;
    margin-top: 1px;
  }

  .ask-ai-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .ask-ai-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    color: #4f46e5;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
  }

  .ai-review-content {
    display: flex;
    flex-direction: column;
    gap: 7px;
    flex: 1;
  }
  .ai-review-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .conf-badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #cbd5e1;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .ai-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    color: #64748b;
  }
  .ai-action-btn {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .ai-summary {
    font-size: 11.5px;
    line-height: 1.4;
    color: #1e293b;
    font-weight: 400;
  }

  .insight-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 5px;
    padding: 6px 9px;
  }
  .insight-box-title {
    font-size: 10px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
  }
  .insight-box-desc {
    font-size: 10.5px;
    line-height: 1.35;
    color: #475569;
  }
  .insight-tags {
    display: flex;
    gap: 5px;
    margin-top: 4px;
  }
  .insight-tag {
    font-size: 8.5px;
    font-family: 'Geist Mono', monospace;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    color: #334155;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .insight-tag span {
    color: #4f46e5;
    margin-right: 3px;
  }

  .takeaway-box {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 5px;
    padding: 7px 9px;
  }
  .takeaway-lbl {
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #4338ca;
    margin-bottom: 2px;
  }
  .takeaway-text {
    font-size: 11px;
    line-height: 1.35;
    color: #1e1b4b;
    font-weight: 500;
  }

  .ai-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 2px;
    font-size: 9px;
    color: #94a3b8;
  }
</style>
</head>
<body>

  <div class="brand-bar">
    <div class="brand-left">
      ${ICONS.owl}
      <div class="brand-title">
        Trading Diary
        <span class="brand-tag">AI Co-Pilot</span>
      </div>
    </div>
    <div class="brand-right">
      <div class="ai-badge">
        ${ICONS.sparklesSm}
        AI Assistant in Your Corner
      </div>
    </div>
  </div>

  <div class="main-grid">
    <div class="left-col">
      <div class="trade-card">
        <div class="trade-header">
          <div class="symbol-group">
            <span class="symbol-name">TTD</span>
            <span class="symbol-desc">TRADE DESK INC</span>
            <span class="badge-long">LONG</span>
          </div>
          <div class="trade-pnl">-$101.77</div>
        </div>

        <div class="trade-meta-row">
          <div class="meta-item">
            <span class="meta-label">Entry → Exit</span>
            <span class="meta-val">$13.63 → $13.59</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Time</span>
            <span class="meta-val">10:21 → 10:27</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Duration</span>
            <span class="meta-val">5m 29s</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">Quantity</span>
            <span class="meta-val">4,000 shs</span>
          </div>
        </div>

        <div class="chart-box">
          <div class="chart-toolbar">
            <div class="chart-pills">
              <div class="chart-pill">${ICONS.sparklesSm} Patterns</div>
              <div class="chart-pill">Levels</div>
              <div class="chart-pill">Trendlines</div>
              <div class="chart-pill replay">${ICONS.play} REPLAY</div>
            </div>
            <div class="chart-pills">
              <div class="chart-pill">1M</div>
              <div class="chart-pill active">5M</div>
              <div class="chart-pill">15M</div>
            </div>
          </div>
          ${chartSvg}
        </div>
      </div>
    </div>

    <div class="right-col">
      <div class="stats-header">
        <span class="stats-title">Trade Stats</span>
        <span style="font-size: 8.5px; color: #94a3b8;">Raw Numbers</span>
      </div>
      <div class="stats-grid">
        <div class="stat-block">
          <span class="stat-lbl">Holding ${ICONS.help}</span>
          <span class="stat-num">5m 29s</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Fills ${ICONS.help}</span>
          <span class="stat-num">2</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Net P&L ${ICONS.help}</span>
          <span class="stat-num" style="color: #dc2626;">-$101.77</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Max Size ${ICONS.help}</span>
          <span class="stat-num">2,000</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Peak Profit ${ICONS.help}</span>
          <span class="stat-num" style="color: #059669;">+$40.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Max Drawdown ${ICONS.help}</span>
          <span class="stat-num" style="color: #dc2626;">-$120.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Giveback ${ICONS.help}</span>
          <span class="stat-num">$126.00</span>
        </div>
        <div class="stat-block">
          <span class="stat-lbl">Time to Peak ${ICONS.help}</span>
          <span class="stat-num">3m 3s</span>
        </div>
      </div>

      <div class="ask-ai-row">
        <div class="ask-ai-btn">${ICONS.sparkles} Ask AI Assistant</div>
        <span style="font-size: 9.5px; color: #4f46e5; font-weight: 500;">AI Review on this trade</span>
      </div>

      <div class="ai-review-content">
        <div class="ai-review-top">
          <span class="conf-badge">AI Assistant Breakdown</span>
          <div class="ai-actions">
            <span class="ai-action-btn">${ICONS.save} Save</span>
            <span class="ai-action-btn">${ICONS.copy} Copy</span>
          </div>
        </div>

        <p class="ai-summary">
          Long on <strong>TTD</strong> at <strong>$13.635</strong> on an intraday pop. Exited at <strong>$13.592</strong> for a <strong>-$101.77</strong> loss.
        </p>

        <div class="insight-box">
          <div class="insight-box-title">Profit Giveback & Excursion</div>
          <div class="insight-box-desc">
            You were green by +$40.00 within 3m 3s, but held through the stall at $13.72 resistance. Price pulled back and gave back $126.00 into -$120.00 max adverse move.
          </div>
          <div class="insight-tags">
            <span class="insight-tag"><span>Peak</span> +$40.00</span>
            <span class="insight-tag"><span>Gave Back</span> $126.00 (315%)</span>
            <span class="insight-tag"><span>Drawdown</span> -$120.00</span>
          </div>
        </div>

        <div class="takeaway-box">
          <div class="takeaway-lbl">Assistant Takeaway</div>
          <div class="takeaway-text">
            Don't let green trades turn red. When momentum stalls into resistance, take some off and trail your stop to breakeven.
          </div>
        </div>

        <div class="ai-footer">
          <span>Gemini 2.5 · AI Assistant</span>
          <span>Trading Diary</span>
        </div>
      </div>
    </div>
  </div>

</body>
</html>`;
}

// 3. Full 1:1 In-App Screenshot View (Light Theme)
function renderInAppFullLightHtml() {
  const chartSvg = generateCandlesSVG(false);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1000px;
    background: #ffffff;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1a1a2e;
    padding: 16px 20px;
  }
  
  .table-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #f8f9fa;
    border: 1px solid #e5e7eb;
    border-radius: 4px 4px 0 0;
    font-size: 13px;
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .time-text {
    font-size: 12px;
    color: #6b7280;
    font-family: 'Geist Mono', monospace;
  }
  .symbol-title {
    font-weight: 700;
    color: #111827;
  }
  .badge-direction {
    font-size: 10px;
    font-weight: 600;
    background: #dcfce7;
    color: #15803d;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .row-right {
    display: flex;
    align-items: center;
    gap: 20px;
    font-family: 'Geist Mono', monospace;
  }
  .pnl-loss {
    color: #dc2626;
    font-weight: 700;
  }

  .details-chart-wrap {
    display: flex;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    background: rgba(255,255,255,0.5);
  }
  
  .details-panel {
    width: 250px;
    padding: 16px;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .details-pnl {
    font-size: 24px;
    font-weight: 700;
    color: #dc2626;
    font-family: 'Geist Mono', monospace;
  }
  .details-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
  }
  .details-item {
    display: flex;
    justify-content: space-between;
  }
  .details-lbl {
    font-size: 10px;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
  }
  .details-val {
    font-family: 'Geist Mono', monospace;
    font-weight: 600;
    color: #1f2937;
  }

  .chart-panel {
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
  }
  .chart-toolbar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .chart-btn-group {
    display: flex;
    gap: 4px;
  }
  .chart-btn {
    font-size: 11px;
    color: #4b5563;
    padding: 2px 8px;
    border: 1px solid #e5e7eb;
    border-radius: 3px;
    background: #ffffff;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .chart-btn.active {
    background: #4f46e5;
    color: #ffffff;
    border-color: #4f46e5;
  }
  .chart-btn.replay {
    background: #ede9fe;
    color: #6d28d9;
    border-color: #ddd6fe;
    font-weight: 600;
  }

  .actions-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    background: #ffffff;
  }
  .action-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: #4b5563;
    padding: 5px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: #ffffff;
  }
  .action-pill.active {
    background: #eef2ff;
    color: #4f46e5;
    border-color: #c7d2fe;
    font-weight: 600;
  }

  .journal-panel {
    border-left: 1px solid #e5e7eb;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #e5e7eb;
    padding: 16px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-radius: 0 0 4px 4px;
  }

  .stats-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #f9fafb;
    padding: 12px 14px;
  }
  .stats-header-bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .stats-card-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #111827;
  }
  .stats-grid-8 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat-unit {
    display: flex;
    flex-direction: column;
  }
  .stat-unit-lbl {
    font-size: 9.5px;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .stat-unit-val {
    font-size: 13px;
    font-weight: 700;
    color: #111827;
    font-family: 'Geist Mono', monospace;
    margin-top: 2px;
  }

  .ask-btn-bar {
    display: flex;
  }
  .ask-ai-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    color: #4f46e5;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 4px;
  }

  .ai-card {
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .conf-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: #f3f4f6;
    color: #4b5563;
    border: 1px solid #e5e7eb;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .ai-card-tools {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #4b5563;
  }
  .ai-card-tool {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ai-desc-text {
    font-size: 13px;
    line-height: 1.5;
    color: #1f2937;
  }

  .ai-obs-box {
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .ai-obs-title {
    font-size: 12px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 2px;
  }
  .ai-obs-detail {
    font-size: 12px;
    line-height: 1.45;
    color: #4b5563;
  }
  .ai-obs-badges {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .ai-obs-badge {
    font-size: 10px;
    font-family: 'Geist Mono', monospace;
    background: #e5e7eb;
    color: #374151;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .ai-section-title {
    font-size: 10px;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .ai-section-p {
    font-size: 12px;
    line-height: 1.45;
    color: #4b5563;
  }

  .ai-takeaway-block {
    background: #eef2ff;
    border: 1px solid #c7d2fe;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .ai-takeaway-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #4338ca;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .ai-takeaway-content {
    font-size: 12px;
    color: #1e1b4b;
    font-weight: 500;
    line-height: 1.4;
  }

  .ai-card-footer {
    font-size: 10.5px;
    color: #9ca3af;
  }
</style>
</head>
<body>

  <div class="table-row-header">
    <div class="row-left">
      <span class="time-text">10:21 AM EDT</span>
      <span class="symbol-title">TTD</span>
      <span style="font-size: 11px; color: #6b7280;">TRADE DESK INC/THE - CLASS A</span>
      <span class="badge-direction">LONG</span>
    </div>
    <div class="row-right">
      <span>4,000 shs</span>
      <span>2 fills</span>
      <span class="pnl-loss">-$101.77</span>
    </div>
  </div>

  <div class="details-chart-wrap">
    <div class="details-panel">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span class="badge-direction">LONG</span>
        <span style="font-size: 11px; color: #6b7280;">2026-08-28</span>
      </div>
      <div class="details-pnl">-$101.77</div>
      <div class="details-grid">
        <div class="details-item">
          <span class="details-lbl">Entry → Exit</span>
          <span class="details-val">$13.63 → $13.59</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Time</span>
          <span class="details-val">10:21:57 → 10:27:26</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Duration</span>
          <span class="details-val">5m 29s</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Quantity</span>
          <span class="details-val">4,000</span>
        </div>
      </div>
    </div>
    <div class="chart-panel">
      <div class="chart-toolbar">
        <div class="chart-btn-group">
          <div class="chart-btn">${ICONS.sparklesSm} Patterns</div>
          <div class="chart-btn">Levels</div>
          <div class="chart-btn">Trendlines</div>
          <div class="chart-btn replay">${ICONS.play} REPLAY</div>
        </div>
        <div class="chart-btn-group">
          <div class="chart-btn">1M</div>
          <div class="chart-btn active">5M</div>
          <div class="chart-btn">10M</div>
          <div class="chart-btn">15M</div>
          <div class="chart-btn">1H</div>
        </div>
      </div>
      <div style="height: 230px;">
        ${chartSvg}
      </div>
    </div>
  </div>

  <div class="actions-row">
    <span style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase;">Add to trade</span>
    <div class="action-pill">${ICONS.camera} Screenshot</div>
    <div class="action-pill">${ICONS.tag} Tag</div>
    <div class="action-pill">${ICONS.book} Playbook</div>
    <div class="action-pill">${ICONS.target} Plan & risk</div>
    <div class="action-pill">${ICONS.note} Note</div>
    <div class="action-pill active">${ICONS.sparklesSm} AI review</div>
  </div>

  <div class="journal-panel">
    <div class="stats-card">
      <div class="stats-header-bar">
        <span class="stats-card-title">Objective Trade Statistics</span>
        <span style="font-size: 10px; color: #6b7280;">Hover or tap a metric for an explanation</span>
      </div>
      <div class="stats-grid-8">
        <div class="stat-unit">
          <span class="stat-unit-lbl">Holding ${ICONS.help}</span>
          <span class="stat-unit-val">5m 29s</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Executions ${ICONS.help}</span>
          <span class="stat-unit-val">2</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Net P&L ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #dc2626;">-$101.77</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Max Size ${ICONS.help}</span>
          <span class="stat-unit-val">2000</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">MFE ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #16a34a;">$40.00 (0.1%)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">MAE ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #dc2626;">-$120.00 (0.4%)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Exit Giveback ${ICONS.help}</span>
          <span class="stat-unit-val">$126.00 (315% of MFE)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Time to Peak ${ICONS.help}</span>
          <span class="stat-unit-val">3m 3s</span>
        </div>
      </div>
    </div>

    <div class="ask-btn-bar">
      <div class="ask-ai-button">${ICONS.sparkles} Ask AI Assistant</div>
    </div>

    <div class="ai-card">
      <div class="ai-card-header">
        <span class="conf-tag">Medium Confidence</span>
        <div class="ai-card-tools">
          <div class="ai-card-tool">${ICONS.save} Save</div>
          <div class="ai-card-tool">${ICONS.copy} Copy</div>
          <div class="ai-card-tool">${ICONS.dismiss} Dismiss</div>
        </div>
      </div>

      <p class="ai-desc-text">
        The LONG trade in TTD was opened at 13.635 USD with 2000 shares at Aug 28, 2026 at 10:21 AM ET and closed at 13.592 USD at Aug 28, 2026 at 10:27 AM ET, resulting in a net PnL of -101.77 USD.
      </p>

      <div class="ai-obs-box">
        <div class="ai-obs-title">Trade Duration and Excursion</div>
        <div class="ai-obs-detail">
          The holding duration was 5m 29s, with the trade reaching a maximum favorable excursion of 40.00 USD (0.1%) after 3m 3s, and a maximum adverse excursion of 120.00 USD (0.4%).
        </div>
        <div class="ai-obs-badges">
          <span class="ai-obs-badge">holding Duration 5m 29s</span>
          <span class="ai-obs-badge">time To Peak 3m 3s</span>
        </div>
      </div>

      <div class="ai-obs-box">
        <div class="ai-obs-title">Exit Giveback</div>
        <div class="ai-obs-detail">
          The position gave back 126.00 USD from its peak favorable excursion upon exit.
        </div>
        <div class="ai-obs-badges">
          <span class="ai-obs-badge">exit Giveback From MFE 126.00 USD</span>
        </div>
      </div>

      <div>
        <div class="ai-section-title">Execution</div>
        <p class="ai-section-p">
          The trade executed as a single entry of 2000 shares at 13.635 USD on Aug 28, 2026 at 10:21 AM ET and exited as a single block of 2000 shares at 13.592 USD on Aug 28, 2026 at 10:27 AM ET.
        </p>
      </div>

      <div>
        <div class="ai-section-title">Risk</div>
        <p class="ai-section-p">
          The maximum adverse excursion reached 120.00 USD (0.4%), and the trade closed with a net loss of 101.77 USD.
        </p>
      </div>

      <div>
        <div class="ai-section-title">Questions for you</div>
        <ul style="padding-left: 16px; font-size: 12px; color: #4b5563; line-height: 1.5;">
          <li>Was the exit at 13.592 USD triggered by a pre-planned stop-loss or a discretionary decision?</li>
          <li>What was the initial risk plan regarding the 120.00 USD maximum adverse excursion?</li>
        </ul>
      </div>

      <div class="ai-takeaway-block">
        <div class="ai-takeaway-label">Takeaway</div>
        <div class="ai-takeaway-content">
          Evaluate whether the exit giveback from the MFE peak aligns with your trade management rules.
        </div>
      </div>

      <div class="ai-card-footer">
        google · gemini-2.5-flash-lite
      </div>
    </div>
  </div>

</body>
</html>`;
}

// 4. Full 1:1 In-App Screenshot View (Dark Theme)
function renderInAppFullDarkHtml() {
  const chartSvg = generateCandlesSVG(true);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1000px;
    background: #0b0e17;
    font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e5e7eb;
    padding: 16px 20px;
  }
  
  .table-row-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    background: #111827;
    border: 1px solid #1f2937;
    border-radius: 4px 4px 0 0;
    font-size: 13px;
  }
  .row-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .time-text {
    font-size: 12px;
    color: #9ca3af;
    font-family: 'Geist Mono', monospace;
  }
  .symbol-title {
    font-weight: 700;
    color: #f3f4f6;
  }
  .badge-direction {
    font-size: 10px;
    font-weight: 600;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
    padding: 1px 6px;
    border-radius: 3px;
  }
  .row-right {
    display: flex;
    align-items: center;
    gap: 20px;
    font-family: 'Geist Mono', monospace;
  }
  .pnl-loss {
    color: #f87171;
    font-weight: 700;
  }

  .details-chart-wrap {
    display: flex;
    border-left: 1px solid #1e293b;
    border-right: 1px solid #1e293b;
    border-bottom: 1px solid #1e293b;
    background: #151c2c;
  }
  
  .details-panel {
    width: 250px;
    padding: 16px;
    border-right: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .details-pnl {
    font-size: 24px;
    font-weight: 700;
    color: #f87171;
    font-family: 'Geist Mono', monospace;
  }
  .details-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
  }
  .details-item {
    display: flex;
    justify-content: space-between;
  }
  .details-lbl {
    font-size: 10px;
    text-transform: uppercase;
    color: #9ca3af;
    font-weight: 600;
  }
  .details-val {
    font-family: 'Geist Mono', monospace;
    font-weight: 600;
    color: #f3f4f6;
  }

  .chart-panel {
    flex: 1;
    padding: 12px;
    display: flex;
    flex-direction: column;
  }
  .chart-toolbar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .chart-btn-group {
    display: flex;
    gap: 4px;
  }
  .chart-btn {
    font-size: 11px;
    color: #9ca3af;
    padding: 2px 8px;
    border: 1px solid #1e293b;
    border-radius: 3px;
    background: #111827;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .chart-btn.active {
    background: #6366f1;
    color: #ffffff;
    border-color: #6366f1;
  }
  .chart-btn.replay {
    background: rgba(99, 102, 241, 0.18);
    color: #a5b4fc;
    border-color: rgba(99, 102, 241, 0.35);
    font-weight: 600;
  }

  .actions-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-left: 1px solid #1e293b;
    border-right: 1px solid #1e293b;
    border-bottom: 1px solid #1e293b;
    background: #151c2c;
  }
  .action-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    color: #9ca3af;
    padding: 5px 12px;
    border: 1px solid #1e293b;
    border-radius: 4px;
    background: #111827;
  }
  .action-pill.active {
    background: rgba(99, 102, 241, 0.18);
    color: #818cf8;
    border-color: rgba(99, 102, 241, 0.4);
    font-weight: 600;
  }

  .journal-panel {
    border-left: 1px solid #1e293b;
    border-right: 1px solid #1e293b;
    border-bottom: 1px solid #1e293b;
    padding: 16px;
    background: #0f172a;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-radius: 0 0 4px 4px;
  }

  .stats-card {
    border: 1px solid #1e293b;
    border-radius: 6px;
    background: #151c2c;
    padding: 12px 14px;
  }
  .stats-header-bar {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .stats-card-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #f3f4f6;
  }
  .stats-grid-8 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stat-unit {
    display: flex;
    flex-direction: column;
  }
  .stat-unit-lbl {
    font-size: 9.5px;
    text-transform: uppercase;
    color: #9ca3af;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .stat-unit-val {
    font-size: 13px;
    font-weight: 700;
    color: #f3f4f6;
    font-family: 'Geist Mono', monospace;
    margin-top: 2px;
  }

  .ask-btn-bar {
    display: flex;
  }
  .ask-ai-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(99, 102, 241, 0.4);
    color: #a5b4fc;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    border-radius: 4px;
  }

  .ai-card {
    border: 1px solid #1e293b;
    background: #151c2c;
    border-radius: 6px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .conf-tag {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    background: #1e293b;
    color: #cbd5e1;
    border: 1px solid #334155;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .ai-card-tools {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #9ca3af;
  }
  .ai-card-tool {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ai-desc-text {
    font-size: 13px;
    line-height: 1.5;
    color: #e5e7eb;
  }

  .ai-obs-box {
    border: 1px solid #1e293b;
    background: #0b0e17;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .ai-obs-title {
    font-size: 12px;
    font-weight: 700;
    color: #f3f4f6;
    margin-bottom: 2px;
  }
  .ai-obs-detail {
    font-size: 12px;
    line-height: 1.45;
    color: #9ca3af;
  }
  .ai-obs-badges {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  .ai-obs-badge {
    font-size: 10px;
    font-family: 'Geist Mono', monospace;
    background: #1e293b;
    color: #cbd5e1;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .ai-section-title {
    font-size: 10px;
    text-transform: uppercase;
    color: #9ca3af;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-bottom: 2px;
  }
  .ai-section-p {
    font-size: 12px;
    line-height: 1.45;
    color: #cbd5e1;
  }

  .ai-takeaway-block {
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .ai-takeaway-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #818cf8;
    font-weight: 700;
    margin-bottom: 2px;
  }
  .ai-takeaway-content {
    font-size: 12px;
    color: #f3f4f6;
    font-weight: 500;
    line-height: 1.4;
  }

  .ai-card-footer {
    font-size: 10.5px;
    color: #64748b;
  }
</style>
</head>
<body>

  <div class="table-row-header">
    <div class="row-left">
      <span class="time-text">10:21 AM EDT</span>
      <span class="symbol-title">TTD</span>
      <span style="font-size: 11px; color: #9ca3af;">TRADE DESK INC/THE - CLASS A</span>
      <span class="badge-direction">LONG</span>
    </div>
    <div class="row-right">
      <span>4,000 shs</span>
      <span>2 fills</span>
      <span class="pnl-loss">-$101.77</span>
    </div>
  </div>

  <div class="details-chart-wrap">
    <div class="details-panel">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <span class="badge-direction">LONG</span>
        <span style="font-size: 11px; color: #9ca3af;">2026-08-28</span>
      </div>
      <div class="details-pnl">-$101.77</div>
      <div class="details-grid">
        <div class="details-item">
          <span class="details-lbl">Entry → Exit</span>
          <span class="details-val">$13.63 → $13.59</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Time</span>
          <span class="details-val">10:21:57 → 10:27:26</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Duration</span>
          <span class="details-val">5m 29s</span>
        </div>
        <div class="details-item">
          <span class="details-lbl">Quantity</span>
          <span class="details-val">4,000</span>
        </div>
      </div>
    </div>
    <div class="chart-panel">
      <div class="chart-toolbar">
        <div class="chart-btn-group">
          <div class="chart-btn">${ICONS.sparklesSm} Patterns</div>
          <div class="chart-btn">Levels</div>
          <div class="chart-btn">Trendlines</div>
          <div class="chart-btn replay">${ICONS.play} REPLAY</div>
        </div>
        <div class="chart-btn-group">
          <div class="chart-btn">1M</div>
          <div class="chart-btn active">5M</div>
          <div class="chart-btn">10M</div>
          <div class="chart-btn">15M</div>
          <div class="chart-btn">1H</div>
        </div>
      </div>
      <div style="height: 230px;">
        ${chartSvg}
      </div>
    </div>
  </div>

  <div class="actions-row">
    <span style="font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase;">Add to trade</span>
    <div class="action-pill">${ICONS.camera} Screenshot</div>
    <div class="action-pill">${ICONS.tag} Tag</div>
    <div class="action-pill">${ICONS.book} Playbook</div>
    <div class="action-pill">${ICONS.target} Plan & risk</div>
    <div class="action-pill">${ICONS.note} Note</div>
    <div class="action-pill active">${ICONS.sparklesSm} AI review</div>
  </div>

  <div class="journal-panel">
    <div class="stats-card">
      <div class="stats-header-bar">
        <span class="stats-card-title">Objective Trade Statistics</span>
        <span style="font-size: 10px; color: #9ca3af;">Hover or tap a metric for an explanation</span>
      </div>
      <div class="stats-grid-8">
        <div class="stat-unit">
          <span class="stat-unit-lbl">Holding ${ICONS.help}</span>
          <span class="stat-unit-val">5m 29s</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Executions ${ICONS.help}</span>
          <span class="stat-unit-val">2</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Net P&L ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #f87171;">-$101.77</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Max Size ${ICONS.help}</span>
          <span class="stat-unit-val">2000</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">MFE ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #4ade80;">$40.00 (0.1%)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">MAE ${ICONS.help}</span>
          <span class="stat-unit-val" style="color: #f87171;">-$120.00 (0.4%)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Exit Giveback ${ICONS.help}</span>
          <span class="stat-unit-val">$126.00 (315% of MFE)</span>
        </div>
        <div class="stat-unit">
          <span class="stat-unit-lbl">Time to Peak ${ICONS.help}</span>
          <span class="stat-unit-val">3m 3s</span>
        </div>
      </div>
    </div>

    <div class="ask-btn-bar">
      <div class="ask-ai-button">${ICONS.sparkles} Ask AI Assistant</div>
    </div>

    <div class="ai-card">
      <div class="ai-card-header">
        <span class="conf-tag">Medium Confidence</span>
        <div class="ai-card-tools">
          <div class="ai-card-tool">${ICONS.save} Save</div>
          <div class="ai-card-tool">${ICONS.copy} Copy</div>
          <div class="ai-card-tool">${ICONS.dismiss} Dismiss</div>
        </div>
      </div>

      <p class="ai-desc-text">
        The LONG trade in TTD was opened at 13.635 USD with 2000 shares at Aug 28, 2026 at 10:21 AM ET and closed at 13.592 USD at Aug 28, 2026 at 10:27 AM ET, resulting in a net PnL of -101.77 USD.
      </p>

      <div class="ai-obs-box">
        <div class="ai-obs-title">Trade Duration and Excursion</div>
        <div class="ai-obs-detail">
          The holding duration was 5m 29s, with the trade reaching a maximum favorable excursion of 40.00 USD (0.1%) after 3m 3s, and a maximum adverse excursion of 120.00 USD (0.4%).
        </div>
        <div class="ai-obs-badges">
          <span class="ai-obs-badge">holding Duration 5m 29s</span>
          <span class="ai-obs-badge">time To Peak 3m 3s</span>
        </div>
      </div>

      <div class="ai-obs-box">
        <div class="ai-obs-title">Exit Giveback</div>
        <div class="ai-obs-detail">
          The position gave back 126.00 USD from its peak favorable excursion upon exit.
        </div>
        <div class="ai-obs-badges">
          <span class="ai-obs-badge">exit Giveback From MFE 126.00 USD</span>
        </div>
      </div>

      <div>
        <div class="ai-section-title">Execution</div>
        <p class="ai-section-p">
          The trade executed as a single entry of 2000 shares at 13.635 USD on Aug 28, 2026 at 10:21 AM ET and exited as a single block of 2000 shares at 13.592 USD on Aug 28, 2026 at 10:27 AM ET.
        </p>
      </div>

      <div>
        <div class="ai-section-title">Risk</div>
        <p class="ai-section-p">
          The maximum adverse excursion reached 120.00 USD (0.4%), and the trade closed with a net loss of 101.77 USD.
        </p>
      </div>

      <div>
        <div class="ai-section-title">Questions for you</div>
        <ul style="padding-left: 16px; font-size: 12px; color: #9ca3af; line-height: 1.5;">
          <li>Was the exit at 13.592 USD triggered by a pre-planned stop-loss or a discretionary decision?</li>
          <li>What was the initial risk plan regarding the 120.00 USD maximum adverse excursion?</li>
        </ul>
      </div>

      <div class="ai-takeaway-block">
        <div class="ai-takeaway-label">Takeaway</div>
        <div class="ai-takeaway-content">
          Evaluate whether the exit giveback from the MFE peak aligns with your trade management rules.
        </div>
      </div>

      <div class="ai-card-footer">
        google · gemini-2.5-flash-lite
      </div>
    </div>
  </div>

</body>
</html>`;
}

// Write templates to disk
fs.writeFileSync(path.join(TEMPLATES_DIR, 'og-hero-dark.html'), renderOgHeroDarkHtml());
fs.writeFileSync(path.join(TEMPLATES_DIR, 'og-hero-light.html'), renderOgHeroLightHtml());
fs.writeFileSync(path.join(TEMPLATES_DIR, 'in-app-full-light.html'), renderInAppFullLightHtml());
fs.writeFileSync(path.join(TEMPLATES_DIR, 'in-app-full-dark.html'), renderInAppFullDarkHtml());

console.log('All templates written successfully!');

// Render images via Chrome Headless
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const tasks = [
  {
    html: path.join(TEMPLATES_DIR, 'og-hero-dark.html'),
    out: path.join(OUTPUT_DIR, 'og-journal-ai-dark.png'),
    width: 1200,
    height: 630,
    scale: 2,
  },
  {
    html: path.join(TEMPLATES_DIR, 'og-hero-light.html'),
    out: path.join(OUTPUT_DIR, 'og-journal-ai-light.png'),
    width: 1200,
    height: 630,
    scale: 2,
  },
  {
    html: path.join(TEMPLATES_DIR, 'in-app-full-light.html'),
    out: path.join(OUTPUT_DIR, 'journal-app-full-light.png'),
    width: 1000,
    height: 1140,
    scale: 2,
  },
  {
    html: path.join(TEMPLATES_DIR, 'in-app-full-dark.html'),
    out: path.join(OUTPUT_DIR, 'journal-app-full-dark.png'),
    width: 1000,
    height: 1140,
    scale: 2,
  }
];

tasks.forEach(t => {
  console.log(`Rendering ${path.basename(t.out)} (${t.width}x${t.height} @${t.scale}x)...`);
  const cmd = `"${CHROME_BIN}" --headless --disable-gpu --screenshot="${t.out}" --window-size=${t.width},${t.height} --force-device-scale-factor=${t.scale} --hide-scrollbars "file://${t.html}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log(`✓ Generated ${t.out}`);
});

// Copy og-journal-ai-dark.png as public/og-image.png
fs.copyFileSync(
  path.join(OUTPUT_DIR, 'og-journal-ai-dark.png'),
  path.join(process.cwd(), 'public/og-image.png')
);
console.log('All screenshots rendered and public/og-image.png updated!');
