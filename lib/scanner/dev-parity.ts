// Aggregation parity proof: fetch a symbol's NATIVE candles at the target
// interval AND its 1m base from the live provider, derive the target from the
// base, and report any mismatch. This is the gate for turning SCANNER_AGGREGATION
// on: run it across representative symbols/intervals and confirm every report is
// OK before flipping the flag. Not shipped to production; run manually.
//
//   DATABASE_URL=... npx tsx lib/scanner/dev-parity.ts AAPL 10m equity
//   npx tsx lib/scanner/dev-parity.ts AAPL 5m,10m,15m equity
//
// It fetches directly through the provider factory (not the shared cache), so no
// Redis is required and no cache entries are written.

import '@/lib/scanner/load-env'; // must be first: load env before provider import
import { fetchCandles } from '@/lib/scanner/candles';
import { BASE_INTERVAL } from '@/lib/scanner/shared/aggregate';
import { compareDerivedToNative, formatParityReport } from '@/lib/scanner/shared/aggregation-parity';
import type { AssetClass } from '@/lib/scanner/sessions';

const SYMBOL = process.argv[2] || 'AAPL';
const INTERVALS = (process.argv[3] || '5m,10m,15m').split(',').map((s) => s.trim()).filter(Boolean);
const ASSET_CLASS = (process.argv[4] as AssetClass) || 'equity';

async function main() {
  console.log(`[parity] ${SYMBOL} (${ASSET_CLASS}) — fetching 1m base…`);
  const baseResult = await fetchCandles(SYMBOL, BASE_INTERVAL, ASSET_CLASS);
  console.log(`[parity] base: ${baseResult.candles.length} 1m bars via ${baseResult.provider}`);

  if (baseResult.candles.length === 0) {
    console.error('[parity] no 1m base candles returned — cannot check parity (market closed? bad symbol?)');
    process.exit(1);
  }

  let allOk = true;
  for (const interval of INTERVALS) {
    const nativeResult = await fetchCandles(SYMBOL, interval, ASSET_CLASS);
    const report = compareDerivedToNative(baseResult.candles, nativeResult.candles, interval);
    console.log(`[parity] ${formatParityReport(SYMBOL, report)}  (native via ${nativeResult.provider})`);
    if (!report.ok) {
      allOk = false;
      for (const m of report.mismatches.slice(0, 10)) {
        const at = new Date(m.time * 1000).toISOString();
        console.log(
          `         ${at} ${m.field}` +
            (m.relDiff !== undefined
              ? ` native=${m.native} derived=${m.derived} relDiff=${m.relDiff.toExponential(2)}`
              : ''),
        );
      }
    }
  }

  console.log(`[parity] RESULT: ${allOk ? 'ALL OK — safe to enable aggregation for this symbol' : 'MISMATCHES FOUND — do not enable yet'}`);
  process.exit(allOk ? 0 : 2);
}

main().catch((err) => {
  console.error('[parity] fatal:', err);
  process.exit(1);
});
