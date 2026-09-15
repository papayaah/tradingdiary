'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  getDisplayTimezonePreference,
  setDisplayTimezonePreference,
  deviceTimezone,
  resolveDisplayTimezone,
  type DisplayTimezone,
} from '@/lib/settings';
import { emitDisplayTimezoneChange } from '@/lib/hooks/useDisplayTimezone';

const ZONES: { value: DisplayTimezone; label: string }[] = [
  { value: 'auto', label: 'Automatic (this device)' },
  { value: 'America/New_York', label: 'US Eastern — New York' },
  { value: 'America/Chicago', label: 'US Central — Chicago' },
  { value: 'America/Los_Angeles', label: 'US Pacific — Los Angeles' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'UTC', label: 'UTC' },
];

function nowIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      weekday: 'short',
    }).format(new Date());
  } catch {
    return '';
  }
}

export default function DisplaySettings() {
  const [preference, setPreference] = useState<DisplayTimezone>('auto');
  const [resolved, setResolved] = useState('America/New_York');

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPreference(getDisplayTimezonePreference());
      setResolved(resolveDisplayTimezone());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleChange = (value: DisplayTimezone) => {
    setPreference(value);
    setDisplayTimezonePreference(value);
    const zone = resolveDisplayTimezone(value);
    setResolved(zone);
    emitDisplayTimezoneChange();
    toast.success(`Times now shown in ${value === 'auto' ? `your device zone (${zone})` : zone}`);
  };

  return (
    <div className="bg-card-bg border border-card-border p-6 rounded-2xl shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
          <Clock size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Display Timezone</h2>
          <p className="text-xs text-muted">
            Trade times are recorded from your broker in US Eastern and converted for display.
            Changing this only re-labels times — it never reorders your fills.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">
            Show times in
          </span>
          <select
            value={preference}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full bg-background/60 border border-card-border rounded-xl px-3 py-2 text-sm text-foreground focus:border-accent outline-none"
          >
            {ZONES.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
                {zone.value === 'auto' ? ` — ${deviceTimezone()}` : ''}
              </option>
            ))}
          </select>
        </label>

        <div className="p-3 bg-muted-bg/30 rounded-xl border border-card-border text-xs text-muted">
          Current time in <span className="text-foreground font-semibold">{resolved}</span>:{' '}
          <span className="text-foreground font-mono">{nowIn(resolved)}</span>
        </div>
      </div>
    </div>
  );
}
