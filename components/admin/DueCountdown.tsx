'use client';

import { useEffect, useState } from 'react';

function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function cadenceLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h cadence`;
  if (seconds % 60 === 0) return `${seconds / 60}m cadence`;
  return `${seconds}s cadence`;
}

export function DueCountdown({
  dueAt,
  cadenceSeconds,
}: {
  dueAt: string;
  cadenceSeconds: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const dueAtMs = Date.parse(dueAt);
  const secondsRemaining = Number.isFinite(dueAtMs)
    ? Math.max(0, Math.ceil((dueAtMs - now) / 1_000))
    : 0;
  const dueLabel = secondsRemaining === 0
    ? 'Due now'
    : `Due in ${formatDuration(secondsRemaining)}`;

  return (
    <span
      className="text-[11px] font-mono text-muted"
      title={Number.isFinite(dueAtMs) ? `Scheduled at ${new Date(dueAtMs).toISOString()} (UTC)` : undefined}
    >
      <span className={secondsRemaining <= 10 ? 'text-accent' : undefined}>{dueLabel}</span>
      {' · '}
      {cadenceLabel(cadenceSeconds)}
    </span>
  );
}
