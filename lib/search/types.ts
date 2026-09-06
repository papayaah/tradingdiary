import type { AggregatedTrade } from '@/lib/trading/aggregator';
import type { DailyNoteRecord, TradeNoteRecord } from '@/lib/db/schema';

export type SearchResultKind = 'navigation' | 'action' | 'trade' | 'note';
export type SearchResultGroup = 'Go to' | 'Actions' | 'Trades' | 'Journal notes';

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  group: SearchResultGroup;
  title: string;
  subtitle: string;
  href: string;
  score: number;
  pnl?: number;
  side?: 'LONG' | 'SHORT';
  isOpen?: boolean;
  /** Trading day (YYYYMMDD) for trade/note results — shown in the row and used
   * to break score ties most-recent-first. */
  date?: string;
}

export interface SearchIndex {
  trades: AggregatedTrade[];
  dailyNotes: DailyNoteRecord[];
  tradeNotes: TradeNoteRecord[];
}

export interface ParsedSearchQuery {
  text: string;
  symbol?: string;
  side?: 'LONG' | 'SHORT';
  result?: 'win' | 'loss';
  status?: 'open' | 'closed';
  tag?: string;
  /** Exact trading day (YYYYMMDD). */
  date?: string;
  /** Partial-date narrowing: 4-digit year and/or 2-digit month (MM). */
  year?: string;
  month?: string;
}
