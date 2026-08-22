import { config } from 'dotenv';
config({ path: '.env.local' });

const { syncIbkrFlexConnection } = await import('./lib/ibkr-flex/sync.ts');

const USER = 'ft8U9bxgeoT7uIsGYKqN5IXNVpNJqqzv';
let count = 0;
const result = await syncIbkrFlexConnection(USER, new Date(), (p) => {
  count += 1;
  // Only print stage transitions + occasional import ticks to keep it readable
  if (p.stage !== 'importing' && p.stage !== 'building') {
    console.log('STAGE:', p.stage, '-', p.message, p.attempt ? `(attempt ${p.attempt})` : '');
  } else if ((p.done ?? 0) % 5000 === 0 || p.done === p.total) {
    console.log('TICK :', p.stage, `${p.done}/${p.total}`);
  }
});
console.log('---');
console.log('progress events emitted:', count);
console.log('result:', JSON.stringify(result));
process.exit(0);
