export type JournalPrimitive = string | number | boolean | null;

export type JournalDimension =
  | 'tradingDay'
  | 'weekday'
  | 'month'
  | 'symbol'
  | 'side'
  | 'outcome'
  | 'accountName'
  | 'accountId'
  | 'currency'
  | 'openedHour'
  | 'isOpen';

export type JournalMeasure =
  | 'netPnL'
  | 'grossPnL'
  | 'commissionsPaid'
  | 'volume';

export type JournalField = JournalDimension | JournalMeasure;

export type JournalMetricOperation =
  | 'count'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'win_rate'
  | 'profit_factor';

export interface JournalMetric {
  operation: JournalMetricOperation;
  field?: JournalMeasure | null;
  alias?: string | null;
}

export interface JournalFilter {
  field: JournalField;
  operator:
    | 'equals'
    | 'not_equals'
    | 'greater_than'
    | 'at_least'
    | 'less_than'
    | 'at_most'
    | 'contains'
    | 'in'
    | 'between';
  value: JournalPrimitive | JournalPrimitive[];
}

export interface JournalOrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface JournalAnalyticsQuery {
  dimensions?: JournalDimension[] | null;
  metrics: JournalMetric[];
  filters?: JournalFilter[] | null;
  orderBy?: JournalOrderBy[] | null;
  limit?: number | null;
  accountScope?: 'selected' | 'all' | null;
  includeOpenTrades?: boolean | null;
}

export interface JournalAssistantEvidence {
  tradeGroupId: string;
  tradeGroupKey: string;
  accountId: string;
  accountName: string;
  symbol: string;
  tradingDay: string;
  side: 'LONG' | 'SHORT';
  netPnL: number;
  currency: string;
  href: string;
}

export interface JournalAnalyticsResult {
  query: JournalAnalyticsQuery;
  columns: string[];
  rows: Record<string, JournalPrimitive>[];
  evidence: JournalAssistantEvidence[];
  scannedTradeCount: number;
  matchedTradeCount: number;
  accountScopeLabel: string;
  currencies: string[];
  currencyWarning?: string;
  dataAsOf: string;
}

export interface JournalNoteSearchQuery {
  text?: string | null;
  symbol?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  accountScope?: 'selected' | 'all' | null;
  limit?: number | null;
}

export interface JournalNoteResult {
  kind: 'trade' | 'day';
  date: string;
  symbol?: string;
  accountId: string;
  accountName: string;
  content: string;
  href: string;
}

export interface JournalNoteSearchResult {
  query: string;
  notes: JournalNoteResult[];
  accountScopeLabel: string;
  dataAsOf: string;
}

export interface JournalAssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface JournalAssistantGrounding {
  analytics: JournalAnalyticsResult[];
  notes: JournalNoteSearchResult[];
  evidence: JournalAssistantEvidence[];
  schemaInspected?: boolean;
}

export interface JournalAssistantResponse {
  answer: string;
  grounding: JournalAssistantGrounding;
  provider: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  credits?: { remaining: number };
}
