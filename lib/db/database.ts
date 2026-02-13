import { openDB, type IDBPDatabase } from 'idb';
import type { TradingDiaryDB } from './schema';

let dbPromise: Promise<IDBPDatabase<TradingDiaryDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TradingDiaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TradingDiaryDB>('tradingdiary', 1, {
      upgrade(db) {
        db.createObjectStore('accounts', { keyPath: 'accountId' });

        const txStore = db.createObjectStore('transactions', { keyPath: 'tradeId' });
        txStore.createIndex('by-date', 'date');
        txStore.createIndex('by-symbol', 'symbol');
        txStore.createIndex('by-date-symbol', ['date', 'symbol']);
        txStore.createIndex('by-accountId', 'accountId');

        const posStore = db.createObjectStore('positions', {
          keyPath: 'id',
          autoIncrement: true,
        });
        posStore.createIndex('by-accountId', 'accountId');
        posStore.createIndex('by-symbol', 'symbol');

        db.createObjectStore('dailyNotes', { keyPath: ['date', 'accountId'] });
        db.createObjectStore('tradeNotes', { keyPath: ['date', 'symbol', 'accountId'] });
      },
    });
  }
  return dbPromise;
}
