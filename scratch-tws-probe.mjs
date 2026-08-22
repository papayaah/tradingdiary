import { IBApi, EventName, SecType } from '@stoqey/ib';

const ib = new IBApi({ host: '127.0.0.1', port: 7496, clientId: 11 });
let done = false;
const bars = [];
const hm = (t) => new Date(Number(t) * 1000).toISOString().slice(11, 16);
const fin = (m) => {
  if (done) return;
  done = true;
  console.log(m);
  try { ib.disconnect(); } catch {}
  setTimeout(() => process.exit(0), 200);
};

ib.on(EventName.error, (e, c) => {
  if (![2104, 2106, 2107, 2108, 2158, 2103, 2100, 2119, 2168, 2169, 2150].includes(c)) {
    console.log('ERR code=' + c + ' ' + String(e).slice(0, 150));
  }
});
ib.on(EventName.connected, () => console.log('CONNECTED to TWS'));
ib.on(EventName.currentTime, (t) => console.log('TWS server time = ' + new Date(t * 1000).toISOString()));
ib.on(EventName.managedAccounts, (a) => console.log('accounts = ' + a));
ib.on(EventName.historicalData, (r, t, o, h, l, cl, v) => {
  if (String(t).startsWith('finished')) {
    fin('AAPL 1m last4: ' + bars.slice(-4).join('  ') + '  |  probe now(UTC)=' + new Date().toISOString().slice(11, 16));
  } else {
    bars.push(hm(t) + '@' + cl);
  }
});
ib.once(EventName.nextValidId, () => {
  console.log('handshake OK (nextValidId received)');
  ib.reqCurrentTime();
  ib.reqHistoricalData(1, { symbol: 'AAPL', secType: SecType.STK, exchange: 'SMART', currency: 'USD' }, '', '600 S', '1 min', 'TRADES', 0, 2, false);
});
ib.connect();
setTimeout(() => fin('TIMEOUT (no data). bars=' + bars.length + (bars.length ? ' last=' + bars.slice(-2).join(' ') : '')), 20000);
