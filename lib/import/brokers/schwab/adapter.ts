import {
  cleanSymbol,
  hasHeaders,
  normalizeBrokerSide,
  parseBrokerNumber,
  readValue,
  splitBrokerDateTime,
} from '../../core/values';
import { collectTransactions, parseDelimitedSource, skippedWarning } from '../delimited';
import { result, type BrokerAdapter } from '../types';

const adapter: BrokerAdapter = {
  id: 'schwab',
  name: 'Charles Schwab',
  async detect(source) {
    const { headers } = await parseDelimitedSource(source);
    return hasHeaders(headers, [
      ['Date'],
      ['Action'],
      ['Symbol'],
      ['Description'],
      ['Quantity'],
      ['Fees & Comm', 'Fees & Commission'],
      ['Amount'],
    ]);
  },
  async parse(source) {
    const { headers, rows } = await parseDelimitedSource(source);
    const { transactions, skipped } = collectTransactions(rows, (row, index) => {
      const side = normalizeBrokerSide(readValue(row, headers, ['Action']));
      const symbol = cleanSymbol(readValue(row, headers, ['Symbol']));
      const quantity = parseBrokerNumber(readValue(row, headers, ['Quantity']));
      const price = parseBrokerNumber(readValue(row, headers, ['Price']));
      if (!side || !symbol || !quantity || price === undefined || price === 0) return undefined;

      const dateTime = splitBrokerDateTime(readValue(row, headers, ['Date']));
      const commission = parseBrokerNumber(readValue(row, headers, ['Fees & Comm', 'Fees & Commission']));
      const amount = parseBrokerNumber(readValue(row, headers, ['Amount']));
      return {
        symbol,
        side,
        date: dateTime.date,
        time: dateTime.time,
        quantity: Math.abs(quantity),
        price: Math.abs(price),
        orderId: `schwab-${dateTime.date}-${symbol}-${index}`,
        companyName: readValue(row, headers, ['Description']) || symbol,
        currency: 'USD',
        commission: Math.abs(commission ?? 0),
        totalValue: amount === undefined ? undefined : Math.abs(amount),
      };
    });
    return result(adapter, 'transactions-csv', transactions, skippedWarning(skipped));
  },
};

export default adapter;
