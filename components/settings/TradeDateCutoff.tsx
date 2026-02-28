'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { getTradeDateCutoff, setTradeDateCutoff } from '@/lib/settings';

const PRESETS = [
  { label: 'None (use file dates)', value: 'none' },
  { label: '16:00 (Market Close)', value: '16:00' },
  { label: '20:00 (After-Hours End)', value: '20:00' },
  { label: 'Custom', value: 'custom' },
];

export default function TradeDateCutoff() {
  const [cutoff, setCutoff] = useState<string | null>(null);
  const [customTime, setCustomTime] = useState('20:00');
  const [selectedPreset, setSelectedPreset] = useState('none');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = getTradeDateCutoff();
    setCutoff(saved);

    if (saved === null) {
      setSelectedPreset('none');
    } else if (saved === '16:00') {
      setSelectedPreset('16:00');
    } else if (saved === '20:00') {
      setSelectedPreset('20:00');
    } else {
      setSelectedPreset('custom');
      setCustomTime(saved);
    }
    setMounted(true);
  }, []);

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);
    if (presetValue === 'none') {
      setCutoff(null);
      setTradeDateCutoff(null);
    } else if (presetValue === 'custom') {
      setCutoff(customTime);
      setTradeDateCutoff(customTime);
    } else {
      setCutoff(presetValue);
      setTradeDateCutoff(presetValue);
    }
  };

  const handleCustomTimeChange = (time: string) => {
    setCustomTime(time);
    if (selectedPreset === 'custom') {
      setCutoff(time);
      setTradeDateCutoff(time);
    }
  };

  if (!mounted) return null;

  return (
    <div className="bg-card text-card-foreground p-6 rounded-lg border shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-muted" />
        <h3 className="text-lg font-medium">Trade Date Cutoff</h3>
      </div>
      <p className="text-sm text-muted mb-6">
        Trades executed after the cutoff time will be attributed to the next
        trading day. This affects how trades are grouped in the journal and
        dashboard — your original data is not modified.
      </p>

      <div className="space-y-3">
        {PRESETS.map((preset) => (
          <label
            key={preset.value}
            className="flex items-center gap-3 cursor-pointer"
          >
            <input
              type="radio"
              name="cutoff-preset"
              value={preset.value}
              checked={selectedPreset === preset.value}
              onChange={() => handlePresetChange(preset.value)}
              className="accent-accent"
            />
            <span className="text-sm">{preset.label}</span>
          </label>
        ))}
      </div>

      {selectedPreset === 'custom' && (
        <div className="mt-4 ml-7">
          <input
            type="time"
            value={customTime}
            onChange={(e) => handleCustomTimeChange(e.target.value)}
            className="px-3 py-1.5 rounded-md border border-card-border bg-background text-foreground text-sm"
          />
        </div>
      )}

      {cutoff && (
        <div className="mt-4 p-3 rounded-md bg-muted-bg text-sm text-muted">
          Trades after{' '}
          <span className="font-medium text-foreground">{cutoff}</span> will be
          grouped under the next calendar day.
        </div>
      )}
    </div>
  );
}
