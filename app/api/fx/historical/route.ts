import { NextResponse } from 'next/server';
import { getExchangeRateTable } from '@/lib/fx/exchange-rate-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FxRequest = { date: string; currency: string };

const CODE = /^[A-Z]{3}$/;
const DATE = /^\d{8}$/;

export async function POST(request: Request) {
  if (!process.env.EXCHANGE_RATE_API_KEY) {
    return NextResponse.json({ error: 'Historical FX service is not configured' }, { status: 503 });
  }

  let body: { accountCurrency?: string; requests?: FxRequest[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const accountCurrency = body.accountCurrency?.trim().toUpperCase() ?? '';
  const items = body.requests ?? [];
  if (!CODE.test(accountCurrency) || !Array.isArray(items) || items.length > 1000) {
    return NextResponse.json({ error: 'Invalid FX request' }, { status: 400 });
  }

  const requestedByDate = new Map<string, Set<string>>();
  for (const item of items) {
    const currency = item.currency?.trim().toUpperCase() ?? '';
    if (!DATE.test(item.date) || !CODE.test(currency)) {
      return NextResponse.json({ error: 'Invalid currency or date' }, { status: 400 });
    }
    if (currency === accountCurrency) continue;
    const currencies = requestedByDate.get(item.date) ?? new Set<string>();
    currencies.add(currency);
    requestedByDate.set(item.date, currencies);
  }

  try {
    const entries = [...requestedByDate.entries()];
    const rates: Record<string, { rate: number; rateDate: string; provider: 'exchange-rate-api' }> = {};

    // Limit concurrent provider calls while still avoiding a serial waterfall.
    for (let offset = 0; offset < entries.length; offset += 8) {
      await Promise.all(entries.slice(offset, offset + 8).map(async ([date, currencies]) => {
        const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
        const table = await getExchangeRateTable(accountCurrency, isoDate);
        for (const currency of currencies) {
          const accountToSource = table.rates[currency];
          if (!Number.isFinite(accountToSource) || accountToSource <= 0) {
            throw new Error(`No ${currency}/${accountCurrency} rate for ${isoDate}`);
          }
          rates[`${date}:${currency}`] = {
            rate: 1 / accountToSource,
            rateDate: table.rateDate.replaceAll('-', ''),
            provider: 'exchange-rate-api',
          };
        }
      }));
    }

    return NextResponse.json({ accountCurrency, rates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historical FX lookup failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
