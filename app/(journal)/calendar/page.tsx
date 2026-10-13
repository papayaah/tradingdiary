'use client';

import { useEffect, useState } from 'react';
import { useAccount } from '@/contexts/AccountContext';
import { getJournalSummaries } from '@/lib/trading/journal-summaries-cache';
import { onJournalSynced } from '@/lib/journal/sync-bus';
import type { DailySummary } from '@/lib/trading/aggregator';
import PaperCalendar from '@/components/calendar/PaperCalendar';

export default function CalendarPage() {
  const { accounts, selectedAccountId } = useAccount();
  const currency = accounts.find((a) => a.accountId === selectedAccountId)?.currency ?? 'USD';
  const [summaries, setSummaries] = useState<DailySummary[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => onJournalSynced(() => setRefreshKey((k) => k + 1)), []);

  useEffect(() => {
    if (!selectedAccountId) return;
    let active = true;
    getJournalSummaries(selectedAccountId)
      .then((data) => {
        if (active) setSummaries(data);
      })
      .catch(() => {
        if (active) setSummaries([]);
      });
    return () => {
      active = false;
    };
  }, [selectedAccountId, refreshKey]);

  // No account selected (e.g. a brand-new user) resolves immediately to an
  // empty calendar; with an account we wait for the first load.
  const ready = selectedAccountId ? summaries !== null : true;

  return (
    <div
      className="min-h-full bg-paper font-hand text-ink"
      style={{
        backgroundImage: 'radial-gradient(var(--dot) 1.4px, transparent 1.4px)',
        backgroundSize: '22px 22px',
      }}
    >
      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-7">
        {!ready ? (
          <div className="py-24 text-center text-[1.1rem] text-ink-soft">Loading your journal…</div>
        ) : (
          <PaperCalendar summaries={summaries ?? []} currency={currency} />
        )}
      </div>
    </div>
  );
}
