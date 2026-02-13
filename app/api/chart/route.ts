import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol');
  const date = searchParams.get('date'); // YYYYMMDD
  const interval = searchParams.get('interval') || '5m';

  if (!symbol || !date) {
    return NextResponse.json({ error: 'symbol and date required' }, { status: 400 });
  }

  const year = parseInt(date.substring(0, 4));
  const month = parseInt(date.substring(4, 6)) - 1;
  const day = parseInt(date.substring(6, 8));

  // Build period range: from market open to close for that day
  // Use day start (4:00 AM ET pre-market) to day end (8:00 PM ET after-hours)
  const startDate = new Date(year, month, day, 0, 0, 0);
  const endDate = new Date(year, month, day + 1, 0, 0, 0);
  const period1 = Math.floor(startDate.getTime() / 1000);
  const period2 = Math.floor(endDate.getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}&includePrePost=true`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Yahoo Finance returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json({ error: 'No data returned' }, { status: 404 });
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const { open, high, low, close, volume } = quote;

    const candles = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (open[i] != null && high[i] != null && low[i] != null && close[i] != null) {
        candles.push({
          time: timestamps[i] as number,
          open: open[i] as number,
          high: high[i] as number,
          low: low[i] as number,
          close: close[i] as number,
          volume: (volume?.[i] ?? 0) as number,
        });
      }
    }

    return NextResponse.json({ candles }, {
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch chart data' },
      { status: 500 }
    );
  }
}
