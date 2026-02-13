export interface NormalizedTransaction {
    // Required
    symbol: string;         // e.g. "XIAOMI-W", "AAPL"
    side: 'BUY' | 'SELL';   // simplified from BUYTOOPEN etc.
    date: string;           // ISO-ish, any parseable format e.g. "2023-01-04"
    quantity: number;       // shares/lots (absolute, unsigned)
    price: number;          // executed/avg price

    // Optional
    time?: string;          // HH:MM:SS, defaults to "00:00:00"
    orderId?: string;       // becomes tradeId, auto-generated if missing
    companyName?: string;   // defaults to symbol
    currency?: string;      // defaults to "USD"
    exchanges?: string;     // defaults to ""
    orderType?: string;     // defaults to "MARKET"
    totalValue?: number;    // defaults to qty * price
    commission?: number;    // defaults to 0
    stockCode?: string;     // broker-specific code, e.g. "HK 01810"
}

export type ExtractedData = {
    headers: string[];
    rows: Record<string, string>[];
};

export type ColumnMapping = Record<keyof NormalizedTransaction, string | undefined>;

export type SideValueMapping = Record<string, 'BUY' | 'SELL'>;
