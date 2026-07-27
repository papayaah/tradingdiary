import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/chart/providers';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol');
  const date = searchParams.get('date'); // YYYYMMDD
  const interval = searchParams.get('interval') || '5m';

  if (!symbol || !date) {
    return NextResponse.json({ error: 'symbol and date required' }, { status: 400 });
  }

  try {
    const cookies = request.cookies;
    const provider = getActiveProvider(symbol, {
      preferredProvider: cookies.get('watcher_pref_provider')?.value,
      futuresProvider: cookies.get('watcher_futures_provider')?.value,
      databentoKey: cookies.get('watcher_databento_key')?.value,
      alpacaKeyId: cookies.get('watcher_alpaca_key_id')?.value,
      alpacaSecret: cookies.get('watcher_alpaca_secret')?.value,
      twelveKey: cookies.get('watcher_twelve_key')?.value,
      polygonKey: cookies.get('watcher_polygon_key')?.value,
      tiingoKey: cookies.get('watcher_tiingo_key')?.value,
    });
    const candles = await provider.fetchCandles(symbol, date, interval);

    return NextResponse.json({ 
      candles,
      provider: provider.name 
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Chart API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
