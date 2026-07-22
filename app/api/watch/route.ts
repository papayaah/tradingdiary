import { NextRequest, NextResponse } from 'next/server';
import { getActiveProvider } from '@/lib/chart/providers';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '5m';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter is required' }, { status: 400 });
  }

  try {
    const provider = getActiveProvider(symbol);
    const candles = await provider.fetchRecentCandles(symbol, interval);

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      interval,
      provider: provider.name,
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
