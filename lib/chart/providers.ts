import { OHLCCandle } from "./types";
import { recordProviderRequest, type KeyOwner } from "@/lib/metrics/provider-usage";

/**
 * Wrap a provider so every outbound request is counted (by provider name and
 * whose API key it uses). Recording is fire-and-forget and never affects the
 * fetch. This is the single choke point for the factory below; direct
 * provider construction elsewhere (e.g. the /api/watch Yahoo fallback and
 * /api/quotes) records explicitly instead.
 */
function trackProvider(provider: ChartProvider, keyOwner: KeyOwner): ChartProvider {
    return {
        name: provider.name,
        fetchCandles: (symbol: string, date: string, interval: string) => {
            void recordProviderRequest(provider.name, keyOwner);
            return provider.fetchCandles(symbol, date, interval);
        },
        fetchRecentCandles: (symbol: string, interval: string) => {
            void recordProviderRequest(provider.name, keyOwner);
            return provider.fetchRecentCandles(symbol, interval);
        },
        // Optional deep-history fetch (used by the manual pattern tester). Only
        // forwarded when the underlying provider actually implements it, so the
        // /api/watch route can feature-detect it and fall back otherwise.
        fetchRangeCandles: provider.fetchRangeCandles
            ? (symbol: string, interval: string, days: number, endTimeMs?: number) => {
                  void recordProviderRequest(provider.name, keyOwner);
                  return provider.fetchRangeCandles!(symbol, interval, days, endTimeMs);
              }
            : undefined,
    };
}

interface PolygonAggregate {
    t: number; // timestamp (ms)
    o: number; // open
    h: number; // high
    l: number; // low
    c: number; // close
    v: number; // volume
}

interface IntradayPriceRecord {
    date?: string;
    datetime?: string;
    open: number | string;
    high: number | string;
    low: number | string;
    close: number | string;
    volume?: number | string;
}

interface DailyPriceRecord extends IntradayPriceRecord {
    adjOpen?: number | string;
    adjHigh?: number | string;
    adjLow?: number | string;
    adjClose?: number | string;
    adjVolume?: number | string;
}

interface TiingoCryptoPriceResponse {
    ticker?: string;
    baseCurrency?: string;
    quoteCurrency?: string;
    priceData?: IntradayPriceRecord[] | IntradayPriceRecord;
}

export interface ChartProvider {
    name: string;
    fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]>;
    fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]>;
    /**
     * Fetch a `days`-wide window of history for deep panning (manual tester).
     * Optional: providers that don't implement it fall back to fetchRecentCandles.
     * For daily intervals ('1d'/'D') implementations should return true daily bars.
     * `endTimeMs` (epoch ms) bounds the END of the window — used to page further
     * back as the user scrolls (fetch the chunk immediately older than what's
     * already loaded). When omitted the window ends at "now".
     */
    fetchRangeCandles?(symbol: string, interval: string, days: number, endTimeMs?: number): Promise<OHLCCandle[]>;
}

// IBKR/TWS-style futures symbols: ROOT + month code + 1-2 digit year.
// e.g. MNQU6 (Micro Nasdaq, Sep 2026), MGCQ6 (Micro Gold, Aug 2026), ESZ25.
// Month codes: F G H J K M N Q U V X Z.
const IBKR_FUTURES_RE = /^([A-Z]{1,4})[FGHJKMNQUVXZ]\d{1,2}$/;

/**
 * Detect futures symbols across the notations we ingest:
 * Yahoo continuous (NQ=F), legacy continuous (NQ.C.0), slash-prefixed (/NQ),
 * and IBKR contract codes (MNQU6).
 */
export function isFuturesSymbol(symbol: string): boolean {
    const s = symbol.toUpperCase().trim();
    return s.endsWith('=F') || s.includes('.C.0') || s.startsWith('/') || IBKR_FUTURES_RE.test(s);
}

/**
 * Reduce any futures notation to its product root (MNQU6 -> MNQ, /NQ -> NQ,
 * NQ=F -> NQ, NQ.C.0 -> NQ) so each provider can rebuild its own symbology.
 */
export function futuresRoot(symbol: string): string {
    let s = symbol.toUpperCase().trim();
    if (s.startsWith('/')) s = s.slice(1);
    s = s.replace('=F', '').replace(/\..*$/, '');
    const m = s.match(IBKR_FUTURES_RE);
    return m ? m[1] : s;
}

/**
 * Polygon.io Provider (Highly Reliable)
 */
class PolygonProvider implements ChartProvider {
    name = "Polygon.io";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        const isSecond = interval.endsWith('s');
        const multiplier = parseInt(interval.replace(/[ms]/g, '')) || 1;
        const timescale = isSecond ? 'second' : 'minute';
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timescale}/${formattedDate}/${formattedDate}?adjusted=true&sort=asc&limit=50000&extended_hours=true&apiKey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        if (!data.results) return [];

        return data.results.map((r: PolygonAggregate) => ({
            time: Math.floor(r.t / 1000), // ms -> sec
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
        }));
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

        // Fetch last 3 days to cover weekends/holidays
        const end = new Date();
        const start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        
        const formattedStart = formatDate(start);
        const formattedEnd = formatDate(end);
        const isSecond = interval.endsWith('s');
        const multiplier = parseInt(interval.replace(/[ms]/g, '')) || 1;
        const timescale = isSecond ? 'second' : 'minute';
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timescale}/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&extended_hours=true&apiKey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        if (!data.results) return [];

        return data.results.map((r: PolygonAggregate) => ({
            time: Math.floor(r.t / 1000), // ms -> sec
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
        }));
    }

    async fetchRangeCandles(symbol: string, interval: string, days: number, endTimeMs?: number): Promise<OHLCCandle[]> {
        const apiKey = process.env.POLYGON_API_KEY;
        if (!apiKey) throw new Error("Missing POLYGON_API_KEY");

        const end = endTimeMs ? new Date(endTimeMs) : new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStart = formatDate(start);
        const formattedEnd = formatDate(end);

        // Map the app interval to Polygon's multiplier/timescale. The intraday
        // fetchers only handle minutes/seconds; here we also resolve hours and days.
        const iv = interval.toLowerCase();
        let multiplier: number;
        let timescale: 'second' | 'minute' | 'hour' | 'day';
        if (iv === '1d' || iv === 'd') {
            multiplier = 1;
            timescale = 'day';
        } else if (iv.endsWith('h')) {
            multiplier = parseInt(iv) || 1;
            timescale = 'hour';
        } else if (iv.endsWith('s')) {
            multiplier = parseInt(iv.replace(/[ms]/g, '')) || 1;
            timescale = 'second';
        } else {
            multiplier = parseInt(iv.replace(/[ms]/g, '')) || 1;
            timescale = 'minute';
        }

        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timescale}/${formattedStart}/${formattedEnd}?adjusted=true&sort=asc&limit=50000&extended_hours=true&apiKey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);

        const data = await res.json();
        if (!data.results) return [];

        return data.results.map((r: PolygonAggregate) => ({
            time: Math.floor(r.t / 1000), // ms -> sec
            open: r.o,
            high: r.h,
            low: r.l,
            close: r.c,
            volume: r.v,
        }));
    }
}

/**
 * Alpaca Provider (Placeholder for future use)
 */
class AlpacaProvider implements ChartProvider {
    name = "Alpaca";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        // This is a placeholder for when you want to swap to Alpaca
        throw new Error("Alpaca provider not yet implemented");
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        throw new Error("Alpaca provider not yet implemented");
    }
}

function aggregateYahooCandles(candles: OHLCCandle[], factor: number): OHLCCandle[] {
    const intervalSeconds = factor * 5 * 60; // e.g., 2 * 5m = 10m (600s)
    const groups = new Map<number, OHLCCandle[]>();

    for (const c of candles) {
        const bucketTime = Math.floor(c.time / intervalSeconds) * intervalSeconds;
        if (!groups.has(bucketTime)) {
            groups.set(bucketTime, []);
        }
        groups.get(bucketTime)!.push(c);
    }

    const aggregated: OHLCCandle[] = [];
    for (const [time, chunk] of groups.entries()) {
        const open = chunk[0].open;
        const close = chunk[chunk.length - 1].close;
        const high = Math.max(...chunk.map(c => c.high));
        const low = Math.min(...chunk.map(c => c.low));
        const volume = chunk.reduce((sum, c) => sum + c.volume, 0);

        aggregated.push({ time, open, high, low, close, volume });
    }
    return aggregated;
}

/**
 * Yahoo Finance Provider (Free Fallback, less reliable)
 */
export class YahooProvider implements ChartProvider {
    name = "Yahoo Finance";
    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const needsAggregation = interval === '10m';
        const fetchInterval = needsAggregation ? '5m' : interval;
        // Yahoo serves futures under a continuous "ROOT=F" ticker (e.g. MNQ=F),
        // not IBKR contract codes like MNQU6, so map futures to that form.
        const cleanSymbol = isFuturesSymbol(symbol)
            ? `${futuresRoot(symbol)}=F`
            : symbol.startsWith('/') ? symbol.substring(1) : symbol;

        const year = parseInt(date.substring(0, 4));
        const month = parseInt(date.substring(4, 6)) - 1;
        const day = parseInt(date.substring(6, 8));

        const period1 = Math.floor(Date.UTC(year, month, day, 4, 0, 0) / 1000);
        const period2 = Math.floor(Date.UTC(year, month, day + 1, 4, 0, 0) / 1000);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?period1=${period1}&period2=${period2}&interval=${fetchInterval}&includePrePost=true`;

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const { open, high, low, close, volume } = quote;

        const candles: OHLCCandle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (open[i] != null && high[i] != null && low[i] != null && close[i] != null) {
                candles.push({
                    time: timestamps[i],
                    open: open[i],
                    high: high[i],
                    low: low[i],
                    close: close[i],
                    volume: volume?.[i] || 0,
                });
            }
        }

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const needsAggregation = interval === '10m';
        const fetchInterval = needsAggregation ? '5m' : interval;
        const cleanSymbol = isFuturesSymbol(symbol)
            ? `${futuresRoot(symbol)}=F`
            : symbol.startsWith('/') ? symbol.substring(1) : symbol;

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSymbol)}?interval=${fetchInterval}&range=2d&includePrePost=true`;

        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

        const data = await res.json();
        const result = data?.chart?.result?.[0];
        if (!result) return [];

        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const { open, high, low, close, volume } = quote;

        const candles: OHLCCandle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
            if (open[i] != null && high[i] != null && low[i] != null && close[i] != null) {
                candles.push({
                    time: timestamps[i],
                    open: open[i],
                    high: high[i],
                    low: low[i],
                    close: close[i],
                    volume: volume?.[i] || 0,
                });
            }
        }

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }
}

/**
 * Twelve Data Provider (Free tier: 8 API calls/min, 800/day, real-time US equities)
 */
class TwelveDataProvider implements ChartProvider {
    name = "Twelve Data";

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        return this.fetchRecentCandles(symbol, interval);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const apiKey = process.env.TWELVE_DATA_API_KEY;
        if (!apiKey) throw new Error("Missing TWELVE_DATA_API_KEY");

        const needsAggregation = interval === '10m' || interval === '2m';
        let fetchInterval = interval;
        if (interval === '10m') fetchInterval = '5m';
        if (interval === '2m') fetchInterval = '1m';

        const cleanSymbol = symbol.toUpperCase();
        const url = `https://api.twelvedata.com/time_series?symbol=${cleanSymbol}&interval=${fetchInterval}&outputsize=250&apikey=${apiKey}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Twelve Data API error: ${res.status}`);

        const data = await res.json();
        if (data.status === 'error') {
            throw new Error(`Twelve Data error: ${data.message}`);
        }

        const values = data.values || [];
        // Twelve Data returns newest first, so reverse to chronological order
        const candles: OHLCCandle[] = values.slice().reverse().map((v: IntradayPriceRecord) => ({
            time: Math.floor(new Date(v.datetime || v.date || '').getTime() / 1000),
            open: Number(v.open),
            high: Number(v.high),
            low: Number(v.low),
            close: Number(v.close),
            volume: Number(v.volume || 0),
        }));

        if (needsAggregation) {
            return aggregateYahooCandles(candles, 2);
        }

        return candles;
    }
}

/**
 * Tiingo IEX Provider
 */
class TiingoProvider implements ChartProvider {
    name = "Tiingo";
    apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private mapInterval(interval: string): string {
        const val = parseInt(interval.replace(/[ms]/g, '')) || 5;
        const isHour = interval.endsWith('h');
        if (isHour) {
            return `${val}hour`;
        }
        return `${val}min`;
    }

    private async fetchIntraday(
        symbol: string,
        startDate: string,
        interval: string,
        endDate?: string,
    ): Promise<OHLCCandle[]> {
        const freq = this.mapInterval(interval);
        const dateParams = `startDate=${startDate}${endDate ? `&endDate=${endDate}` : ''}`;
        // Tiingo does not include historical intraday volume unless it is
        // explicitly requested through `columns`. Without this, every mapped
        // candle receives volume=0 and volume-dependent detectors can never
        // match even though the feed supports OHLCV.
        const columns = 'open,high,low,close,volume';
        const query = `${dateParams}&resampleFreq=${freq}&afterHours=true&columns=${columns}&token=${this.apiKey}`;
        const cleanSymbol = symbol.toUpperCase();

        // The consolidated equity feed covers the full 4:00 AM–8:00 PM ET
        // session. Keep IEX as a compatibility fallback for accounts that
        // haven't been enabled for the newer endpoint yet.
        const urls = [
            `https://api.tiingo.com/tiingo/equity/intraday/${cleanSymbol}/prices?${query}`,
            `https://api.tiingo.com/iex/${cleanSymbol}/prices?${query}`,
        ];

        let lastStatus = 500;
        for (const url of urls) {
            const res = await fetch(url);
            lastStatus = res.status;
            if (!res.ok) continue;

            const data = await res.json();
            if (!Array.isArray(data)) continue;
            return data.map((r: IntradayPriceRecord) => ({
                time: Math.floor(new Date(r.date || r.datetime || '').getTime() / 1000),
                open: Number(r.open),
                high: Number(r.high),
                low: Number(r.low),
                close: Number(r.close),
                volume: Number(r.volume || 0),
            }));
        }

        throw new Error(`Tiingo API error: ${lastStatus}`);
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        return this.fetchIntraday(symbol, formattedDate, interval, formattedDate);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStart = formatDate(start);
        // Omitting endDate asks Tiingo for all data through the current moment.
        return this.fetchIntraday(symbol, formattedStart, interval);
    }

    // True daily bars from Tiingo's EOD endpoint (split/dividend adjusted).
    private async fetchDaily(symbol: string, startDate: string, endDate?: string): Promise<OHLCCandle[]> {
        const cleanSymbol = symbol.toUpperCase();
        const dateParams = `startDate=${startDate}${endDate ? `&endDate=${endDate}` : ''}`;
        const url = `https://api.tiingo.com/tiingo/daily/${cleanSymbol}/prices?${dateParams}&resampleFreq=daily&token=${this.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Tiingo daily API error: ${res.status}`);

        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((r: DailyPriceRecord) => ({
            time: Math.floor(new Date(r.date || '').getTime() / 1000),
            open: Number(r.adjOpen ?? r.open),
            high: Number(r.adjHigh ?? r.high),
            low: Number(r.adjLow ?? r.low),
            close: Number(r.adjClose ?? r.close),
            volume: Number(r.adjVolume ?? r.volume ?? 0),
        }));
    }

    async fetchRangeCandles(symbol: string, interval: string, days: number, endTimeMs?: number): Promise<OHLCCandle[]> {
        const end = endTimeMs ? new Date(endTimeMs) : new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        const formattedStart = start.toISOString().split('T')[0];
        // Only bound the end when paging older history; otherwise fetch through now.
        const formattedEnd = endTimeMs ? end.toISOString().split('T')[0] : undefined;
        const iv = interval.toLowerCase();
        if (iv === '1d' || iv === 'd') {
            return this.fetchDaily(symbol, formattedStart, formattedEnd);
        }
        return this.fetchIntraday(symbol, formattedStart, interval, formattedEnd);
    }
}

/**
 * Tiingo Crypto Provider
 *
 * App symbols use a separator (BTC-USD), while Tiingo's public crypto REST
 * endpoint uses concatenated base/quote symbols (BTCUSD).
 */
class TiingoCryptoProvider implements ChartProvider {
    name = "Tiingo Crypto";
    private apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private mapSymbol(symbol: string): string {
        return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    private mapInterval(interval: string): string {
        const val = parseInt(interval.replace(/[ms]/g, '')) || 5;
        return interval.endsWith('h') ? `${val}hour` : `${val}min`;
    }

    private async fetchCryptoCandles(
        symbol: string,
        startDate: string,
        interval: string,
        endDate?: string,
    ): Promise<OHLCCandle[]> {
        const ticker = this.mapSymbol(symbol);
        const params = new URLSearchParams({
            tickers: ticker,
            startDate,
            resampleFreq: this.mapInterval(interval),
            token: this.apiKey,
        });
        if (endDate) params.set('endDate', endDate);

        const res = await fetch(`https://api.tiingo.com/tiingo/crypto/prices?${params.toString()}`);
        if (!res.ok) {
            throw new Error(`Tiingo Crypto API error: ${res.status}`);
        }

        const payload = await res.json() as TiingoCryptoPriceResponse[];
        if (!Array.isArray(payload)) return [];

        const candles: OHLCCandle[] = [];
        for (const pair of payload) {
            const priceData = Array.isArray(pair.priceData)
                ? pair.priceData
                : pair.priceData
                    ? [pair.priceData]
                    : [];

            for (const record of priceData) {
                const time = Math.floor(new Date(record.date || record.datetime || '').getTime() / 1000);
                const open = Number(record.open);
                const high = Number(record.high);
                const low = Number(record.low);
                const close = Number(record.close);
                const volume = Number(record.volume || 0);

                if (
                    Number.isFinite(time)
                    && Number.isFinite(open)
                    && Number.isFinite(high)
                    && Number.isFinite(low)
                    && Number.isFinite(close)
                ) {
                    candles.push({ time, open, high, low, close, volume });
                }
            }
        }

        candles.sort((a, b) => a.time - b.time);
        return candles;
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        return this.fetchCryptoCandles(symbol, formattedDate, interval, formattedDate);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const start = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const formattedStart = start.toISOString().split('T')[0];
        return this.fetchCryptoCandles(symbol, formattedStart, interval);
    }
}

/**
 * IBKR Gateway Provider (CME futures via headless IB Gateway).
 *
 * Reads recent historical bars through the persistent socket client. Historical
 * data needs no real-time market-data subscription, so this works today. The
 * socket lib is lazy-imported so it never lands in the web/client bundle.
 */
export class IBKRProvider implements ChartProvider {
    name = "IBKR (CME)";

    async fetchCandles(symbol: string, _date: string, interval: string): Promise<OHLCCandle[]> {
        return this.fetchRecentCandles(symbol, interval);
    }

    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        const { getIbkrClient } = await import('./ibkr-client');
        return getIbkrClient().fetchRecentCandles(symbol, interval);
    }
}

/**
 * Tries each provider in order, moving on when one throws or returns no candles.
 * Lets the futures path degrade IBKR -> Yahoo instead of failing a
 * scan when the gateway is re-authing or down.
 */
export class FallbackProvider implements ChartProvider {
    // Name of the inner provider that actually served the most recent fetch
    // (e.g. "IBKR (CME)" vs "Yahoo Finance"), so callers can report the real
    // source instead of the chain's own name. A fresh instance is created per
    // getActiveProvider() call, so this is safe to read right after an await.
    lastProviderUsed?: string;

    constructor(
        public name: string,
        private chain: ChartProvider[],
        private emptyWhenExhausted = false,
    ) {}

    /** The expected primary source (first in the chain) — used for entitlement
     *  scope / capability resolution, since the chain's own name ("Futures
     *  (auto)") isn't a real provider identity. */
    get primaryName(): string {
        return this.chain[0]?.name ?? this.name;
    }

    async fetchCandles(symbol: string, date: string, interval: string): Promise<OHLCCandle[]> {
        return this.run((p) => p.fetchCandles(symbol, date, interval));
    }
    async fetchRecentCandles(symbol: string, interval: string): Promise<OHLCCandle[]> {
        return this.run((p) => p.fetchRecentCandles(symbol, interval));
    }
    async fetchRangeCandles(symbol: string, interval: string, days: number, endTimeMs?: number): Promise<OHLCCandle[]> {
        // Prefer each provider's deep-history fetch, falling back to its recent
        // window so a provider without range support still contributes candles.
        return this.run((p) =>
            p.fetchRangeCandles
                ? p.fetchRangeCandles(symbol, interval, days, endTimeMs)
                : p.fetchRecentCandles(symbol, interval),
        );
    }
    private async run(fn: (p: ChartProvider) => Promise<OHLCCandle[]>): Promise<OHLCCandle[]> {
        let lastError: unknown = new Error('no providers configured');
        for (const provider of this.chain) {
            try {
                const candles = await fn(provider);
                if (candles.length) {
                    this.lastProviderUsed = provider.name;
                    return candles;
                }
                lastError = new Error(`${provider.name} returned no candles`);
            } catch (error) {
                lastError = error;
            }
        }
        if (this.emptyWhenExhausted) {
            this.lastProviderUsed = this.primaryName;
            return [];
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
}

// These contracts are available through the deployed IBKR gateway but do not
// have a reliable Yahoo futures endpoint. Exhausted fallback therefore means
// "no data" rather than a failed scan/request.
const IBKR_PRIMARY_FUTURES_ROOTS = new Set(['K200', 'HSI', 'SPI', 'SSG']);

/** The effective provider name for a fetch: the winning inner provider when it's
 *  a fallback chain, otherwise the provider's own name. Read after the fetch. */
export function effectiveProviderName(provider: ChartProvider): string {
    return (provider as FallbackProvider).lastProviderUsed ?? provider.name;
}

export interface UserProviderConfig {
    preferredProvider?: string;
    alpacaKeyId?: string;
    alpacaSecret?: string;
    twelveKey?: string;
    polygonKey?: string;
    tiingoKey?: string;
}

/**
 * Factory to get the active provider based on environment variables or user config.
 * Supports distinct routing for Equities vs Futures.
 */
export function getActiveProvider(
    symbol?: string,
    userConfig?: UserProviderConfig,
    assetClass?: 'equity' | 'futures' | 'crypto',
): ChartProvider {
    const upperSymbol = symbol ? symbol.toUpperCase() : '';
    // Trust an explicit futures asset class (e.g. a watch storing the bare root
    // "MES") in addition to symbol-notation sniffing ("MNQU6", "NQ=F").
    const isFutures = assetClass === 'futures' || (symbol ? isFuturesSymbol(symbol) : false);
    const isCrypto = upperSymbol.endsWith('-USD');

    // 'user' when the request will use a user-supplied key (their quota), else
    // 'owner' (the app's env key — this is what costs the owner). Yahoo has no
    // key and is recorded as 'owner' since it still leaves the owner's server.
    const owner = (userKey?: string): KeyOwner => (userKey ? 'user' : 'owner');

    // Handle Futures Data Feed Selection separately
    if (isFutures) {
        const cleanRoot = futuresRoot(upperSymbol);
        const isIbkrPrimaryRoot = IBKR_PRIMARY_FUTURES_ROOTS.has(cleanRoot);
        // IBKR is only usable where the Gateway is reachable (the scanner/server
        // process), signalled by IBKR_GATEWAY_HOST / IBKR_ENABLED.
        const ibkrConfigured = Boolean(process.env.IBKR_GATEWAY_HOST) || process.env.IBKR_ENABLED === 'true';

        // Futures always use the deployed gateway first and Yahoo as the only
        // fallback. effectiveProviderName() reports whichever actually served.
        const chain: ChartProvider[] = [];
        if (ibkrConfigured) {
            chain.push(trackProvider(new IBKRProvider(), 'owner'));
        }
        chain.push(trackProvider(new YahooProvider(), 'owner'));
        return chain.length === 1 && !isIbkrPrimaryRoot
            ? chain[0]
            : new FallbackProvider('Futures', chain, isIbkrPrimaryRoot);
    }

    // Handle Equities Data Feed Selection
    const pref = userConfig?.preferredProvider || 'auto';

    // Crypto uses Tiingo's dedicated crypto endpoint, not its equity/IEX
    // endpoints. Yahoo remains the zero-config fallback for crypto symbols.
    if (isCrypto) {
        if (pref === 'yahoo') return trackProvider(new YahooProvider(), 'owner');
        if (pref === 'tiingo' || pref === 'auto') {
            const key = userConfig?.tiingoKey || process.env.TIINGO_API_KEY;
            if (key) return trackProvider(new TiingoCryptoProvider(key), owner(userConfig?.tiingoKey));
        }
        return trackProvider(new YahooProvider(), 'owner');
    }

    if (pref === 'alpaca') {
        const keyId = userConfig?.alpacaKeyId || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_API_KEY;
        const secret = userConfig?.alpacaSecret || process.env.ALPACA_SECRET_KEY || process.env.ALPACA_API_SECRET;
        if (keyId && secret) return trackProvider(new AlpacaProvider(), owner(userConfig?.alpacaKeyId));
    }

    if (pref === 'twelve') {
        const key = userConfig?.twelveKey || process.env.TWELVE_DATA_API_KEY;
        if (key) return trackProvider(new TwelveDataProvider(), owner(userConfig?.twelveKey));
    }

    if (pref === 'polygon') {
        const key = userConfig?.polygonKey || process.env.POLYGON_API_KEY;
        if (key) return trackProvider(new PolygonProvider(), owner(userConfig?.polygonKey));
    }

    if (pref === 'tiingo') {
        const key = userConfig?.tiingoKey || process.env.TIINGO_API_KEY;
        if (key) return trackProvider(new TiingoProvider(key), owner(userConfig?.tiingoKey));
    }

    if (pref === 'yahoo') {
        return trackProvider(new YahooProvider(), 'owner');
    }

    // Default 'auto' fallback chain for Equities:
    if (userConfig?.tiingoKey || process.env.TIINGO_API_KEY) {
        return trackProvider(new TiingoProvider(userConfig?.tiingoKey || process.env.TIINGO_API_KEY || ''), owner(userConfig?.tiingoKey));
    }

    if (userConfig?.polygonKey || process.env.POLYGON_API_KEY) {
        return trackProvider(new PolygonProvider(), owner(userConfig?.polygonKey));
    }

    if (userConfig?.alpacaKeyId || process.env.ALPACA_API_KEY_ID || process.env.ALPACA_API_KEY) {
        return trackProvider(new AlpacaProvider(), owner(userConfig?.alpacaKeyId));
    }

    if (userConfig?.twelveKey || process.env.TWELVE_DATA_API_KEY) {
        return trackProvider(new TwelveDataProvider(), owner(userConfig?.twelveKey));
    }

    // Default: Yahoo
    return trackProvider(new YahooProvider(), 'owner');
}
