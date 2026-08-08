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
  id: 'robinhood',
  name: 'Robinhood',
  async detect(source) {
    const { headers } = await parseDelimitedSource(source);
    return hasHeaders(headers, [
      ['Activity Date'],
      ['Trans Code'],
      ['Instrument'],
      ['Quantity'],
      ['Price'],
      ['Amount'],
    ]);
  },
  async parse(source) {
    const { headers, rows } = await parseDelimitedSource(source);
    const { transactions, skipped } = collectTransactions(rows, (row, index) => {
      const side = normalizeBrokerSide(readValue(row, headers, ['Trans Code']));
      const symbol = cleanSymbol(readValue(row, headers, ['Instrument', 'Symbol']));
      const quantity = parseBrokerNumber(readValue(row, headers, ['Quantity']));
      const price = parseBrokerNumber(readValue(row, headers, ['Price']));
      if (!side || !symbol || !quantity || price === undefined || price === 0) return undefined;

      const dateTime = splitBrokerDateTime(readValue(row, headers, ['Activity Date', 'Process Date']));
      const amount = parseBrokerNumber(readValue(row, headers, ['Amount']));
      return {
        symbol,
        side,
        date: dateTime.date,
        time: dateTime.time,
        quantity: Math.abs(quantity),
        price: Math.abs(price),
        orderId: `robinhood-${dateTime.date}-${symbol}-${index}`,
        companyName: readValue(row, headers, ['Description']) || symbol,
        currency: 'USD',
        totalValue: amount === undefined ? undefined : Math.abs(amount),
      };
    });
    return result(adapter, 'account-activity-csv', transactions, skippedWarning(skipped));
  },
};

export default adapter;
