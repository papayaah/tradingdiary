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
    const provider = getActiveProvider();
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
