import { parseESignalTradeLog } from './trade-log-parser';
import { result, type BrokerAdapter } from '../types';

const adapter: BrokerAdapter = {
  id: 'esignal',
  name: 'eSignal',
  detect(source) {
    return source.content.includes('"Timestamp";"Category"') && source.content.includes('"Symbol"');
  },
  async parse(source) {
    const transactions = await parseESignalTradeLog(source.content);
    return result(adapter, 'trade-log-csv', transactions);
  },
};

export default adapter;
