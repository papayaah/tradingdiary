'use client';

import { useSearchParams } from 'next/navigation';
import ReplayExperience from '@/components/replay/ReplayExperience';

export default function ReplayPage() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date');
  const symbol = searchParams.get('symbol');
  const interval = searchParams.get('interval') || '1m';
  const heartbeat = searchParams.get('heartbeat') || '1m';

  return (
    <ReplayExperience
      key={`${date ?? 'latest'}-${symbol ?? 'session'}-${interval}-${heartbeat}`}
      date={date}
      symbol={symbol}
      initialInterval={interval}
      initialHeartbeat={heartbeat}
    />
  );
}
