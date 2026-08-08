import {
  cleanSymbol,
  findHeader,
  hasHeaders,
  normalizeBrokerSide,
  parseBrokerNumber,
  readValue,
  splitBrokerDateTime,
} from '../../core/values';
import { collectTransactions, parseDelimitedSource, skippedWarning } from '../delimited';
import { result, type BrokerAdapter } from '../types';

const QUANTITY_HEADERS = ['Filled Qty', 'Filled Quantity', 'Filled/Total Qty', 'Quantity', 'Qty'];
const PRICE_HEADERS = ['Avg Price', 'Average Fill Price', 'Filled Price', 'Fill Price', 'Price'];
const TIME_HEADERS = ['Filled Time', 'Fill Time', 'Executed At', 'Time', 'Date'];

const adapter: BrokerAdapter = {
  id: 'webull',
  name: 'Webull',
  async detect(source) {
    const { headers } = await parseDelimitedSource(source);
    return hasHeaders(headers, [['Symbol'], ['Side'], ['Status']])
      && Boolean(findHeader(headers, QUANTITY_HEADERS))
      && Boolean(findHeader(headers, PRICE_HEADERS))
      && Boolean(findHeader(headers, TIME_HEADERS));
  },
  async parse(source) {
    const { headers, rows } = await parseDelimitedSource(source);
    const { transactions, skipped } = collectTransactions(rows, (row, index) => {
      const status = readValue(row, headers, ['Status']);
      const side = normalizeBrokerSide(readValue(row, headers, ['Side']));
      const symbol = cleanSymbol(readValue(row, headers, ['Symbol']));
      const quantityHeader = findHeader(headers, QUANTITY_HEADERS);
      const quantityText = (quantityHeader ? String(row[quantityHeader] ?? '') : '').split('/')[0];
      const quantity = parseBrokerNumber(quantityText);
      const price = parseBrokerNumber(readValue(row, headers, PRICE_HEADERS));
      if (!side || !symbol || !quantity || price === undefined || price === 0) return undefined;
      if (status && !/filled/i.test(status) && !/filled/i.test(quantityHeader || '')) return undefined;

      const dateTime = splitBrokerDateTime(readValue(row, headers, TIME_HEADERS));
      const amount = parseBrokerNumber(readValue(row, headers, ['Amount']));
      return {
        symbol,
        side,
        date: dateTime.date,
        time: dateTime.time,
        quantity: Math.abs(quantity),
        price: Math.abs(price),
        orderId: readValue(row, headers, ['Order ID', 'Order No.']) || `webull-${dateTime.date}-${symbol}-${index}`,
        companyName: symbol,
        currency: readValue(row, headers, ['Currency']) || 'USD',
        orderType: readValue(row, headers, ['Type', 'Order Type']) || undefined,
        totalValue: amount === undefined ? undefined : Math.abs(amount),
      };
    });
    return result(adapter, 'order-history-csv', transactions, skippedWarning(skipped));
  },
};

export default adapter;
