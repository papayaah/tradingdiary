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
  id: 'fidelity',
  name: 'Fidelity',
  async detect(source) {
    const { headers } = await parseDelimitedSource(source);
    return hasHeaders(headers, [
      ['Run Date', 'Trade Date'],
      ['Action'],
      ['Symbol'],
      ['Security Description', 'Description'],
      ['Quantity'],
      ['Commission ($)', 'Commission'],
      ['Settlement Date'],
    ]);
  },
  async parse(source) {
    const { headers, rows } = await parseDelimitedSource(source);
    const { transactions, skipped } = collectTransactions(rows, (row, index) => {
      const action = readValue(row, headers, ['Action']);
      const side = normalizeBrokerSide(action);
      const symbol = cleanSymbol(readValue(row, headers, ['Symbol']));
      const quantity = parseBrokerNumber(readValue(row, headers, ['Quantity']));
      const price = parseBrokerNumber(readValue(row, headers, ['Price ($)', 'Price']));
      if (!side || !symbol || !quantity || price === undefined || price === 0) return undefined;

      const dateTime = splitBrokerDateTime(readValue(row, headers, ['Run Date', 'Trade Date']));
      const commission = parseBrokerNumber(readValue(row, headers, ['Commission ($)', 'Commission'])) ?? 0;
      const fees = parseBrokerNumber(readValue(row, headers, ['Fees ($)', 'Fees'])) ?? 0;
      const amount = parseBrokerNumber(readValue(row, headers, ['Amount ($)', 'Amount']));
      return {
        symbol,
        side,
        date: dateTime.date,
        time: dateTime.time,
        quantity: Math.abs(quantity),
        price: Math.abs(price),
        orderId: `fidelity-${dateTime.date}-${symbol}-${index}`,
        companyName: readValue(row, headers, ['Security Description', 'Description']) || symbol,
        currency: readValue(row, headers, ['Currency']) || 'USD',
        commission: Math.abs(commission) + Math.abs(fees),
        totalValue: amount === undefined ? undefined : Math.abs(amount),
      };
    });
    return result(adapter, 'account-history-csv', transactions, skippedWarning(skipped));
  },
};

export default adapter;
