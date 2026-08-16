import { openDB, type IDBPDatabase } from 'idb';
import type { TradingDiaryDB } from './schema';

let dbPromise: Promise<IDBPDatabase<TradingDiaryDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<TradingDiaryDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TradingDiaryDB>('tradingdiary', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
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
        }

        if (oldVersion < 2) {
          // AI trade reviews — stored separately from human notes so they never clobber
          // user input. Indexed by tradeGroupId (now the flat-to-flat trade-group key).
          const reviewStore = db.createObjectStore('tradeAIReviews', { keyPath: 'id' });
          reviewStore.createIndex('by-tradeGroup', 'tradeGroupId');
        }

        if (oldVersion < 3) {
          // Trade notes move from a day+symbol key to one note per flat-to-flat
          // round trip (keyed by the trade-group key). Recreate the store; prior
          // notes were keyed at day+symbol granularity and are not carried over.
          if (db.objectStoreNames.contains('tradeNotes')) {
            db.deleteObjectStore('tradeNotes');
          }
          db.createObjectStore('tradeNotes', { keyPath: 'tradeGroupKey' });
        }
      },
    });
  }
  return dbPromise;
}
