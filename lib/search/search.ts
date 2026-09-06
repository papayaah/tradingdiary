import type { ParsedSearchQuery, SearchIndex, SearchResult } from './types';

/** Max rows returned. Bounded so an ambiguous query (e.g. a single letter) can't
 * render thousands of rows; the UI hints when results are truncated. */
export const MAX_SEARCH_RESULTS = 50;

const NAVIGATION: Omit<SearchResult, 'score'>[] = [
  { id: 'nav-dashboard', kind: 'navigation', group: 'Go to', title: 'Dashboard', subtitle: 'Performance, analytics, and calendar', href: '/dashboard' },
  { id: 'nav-journal', kind: 'navigation', group: 'Go to', title: 'Trading Journal', subtitle: 'Trades, charts, and notes', href: '/journal' },
  { id: 'nav-watch', kind: 'navigation', group: 'Go to', title: 'Market Watch', subtitle: 'Watchlists, scans, and alerts', href: '/watch' },
  { id: 'nav-library', kind: 'navigation', group: 'Go to', title: 'Library', subtitle: 'Screenshots and imported files', href: '/media' },
  { id: 'nav-settings', kind: 'navigation', group: 'Go to', title: 'Settings', subtitle: 'Accounts, providers, and data', href: '/settings' },
];

const ACTIONS: Omit<SearchResult, 'score'>[] = [
  { id: 'action-add-trade', kind: 'action', group: 'Actions', title: 'Add a trade', subtitle: 'Open the manual trade panel', href: '/journal?action=add-trade' },
  { id: 'action-import', kind: 'action', group: 'Actions', title: 'Import trades', subtitle: 'Upload broker history or a screenshot', href: '/media?view=import' },
  { id: 'action-replay', kind: 'action', group: 'Actions', title: 'Replay trades', subtitle: 'Review execution bar by bar', href: '/replay' },
];

function compactDate(value: string): string | undefined {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length === 8 ? digits : undefined;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function parseSearchQuery(raw: string): ParsedSearchQuery {
  let working = raw.trim();
  const parsed: ParsedSearchQuery = { text: '' };
  const filters: Array<[RegExp, keyof ParsedSearchQuery, (value: string) => string | undefined]> = [
    [/\bsymbol:([a-z0-9.\-]+)\b/i, 'symbol', (value) => value.toUpperCase()],
    [/\bside:(long|short)\b/i, 'side', (value) => value.toUpperCase()],
    [/\bresult:(win|loss)\b/i, 'result', (value) => value.toLowerCase()],
    [/\bstatus:(open|closed)\b/i, 'status', (value) => value.toLowerCase()],
    [/\btag:([^\s]+)\b/i, 'tag', (value) => value.toLowerCase()],
    [/\bdate:([0-9-]+)\b/i, 'date', compactDate],
  ];

  for (const [pattern, key, transform] of filters) {
    const match = working.match(pattern);
    if (!match) continue;
    const value = transform(match[1]);
    if (value) Object.assign(parsed, { [key]: value });
    working = working.replace(match[0], ' ');
  }

  const lower = working.toLowerCase();
  if (!parsed.side && /\b(long|short)\b/.test(lower)) parsed.side = lower.match(/\b(long|short)\b/)?.[1].toUpperCase() as 'LONG' | 'SHORT';
  if (!parsed.result && /\b(wins?|winners?|profitable)\b/.test(lower)) parsed.result = 'win';
  if (!parsed.result && /\b(loss(es)?|losers?|losing)\b/.test(lower)) parsed.result = 'loss';
  if (!parsed.status && /\bopen positions?\b/.test(lower)) parsed.status = 'open';

  const dateMatch = working.match(/\b(20\d{2})[-/]?(0[1-9]|1[0-2])[-/]?([0-2]\d|3[01])\b/);
  if (!parsed.date && dateMatch) parsed.date = `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}`;

  working = working
    .replace(/\b(long|short|wins?|winners?|profitable|loss(es)?|losers?|losing|open positions?|closed positions?)\b/gi, ' ')
    .replace(/\b20\d{2}[-/]?(0[1-9]|1[0-2])[-/]?([0-2]\d|3[01])\b/g, ' ');

  // Partial dates so "nvda 2025", "nvda may", and "nvda may 2024" all narrow.
  if (!parsed.date) {
    const ym = working.match(/\b((?:19|20)\d{2})[-/](0[1-9]|1[0-2])\b/);
    if (ym) {
      parsed.year = ym[1];
      parsed.month = ym[2];
      working = working.replace(ym[0], ' ');
    }

    const monthMatch = working.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
    );
    if (monthMatch && !parsed.month) {
      parsed.month = MONTHS[monthMatch[1].slice(0, 3).toLowerCase()];
      working = working.replace(monthMatch[0], ' ');
    }

    const yearMatch = working.match(/\b(19|20)\d{2}\b/);
    if (yearMatch && !parsed.year) {
      parsed.year = yearMatch[0];
      working = working.replace(yearMatch[0], ' ');
    }
  }

  working = working.replace(/\s+/g, ' ').trim();
  parsed.text = working.toLowerCase();
  return parsed;
}

function textScore(query: string, title: string, subtitle: string): number {
  if (!query) return 1;
  const normalizedTitle = title.toLowerCase();
  const normalizedSubtitle = subtitle.toLowerCase();
  if (normalizedTitle === query) return 120;
  if (normalizedTitle.startsWith(query)) return 90;
  if (normalizedTitle.includes(query)) return 70;
  if (normalizedSubtitle.includes(query)) return 45;
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => `${normalizedTitle} ${normalizedSubtitle}`.includes(word))) return 35;
  return 0;
}

function excerpt(content: string, query: string): string {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Journal note';
  const index = query ? clean.toLowerCase().indexOf(query) : -1;
  const start = index > 45 ? index - 35 : 0;
  const value = clean.slice(start, start + 110);
  return `${start > 0 ? '…' : ''}${value}${start + 110 < clean.length ? '…' : ''}`;
}

export function searchIndex(index: SearchIndex, rawQuery: string): SearchResult[] {
  const query = parseSearchQuery(rawQuery);
  const hasQuery = Boolean(rawQuery.trim());
  const hasTradeFilter = Boolean(
    query.symbol || query.side || query.result || query.status || query.date || query.year || query.month,
  );
  const matchesDate = (date: string): boolean =>
    (!query.date || date === query.date) &&
    (!query.year || date.slice(0, 4) === query.year) &&
    (!query.month || date.slice(4, 6) === query.month);
  const results: SearchResult[] = [];

  for (const item of [...NAVIGATION, ...ACTIONS]) {
    const score = rawQuery.trim() ? textScore(query.text || rawQuery.trim().toLowerCase(), item.title, item.subtitle) : item.kind === 'action' ? 18 : 12;
    if (score > 0) results.push({ ...item, score });
  }

  for (const trade of index.trades) {
    if (!hasQuery || query.tag) continue;
    if (query.symbol && trade.symbol.toUpperCase() !== query.symbol) continue;
    if (query.side && trade.side !== query.side) continue;
    if (query.result === 'win' && trade.netPnL <= 0) continue;
    if (query.result === 'loss' && trade.netPnL >= 0) continue;
    if (query.status === 'open' && !trade.isOpen) continue;
    if (query.status === 'closed' && trade.isOpen) continue;
    if (!matchesDate(trade.date)) continue;

    const subtitle = `${trade.companyName || trade.symbol} · ${trade.side.toLowerCase()} · ${trade.executions} execution${trade.executions === 1 ? '' : 's'}`;
    let score = textScore(query.text, trade.symbol, `${subtitle} ${trade.date}`);
    if (!query.text && hasTradeFilter) score = 80;
    if (score === 0) continue;
    results.push({
      id: `trade-${trade.date}-${trade.symbol}`,
      kind: 'trade',
      group: 'Trades',
      title: trade.symbol,
      subtitle,
      href: `/journal?date=${trade.date}&symbol=${encodeURIComponent(trade.symbol)}`,
      score: score + (trade.symbol.toLowerCase() === query.text ? 30 : 0),
      pnl: trade.netPnL + (trade.unrealizedPnL || 0),
      side: trade.side,
      isOpen: trade.isOpen,
      date: trade.date,
    });
  }

  const tagFilter = query.tag?.toLowerCase();
  for (const note of index.tradeNotes) {
    if (!hasQuery) continue;
    if (query.symbol && note.symbol.toUpperCase() !== query.symbol) continue;
    if (!matchesDate(note.date)) continue;
    if (!query.text && (query.side || query.result || query.status)) continue;
    if (tagFilter && !note.tags.some((tag) => tag.toLowerCase().includes(tagFilter))) continue;
    const searchable = `${note.symbol} ${note.tags.join(' ')} ${note.content}`;
    const score = textScore(query.text, note.symbol, searchable);
    if (score === 0 && !tagFilter) continue;
    results.push({
      id: `trade-note-${note.date}-${note.symbol}`,
      kind: 'note',
      group: 'Journal notes',
      title: `${note.symbol} note`,
      subtitle: excerpt(note.content || note.tags.join(', '), query.text),
      href: `/journal?date=${note.date}&symbol=${encodeURIComponent(note.symbol)}`,
      score: (score || 75) + 5,
      date: note.date,
    });
  }

  for (const note of index.dailyNotes) {
    if (!hasQuery) continue;
    if (!matchesDate(note.date)) continue;
    if (!query.text && (query.symbol || query.side || query.result || query.status)) continue;
    const score = textScore(query.text, `Notes for ${note.date}`, note.content);
    if (score === 0 || tagFilter) continue;
    results.push({
      id: `daily-note-${note.date}`,
      kind: 'note',
      group: 'Journal notes',
      title: `Notes for ${note.date}`,
      subtitle: excerpt(note.content, query.text),
      href: `/journal?date=${note.date}&notes=open`,
      score,
    });
  }

  // Score first; then, for equal scores (e.g. every same-symbol trade), the most
  // recent date wins so results read newest-first; title is the final tiebreak.
  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ad = a.date ?? '';
      const bd = b.date ?? '';
      if (ad !== bd) return bd.localeCompare(ad);
      return a.title.localeCompare(b.title);
    })
    .slice(0, MAX_SEARCH_RESULTS);
}
