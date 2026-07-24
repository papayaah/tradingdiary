import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider, YahooProvider } from '@/lib/chart/providers';

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

  try {
    const cookies = request.cookies;
    const preferredProvider = cookies.get('watcher_pref_provider')?.value;
    const futuresProvider = cookies.get('watcher_futures_provider')?.value;
    const databentoKey = cookies.get('watcher_databento_key')?.value;
    const alpacaKeyId = cookies.get('watcher_alpaca_key_id')?.value;
    const alpacaSecret = cookies.get('watcher_alpaca_secret')?.value;
    const twelveKey = cookies.get('watcher_twelve_key')?.value;
    const polygonKey = cookies.get('watcher_polygon_key')?.value;
    const tiingoKey = cookies.get('watcher_tiingo_key')?.value;

    const provider = getActiveProvider(symbol, {
      preferredProvider,
      futuresProvider,
      databentoKey,
      alpacaKeyId,
      alpacaSecret,
      twelveKey,
      polygonKey,
      tiingoKey,
    });
    let candles = await provider.fetchRecentCandles(symbol, interval);
    let providerName = provider.name;

    // Some entry-level equity feeds return intraday bars only through the
    // previous session. During pre-market that looks like a valid, but stale,
    // response. Yahoo's chart feed includes current extended-hours bars, so use
    // it when the configured equity provider has no candles for today's NY date.
    const isFutures = symbol.toUpperCase().endsWith('=F')
      || symbol.toUpperCase().includes('.C.0')
      || symbol.startsWith('/');
    if (!isFutures && provider.name !== 'Yahoo Finance' && !hasCurrentNewYorkCandles(candles)) {
      const fallback = new YahooProvider();
      const fallbackCandles = await fallback.fetchRecentCandles(symbol, interval);
      if (hasCurrentNewYorkCandles(fallbackCandles)) {
        candles = fallbackCandles;
        providerName = `${fallback.name} (live fallback from ${provider.name})`;
      }
    }

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      interval,
      provider: providerName,
      candles,
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
