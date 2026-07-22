import MarketWatcher from '@/components/watch/MarketWatcher';

export const metadata = {
  title: 'Market Watcher | Trading Diary',
  description: 'Monitor stock symbols for extended moves and consecutive candles.',
};

export default function WatchPage() {
  return <MarketWatcher />;
}
