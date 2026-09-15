'use client';

import { useEffect, useState } from 'react';
import { resolveDisplayTimezone } from '@/lib/settings';

const EVENT = 'displaytimezonechange';

/** Notify open views (dashboard, replay) that the display timezone changed. */
export function emitDisplayTimezoneChange(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/**
 * The resolved IANA display timezone, kept in sync with the saved preference.
 * Ordering never depends on this — only how times are labelled.
 */
export function useDisplayTimezone(): string {
  const [timezone, setTimezone] = useState('America/New_York');

  useEffect(() => {
    const sync = () => setTimezone(resolveDisplayTimezone());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return timezone;
}
