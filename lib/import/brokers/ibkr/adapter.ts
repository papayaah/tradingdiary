import { parseTLGFile } from './tlg-parser';
import type { NormalizedTransaction } from '../../types';
import {
  cleanSymbol,
  hasHeaders,
  normalizeBrokerSide,
  parseBrokerNumber,
  readValue,
  splitBrokerDateTime,
} from '../../core/values';
import { collectTransactions, parseDelimitedSource, skippedWarning } from '../delimited';
import { result, type BrokerAdapter, type BrokerImportSource } from '../types';

/** IBKR open/close indicator → 'O'|'C'. Ambiguous/partial (e.g. "C;O") → undefined. */
function normalizeOpenClose(raw: string | undefined): 'O' | 'C' | undefined {
  const v = (raw || '').trim().toUpperCase();
  const hasOpen = v.includes('O');
  const hasClose = v.includes('C');
  if (hasOpen && !hasClose) return 'O';
  if (hasClose && !hasOpen) return 'C';
  return undefined;
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attributes(fragment: string): Record<string, string> {
  const values: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*(["'])(.*?)\2/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment))) values[match[1]] = decodeXml(match[3]);
  return values;
}

function parseFlexXml(source: BrokerImportSource): NormalizedTransaction[] {
  const transactions: NormalizedTransaction[] = [];
  const tradePattern = /<Trade\b([^>]*)\/?\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tradePattern.exec(source.content))) {
    const trade = attributes(match[1]);
    const side = normalizeBrokerSide(trade.buySell || trade.side || '');
    const symbol = cleanSymbol(trade.symbol || trade.underlyingSymbol || '');
    const quantity = parseBrokerNumber(trade.quantity || '');
    const price = parseBrokerNumber(trade.tradePrice || trade.price || '');
    if (!side || !symbol || !quantity || price === undefined || price === 0) continue;

    // Execution timestamp (for ordering/display) — prefer the full dateTime.
    const dateTime = splitBrokerDateTime(
      `${trade.dateTime || trade.tradeDate || trade.date || ''} ${trade.tradeTime || trade.time || ''}`,
    );
    // Official trading day for attribution — IBKR's TradeDate (falls back to the
    // execution date when absent).
    const tradeDay = splitBrokerDateTime(`${trade.tradeDate || trade.date || ''}`);
    const commission = parseBrokerNumber(trade.ibCommission || trade.commission || '');
    const proceeds = parseBrokerNumber(trade.proceeds || '');
    transactions.push({
      accountId: trade.accountId || trade.accountID || trade.clientAccountID,
      symbol,
      side,
      date: dateTime.date,
      time: dateTime.time,
      tradeDate: tradeDay.date || dateTime.date,
      quantity: Math.abs(quantity),
      price: Math.abs(price),
      orderId: trade.transactionID || trade.tradeID || trade.orderID,
      assetClass: trade.assetClass || trade.assetCategory,
      multiplier: parseBrokerNumber(trade.multiplier || ''),
      companyName: trade.description || symbol,
      currency: trade.currency || 'USD',
      exchanges: trade.exchange || '',
      orderType: trade.orderType || undefined,
      // Keep IBKR's sign: commissions are charges (negative), matching the app's
      // netPnL = grossPnL + commission convention. Math.abs here double-counted
      // fees as a *gain* and made realized P&L drift from the broker's figures.
      commission: commission ?? 0,
      totalValue: proceeds === undefined ? undefined : Math.abs(proceeds),
      // IBKR's own realized P&L (FIFO) — authoritative, correct even for positions
      // opened before our import window. The aggregator prefers it over its own FIFO.
      realizedPnL: parseBrokerNumber(trade.fifoPnlRealized || trade.realizedPnL || ''),
      fxRateToBase: parseBrokerNumber(trade.fxRateToBase || ''),
      openClose: normalizeOpenClose(trade.openCloseIndicator || trade.openClose),
    });
  }

  return transactions;
}

async function parseFlexCsv(source: BrokerImportSource) {
  const { headers, rows } = await parseDelimitedSource(source);
  const { transactions, skipped } = collectTransactions(rows, (row, index) => {
    const side = normalizeBrokerSide(readValue(row, headers, ['Buy/Sell', 'BuySell']));
    const symbol = cleanSymbol(readValue(row, headers, ['Symbol', 'UnderlyingSymbol']));
    const quantity = parseBrokerNumber(readValue(row, headers, ['Quantity']));
    const price = parseBrokerNumber(readValue(row, headers, ['TradePrice', 'Trade Price']));
    if (!side || !symbol || !quantity || price === undefined || price === 0) return undefined;

    const combinedDateTime = readValue(row, headers, [
      'Date/Time',
      'DateTime',
      'TradeDateTime',
      'Trade Date/Time',
    ]);
    const tradeDateRaw = readValue(row, headers, ['TradeDate', 'Trade Date']);
    // Execution timestamp (ordering/display) from DateTime; day attribution from
    // the official TradeDate, which for overnight/foreign sessions lands on a
    // different calendar date than the DateTime (e.g. HK/EU trades stamped the
    // prior evening). Keeping them separate is what makes daily reports match IBKR.
    const dateTime = splitBrokerDateTime(combinedDateTime ||
      `${tradeDateRaw} ${readValue(row, headers, ['TradeTime', 'Trade Time'])}`,
    );
    const tradeDay = splitBrokerDateTime(tradeDateRaw);
    const commission = parseBrokerNumber(readValue(row, headers, ['IBCommission', 'IB Commission', 'Commission']));
    const proceeds = parseBrokerNumber(readValue(row, headers, ['Proceeds']));
    return {
      accountId: readValue(row, headers, ['ClientAccountID', 'AccountID', 'Account ID']),
      symbol,
      side,
      date: dateTime.date,
      time: dateTime.time,
      tradeDate: tradeDay.date || dateTime.date,
      quantity: Math.abs(quantity),
      price: Math.abs(price),
      orderId: readValue(row, headers, ['TransactionID', 'TradeID', 'OrderID']) || `ibkr-${dateTime.date}-${symbol}-${index}`,
      assetClass: readValue(row, headers, ['AssetClass', 'Asset Class', 'AssetCategory']),
      multiplier: parseBrokerNumber(readValue(row, headers, ['Multiplier', 'ContractMultiplier'])),
      companyName: readValue(row, headers, ['Description']) || symbol,
      currency: readValue(row, headers, ['Currency', 'CurrencyPrimary']) || 'USD',
      exchanges: readValue(row, headers, ['Exchange']),
      orderType: readValue(row, headers, ['OrderType', 'Order Type']) || undefined,
      // Keep IBKR's sign: commissions are charges (negative), matching the app's
      // netPnL = grossPnL + commission convention. Math.abs here double-counted
      // fees as a *gain* and made realized P&L drift from the broker's figures.
      commission: commission ?? 0,
      totalValue: proceeds === undefined ? undefined : Math.abs(proceeds),
      // IBKR's own realized P&L (FIFO) — authoritative, correct even for positions
      // opened before our import window. The aggregator prefers it over its own FIFO.
      realizedPnL: parseBrokerNumber(readValue(row, headers, ['FifoPnlRealized', 'RealizedPnL', 'Realized P&L', 'Realized P/L'])),
      fxRateToBase: parseBrokerNumber(readValue(row, headers, ['FXRateToBase', 'FxRateToBase', 'FX Rate To Base'])),
      openClose: normalizeOpenClose(readValue(row, headers, ['Open/CloseIndicator', 'OpenCloseIndicator', 'Open/Close'])),
    };
  });
  return { transactions, warnings: skippedWarning(skipped) };
}

const adapter: BrokerAdapter = {
  id: 'ibkr',
  name: 'Interactive Brokers',
  async detect(source) {
    return (source.content.includes('ACT_INF|') && /(?:STK|FUT)_TRD\|/.test(source.content))
      || (/<FlexQueryResponse\b/i.test(source.content) && /<Trade\b/i.test(source.content))
      || hasHeaders((await parseDelimitedSource(source)).headers, [
        ['ClientAccountID', 'AccountId'],
        ['Buy/Sell', 'BuySell'],
        ['Symbol'],
        ['Quantity'],
        ['TradePrice', 'Trade Price'],
        ['TradeDate', 'Trade Date', 'Date/Time', 'DateTime', 'TradeDateTime'],
      ]);
  },
  async parse(source) {
    if (/<FlexQueryResponse\b/i.test(source.content)) {
      return result(adapter, 'flex-query-xml', parseFlexXml(source));
    }

    if (!source.content.includes('ACT_INF|')) {
      const parsed = await parseFlexCsv(source);
      return result(adapter, 'flex-query-csv', parsed.transactions, parsed.warnings);
    }

    const parsed = parseTLGFile(source.content);
    const transactions: NormalizedTransaction[] = parsed.transactions.map((trade) => ({
      symbol: trade.symbol,
      side: trade.side.startsWith('BUY') ? 'BUY' : 'SELL',
      date: trade.date,
      time: trade.time,
      // The .tlg date column is IBKR's trade date — use it directly for day
      // attribution (no session-roll derivation needed).
      tradeDate: trade.date,
      quantity: Math.abs(trade.quantity),
      price: Math.abs(trade.price),
      orderId: trade.tradeId,
      companyName: trade.companyName || trade.symbol,
      currency: trade.currency || parsed.account.currency || 'USD',
      exchanges: trade.exchanges,
      orderType: trade.orderType,
      commission: trade.commission,
      totalValue: trade.totalValue,
      multiplier: trade.multiplier,
      realizedPnL: trade.realizedPnL ?? undefined,
      unrealizedPnL: trade.unrealizedPnL ?? undefined,
      // Final .tlg column (parsed into feeMultiplier) is IBKR's per-trade FX rate.
      fxRateToBase: trade.feeMultiplier,
      // The .tlg states open vs close explicitly (BUYTOOPEN/SELLTOCLOSE/…); keep it
      // so the converter doesn't have to (mis)guess from running position.
      openClose: trade.side.includes('OPEN') ? 'O' : 'C',
    }));
    return result(adapter, 'tradelog-tlg', transactions);
  },
};

export default adapter;
