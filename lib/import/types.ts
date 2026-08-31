export interface NormalizedTransaction {
    // Required
    symbol: string;         // e.g. "XIAOMI-W", "AAPL"
    side: 'BUY' | 'SELL';   // simplified from BUYTOOPEN etc.
    date: string;           // ISO-ish, any parseable format e.g. "2023-01-04"
    quantity: number;       // shares/lots (absolute, unsigned)
    price: number;          // executed/avg price

    // Optional
    time?: string;          // HH:MM:SS, defaults to "00:00:00"
    accountId?: string;     // broker account identifier, used by server-side connectors
    orderId?: string;       // becomes tradeId, auto-generated if missing
    assetClass?: string;    // e.g. STK or FUT
    multiplier?: number;    // futures/option contract multiplier
    companyName?: string;   // defaults to symbol
    currency?: string;      // defaults to "USD"
    exchanges?: string;     // defaults to ""
    orderType?: string;     // defaults to "MARKET"
    totalValue?: number;    // defaults to qty * price
    commission?: number;    // defaults to 0
    realizedPnL?: number;   // realized profit/loss
    unrealizedPnL?: number; // unrealized profit/loss
    stockCode?: string;     // broker-specific code, e.g. "HK 01810"
    fxRateToBase?: number;  // broker's exact per-trade rate: trade currency → account base (e.g. USD)
}

export type ExtractedData = {
    headers: string[];
    rows: Record<string, string>[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
};

export type ColumnMapping = Record<keyof NormalizedTransaction, string | undefined>;

export type SideValueMapping = Record<string, 'BUY' | 'SELL'>;
