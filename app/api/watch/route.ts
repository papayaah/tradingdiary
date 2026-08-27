import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider, YahooProvider, effectiveProviderName } from '@/lib/chart/providers';
import { newYorkTradingDate } from '@/lib/scanner/candles';
import { parseScannerControl, readScannerControl } from '@/lib/scanner/control';
import { isCryptoMarketDataEnabled, isCryptoMarketDataSymbol } from '@/lib/features/market-data';
import { calculateEquityChangeFromDailyBars } from '@/lib/market/intraday-change';

const newYorkDate = (timestampMs: number) =>
  new Date(timestampMs).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
  });

const hasCurrentNewYorkCandles = (candles: { time: number }[]) => {
  const today = newYorkDate(Date.now());
  return candles.some((candle) => newYorkDate(candle.time * 1000) === today);
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '5m';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter is required' }, { status: 400 });
  }
  if (!isCryptoMarketDataEnabled() && isCryptoMarketDataSymbol(symbol)) {
    return NextResponse.json({ error: 'Crypto market data is temporarily unavailable' }, { status: 404 });
  }

  try {
    const control = await readScannerControl().catch(() => parseScannerControl(null));

    const provider = getActiveProvider(symbol, {
      preferredEquitiesProvider: control.providers.equity,
      preferredCryptoProvider: control.providers.crypto,
      preferredFuturesProvider: control.providers.futures,
    });
    const isFutures = symbol.toUpperCase().endsWith('=F')
      || symbol.toUpperCase().includes('.C.0')
      || symbol.startsWith('/');
    const isCrypto = symbol.toUpperCase().endsWith('-USD');

    // Deep-history request (manual pattern tester): fetch `days` of candles so
    // the chart can be panned back like TradingView, instead of a single day.
    // Uses the configured (paid) provider's range fetch; Yahoo is only touched
    // as a last resort when the provider yields nothing.
    const daysParam = searchParams.get('days');
    if (daysParam) {
      const days = Math.max(1, Math.min(1000, parseInt(daysParam, 10) || 1));
      // `before` (epoch seconds) pages further back: fetch the chunk immediately
      // older than what the client already has loaded.
      const beforeParam = searchParams.get('before');
      const endTimeMs = beforeParam ? (parseInt(beforeParam, 10) || 0) * 1000 : undefined;

      let historyCandles = provider.fetchRangeCandles
        ? await provider.fetchRangeCandles(symbol, interval, days, endTimeMs).catch(() => [])
        : await provider.fetchRecentCandles(symbol, interval).catch(() => []);
      let historyProvider = effectiveProviderName(provider);

      // Fallbacks only make sense for the initial ("now") window. When paging
      // older history, "recent"/Yahoo would return current-era bars instead of
      // the requested older range, so an empty result correctly means "no more".
      if (historyCandles.length === 0 && !endTimeMs) {
        historyCandles = await provider.fetchRecentCandles(symbol, interval).catch(() => []);
        if (historyCandles.length === 0) {
          const fallback = new YahooProvider();
          historyCandles = await fallback.fetchRecentCandles(symbol, interval).catch(() => []);
          if (historyCandles.length > 0) {
            historyProvider = `${fallback.name} (fallback from ${provider.name})`;
          }
        }
      }

      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        interval,
        provider: historyProvider,
        candles: historyCandles,
      }, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

    const tradingDate = newYorkTradingDate();
    let candles = isFutures || isCrypto
      ? await provider.fetchRecentCandles(symbol, interval)
      : await provider.fetchCandles(symbol, tradingDate, interval);
    // Report the provider that actually served the bars (IBKR vs Yahoo), not the
    // futures fallback chain's own name.
    let providerName = effectiveProviderName(provider);

    // Some entry-level equity feeds return intraday bars only through the
    // previous session. During pre-market that looks like a valid, but stale,
    // response. Yahoo's chart feed includes current extended-hours bars, so use
    // it when the configured equity provider has no candles for today's NY date.
    if (!isFutures && !isCrypto && provider.name !== 'Yahoo Finance' && !hasCurrentNewYorkCandles(candles)) {
      const fallback = new YahooProvider();
      // Constructed directly, so it bypasses the factory's tracking wrapper.
      const fallbackCandles = await fallback.fetchCandles(
        symbol,
        tradingDate,
        interval,
      );
      if (hasCurrentNewYorkCandles(fallbackCandles)) {
        candles = fallbackCandles;
        providerName = `${fallback.name} (live fallback from ${provider.name})`;
      }
    }

    // If still no candles (e.g. weekend or market closed), fetch recent multi-day candles so charts & pattern testing always work
    if (candles.length === 0) {
      candles = await provider.fetchRecentCandles(symbol, interval).catch(() => []);
      providerName = effectiveProviderName(provider);
      if (candles.length === 0) {
        const fallback = new YahooProvider();
        candles = await fallback.fetchRecentCandles(symbol, interval).catch(() => []);
        if (candles.length > 0) providerName = fallback.name;
      }
    }

    // The compact watch card normally receives its prior-close change from the
    // shared scanner state. An explicit user refresh/expansion can request the
    // same baseline alongside fresh candles so a stale scanner snapshot is
    // never combined with a current direct quote.
    let intradayChange: { amount: number; percent: number } | null = null;
    if (!isFutures && !isCrypto && searchParams.get('includeChange') === '1' && candles.length > 0) {
      const dailyCandles = await provider.fetchRecentCandles(symbol, '1d').catch(() => []);
      const latest = candles.at(-1);
      if (latest) {
        intradayChange = calculateEquityChangeFromDailyBars(
          dailyCandles,
          latest.close,
          latest.time,
        );
      }
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      interval,
      provider: providerName,
      candles,
      intradayChange: intradayChange?.amount ?? null,
      intradayChangePercent: intradayChange?.percent ?? null,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Watch API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch watch candles' },
      { status: 500 }
    );
  }
}
